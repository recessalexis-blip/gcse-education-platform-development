"""
Imports questions, marks and official mark schemes from the Edexcel past-paper PDFs
listed in lib/data/papers.json into lib/data/paper-questions.json.

Usage: python scripts/import-papers.py [--subject physics] [--limit N] [--paper <id>]

A question is only written when its part marks add up to the printed "Total for Question"
and every part has a matching mark-scheme row with the same mark total. Everything else is
recorded in lib/data/import-report.json so nothing unverified reaches students.
"""
import json, os, re, sys, hashlib, urllib.request, urllib.parse
from concurrent.futures import ThreadPoolExecutor
import pymupdf

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = '/tmp/papers-cache'
FIG_DIR = os.path.join(ROOT, 'public', 'papers')
os.makedirs(CACHE, exist_ok=True)

GLYPHS = {'\uf03c': '<', '\uf0a3': '≤', '\uf0b3': '≥', '\uf03e': '>', '\uf0b4': '×', '\uf0b0': '°', '\uf0d7': '·',
          '\xa0': ' ', '\u2009': ' ', '\u202f': ' ', '\u2212': '-', '\u2013': '-', '\uf02d': '-', '\uf0b8': '÷', '\uf0b1': '±'}
ROMAN = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x', 'xi', 'xii']
SKIP_QP = re.compile(r'^(DO NOT WRITE|PMT|Turn over|\*P\d+|BLANK PAGE|Answer ALL|Some questions must|answer, put a line|and then mark your|Write your answers|Leave blank|\uf0a2)', re.I)


def clean(t):
    for k, v in GLYPHS.items():
        t = t.replace(k, v)
    return re.sub(r'\s+', ' ', t).strip()


def fetch(url):
    path = os.path.join(CACHE, hashlib.md5(url.encode()).hexdigest() + '.pdf')
    if not os.path.exists(path):
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=60) as r, open(path + '.tmp', 'wb') as f:
            f.write(r.read())
        os.rename(path + '.tmp', path)
    return path


def lines_of(page):
    out = []
    for b in page.get_text('dict')['blocks']:
        for l in b.get('lines', []):
            t = clean(''.join(s['text'] for s in l['spans']))
            if t:
                out.append({'x0': l['bbox'][0], 'y0': l['bbox'][1], 'x1': l['bbox'][2], 'y1': l['bbox'][3], 'text': t})
    return out


def figure_rects(page):
    rects = []
    small = []
    for img in page.get_image_info():
        r = pymupdf.Rect(img['bbox'])
        if r.width >= 40 and r.height >= 30 and r.y0 > 40 and r.y1 < 800:
            rects.append(r)
    for d in page.get_drawings():
        r = pymupdf.Rect(d['rect'])
        if r.width > 520 or r.height > 600 or r.y0 < 40 or r.y1 > 800 or r.x1 < 0 or r.x0 > 580:
            continue
        if r.width < 0.5 and r.height < 0.5:
            continue
        small.append(r)
    for r in small:
        rects.append(r)
    # plain lists: pymupdf.Rect arithmetic is far too slow for pages with thousands of vector paths
    def touches(a, b, pad):
        return a[0] - pad <= b[2] and b[0] - pad <= a[2] and a[1] - pad <= b[3] and b[1] - pad <= a[3]

    def union_into(a, b):
        a[0], a[1], a[2], a[3] = min(a[0], b[0]), min(a[1], b[1]), max(a[2], b[2]), max(a[3], b[3])

    merged = []
    for r in sorted(rects, key=lambda r: (r.y0, r.x0)):
        box = [r.x0, r.y0, r.x1, r.y1]
        for m in merged:
            if touches(m, box, 6):
                union_into(m, box)
                break
        else:
            merged.append(box)
    changed = True
    while changed:
        changed = False
        for i in range(len(merged)):
            for j in range(i + 1, len(merged)):
                if touches(merged[i], merged[j], 8):
                    union_into(merged[i], merged[j])
                    del merged[j]
                    changed = True
                    break
            if changed:
                break
    return [pymupdf.Rect(m) for m in merged if m[2] - m[0] >= 50 and m[3] - m[1] >= 30]


def next_label(kind_state, token):
    """Classify (a)/(i) tokens into letter or roman parts using expected sequences."""
    t = token.strip('()')
    exp_letter = chr(ord(kind_state['letter']) + 1) if kind_state['letter'] else 'a'
    exp_roman = ROMAN[ROMAN.index(kind_state['roman']) + 1] if kind_state['roman'] else 'i'
    if t == exp_roman and t != exp_letter and (kind_state['letter'] or kind_state['roman']):
        return 'roman'
    if t == exp_letter:
        return 'letter'
    if t == exp_roman:
        return 'roman'
    return None


def key_of(q, st):
    return f"{q}" + (f".{st['letter']}" if st['letter'] else '') + (f".{st['roman']}" if st['roman'] else '')


def label_of(key):
    bits = key.split('.')[1:]
    return ''.join(f'({b})' for b in bits)


# ---------------------------------------------------------------- question papers

def parse_qp(path, paper_id):
    doc = pymupdf.open(path)
    questions = {}
    totals = {}
    cur_q = 0
    st = {'letter': '', 'roman': ''}
    cur = None
    figs_todo = []
    for pno, page in enumerate(doc):
        rects = figure_rects(page)
        page_rows = lines_of(page)
        for r in rects:
            figs_todo.append((pno, r))
        # merge text lines on the same visual row
        rows = []
        for l in sorted(page_rows, key=lambda l: (round(l['y0'] / 3), l['x0'])):
            if any((r + (2, 2, -2, -2)).contains(pymupdf.Rect(l['x0'], l['y0'], l['x1'], l['y1'])) for r in rects):
                continue
            if l['y0'] > 790 or l['y1'] < 20 or SKIP_QP.match(l['text']):
                continue
            is_mark = bool(re.match(r'^\(\d+\)$', l['text'])) and l['x0'] > 400
            if rows and not is_mark and not rows[-1].get('mark') and abs(rows[-1]['y0'] - l['y0']) <= 3:
                rows[-1]['text'] += ' ' + l['text']
                rows[-1]['x1'] = l['x1']
            else:
                rows.append(dict(l, mark=is_mark))
        for row in rows:
            t, x0 = row['text'], row['x0']
            m_total = re.match(r'^\(Total for Question (\d+) (?:is|=) (\d+) marks?\)', t)
            if m_total:
                totals[int(m_total.group(1))] = int(m_total.group(2))
                cur = None
                continue
            if t.upper().startswith('TOTAL FOR PAPER') or t.startswith('END OF'):
                cur = None
                continue
            m_marks = re.match(r'^\((\d+)\)$', t)
            if m_marks and x0 > 400 and cur is not None:
                cur['marks'] = int(m_marks.group(1))
                continue
            m_q = re.match(r'^(\d{1,2})(?:\s+(.*))?$', t)
            if x0 < 52 and m_q and int(m_q.group(1)) == cur_q + 1:
                cur_q += 1
                st = {'letter': '', 'roman': ''}
                questions[cur_q] = {'stem': [], 'nodes': [], 'page': pno}
                cur = {'key': str(cur_q), 'lines': [], 'marks': None, 'y': row['y0'], 'page': pno, 'stem': True}
                questions[cur_q]['nodes'].append(cur)
                if m_q.group(2):
                    cur['lines'].append(m_q.group(2))
                continue
            if cur_q == 0 or cur_q not in questions or (cur is None and not re.match(r'^\(', t)):
                if cur is None and cur_q in questions and not re.match(r'^\(', t):
                    cur = questions[cur_q]['nodes'][-1]
                else:
                    continue
            m_part = re.match(r'^(\([a-z]{1,4}\))\s*(.*)$', t)
            if m_part and x0 < 110 and cur_q in questions:
                tok = m_part.group(1)
                kind = next_label(st, tok)
                if kind:
                    inner = tok.strip('()')
                    if kind == 'letter':
                        st = {'letter': inner, 'roman': ''}
                    else:
                        st = {'letter': st['letter'], 'roman': inner}
                    cur = {'key': key_of(cur_q, st), 'lines': [], 'marks': None, 'y': row['y0'], 'page': pno}
                    questions[cur_q]['nodes'].append(cur)
                    if m_part.group(2):
                        cur['lines'].append(m_part.group(2))
                    continue
            if cur is not None:
                cur['lines'].append(t)
    # assign figures to nodes by (page, y)
    figures = []
    for pno, r in figs_todo:
        owner = None
        for qn, q in questions.items():
            for node in q['nodes']:
                if (node['page'], node['y']) <= (pno, r.y0 + 2):
                    owner = (qn, node['key'])
        figures.append((pno, r, owner))
    return questions, totals, figures, doc


def render_figures(doc, figures, paper_id, subject):
    out = {}
    d = os.path.join(FIG_DIR, paper_id)
    for i, (pno, r, owner) in enumerate(figures):
        if owner is None:
            continue
        qn, key = owner
        os.makedirs(d, exist_ok=True)
        name = f'q{qn}-{i}.jpg'
        pix = doc[pno].get_pixmap(clip=r + (-4, -4, 4, 4), dpi=96)
        pix.save(os.path.join(d, name), jpg_quality=70)
        out.setdefault((qn, key), []).append(f'/papers/{paper_id}/{name}')
    return out


# ---------------------------------------------------------------- mark schemes

def parse_ms(path, subject):
    doc = pymupdf.open(path)
    cols = None
    rows = []  # {'key','answer':[], 'notes':[], 'marks':[], 'working':[]}
    cur_q = 0
    st = {'letter': '', 'roman': ''}
    for page in doc:
        ls = lines_of(page)
        ans = next((l for l in ls if l['text'] == 'Answer'), None)
        hdr_marks = next((l for l in ls if l['text'] in ('Marks', 'Mark')), None)
        notes_h = next((l for l in ls if l['text'] == 'Notes'), None)
        work_h = next((l for l in ls if l['text'] == 'Working'), None)
        if ans and hdr_marks:
            if subject == 'maths':
                cols = {'ans': ans['x0'] - 10, 'work': (work_h or ans)['x0'] - 140, 'mark': hdr_marks['x0'] - 6,
                        'notes': hdr_marks['x0'] + 65}
            else:
                cols = {'ans': ans['x0'] - 8, 'notes': (notes_h['x0'] - 4) if notes_h else ans['x0'] + 220,
                        'mark': hdr_marks['x0'] - 6}
            cols.pop('label_end', None)
            hdr_y = max(l['y1'] for l in ls if l in (ans, hdr_marks, notes_h, work_h) and l)
            for l in ls:
                if l['text'].lower() in ('question', 'number', 'q') and l['y0'] < hdr_y + 20:
                    hdr_y = max(hdr_y, l['y1'])
        elif cols is None:
            continue
        else:
            hdr_y = 30
        label_x = cols['work'] if subject == 'maths' else cols['ans']
        if subject != 'maths':
            from collections import Counter
            cand = [l for l in ls if l['y0'] > hdr_y and not re.match(r'^(\d{1,2}|\([a-z]{1,4}\))(\s+\(?[a-z0-9]{1,4}\)?)*$', l['text'])
                    and not re.match(r'^(\d{1,2}\s+)?\([a-z]{1,4}\)\s', l['text'])]
            left = Counter(round(l['x0']) for l in cand if 100 <= l['x0'] < cols['mark'] - 150)
            if left and left.most_common(1)[0][1] >= 2:
                cols['label_end'] = left.most_common(1)[0][0]
                right = Counter(round(l['x0']) for l in cand if cols['label_end'] + 100 <= l['x0'] < cols['mark'] - 10)
                if right and right.most_common(1)[0][1] >= 2:
                    cols['notes'] = right.most_common(1)[0][0] - 4
            label_x = cols.get('label_end', label_x)
        body = [l for l in ls if l['y0'] > hdr_y - 1 and l['y0'] < 800 and l['text'] != 'PMT'
                and not l['text'].startswith(('Total for Question', 'Question number', 'Answer', 'Notes', 'Marks'))]
        labels = []
        split_body = []
        for l in body:
            m = re.match(r'^((?:\d{1,2}\s+)?(?:\([a-z]{1,4}\)\s*)+)(\S.*)$', l['text'])
            if m and l['x0'] < label_x - 2 and l['x1'] >= label_x - 2:
                lab = m.group(1).strip()
                split_body.append(dict(l, text=lab, x1=label_x - 3))
                split_body.append(dict(l, text=m.group(2), x0=label_x + 1))
            else:
                split_body.append(l)
        body = split_body
        for l in sorted(body, key=lambda l: (l['y0'], l['x0'])):
            if l['x0'] < label_x - 2 and l['x1'] < label_x + 6 and re.match(r'^(\d{1,2}|\([a-z]{1,4}\))(\s+\(?[a-z0-9]{1,4}\)?)*$', l['text']):
                for tok in l['text'].split():
                    labels.append((l['y0'], tok))
        seg = []  # (y0, key)
        for y, tok in labels:
            if tok.isdigit():
                if int(tok) == cur_q + 1 or (cur_q == 0 and int(tok) == 1):
                    cur_q = int(tok)
                    st = {'letter': '', 'roman': ''}
                    if seg and abs(seg[-1][0] - y) <= 3:
                        seg[-1] = (seg[-1][0], str(cur_q))
                    else:
                        seg.append((y, str(cur_q)))
                continue
            if cur_q == 0:
                continue
            kind = next_label(st, tok)
            if not kind:
                continue
            inner = tok.strip('()')
            st = {'letter': inner, 'roman': ''} if kind == 'letter' else {'letter': st['letter'], 'roman': inner}
            k = key_of(cur_q, st)
            if seg and abs(seg[-1][0] - y) <= 3:
                seg[-1] = (seg[-1][0], k)
            else:
                seg.append((y, k))
        # content before first label on a continuation page belongs to previous row
        starts = [s[0] for s in seg]
        for l in body:
            if l['x0'] < label_x - 2 and l['x1'] < label_x + 6:
                continue
            idx = -1
            for i, y in enumerate(starts):
                if l['y0'] >= y - 4:
                    idx = i
            if idx == -1:
                row = rows[-1] if rows else None
            else:
                key = seg[idx][1]
                if not rows or rows[-1]['key'] != key or rows[-1]['_seg'] != (id(page), idx):
                    rows.append({'key': key, 'answer': [], 'notes': [], 'marks': [], 'working': [], '_seg': (id(page), idx)})
                row = rows[-1]
            if row is None:
                continue
            x = l['x0']
            if subject == 'maths':
                if x >= cols['notes'] - 4:
                    row['notes'].append(l['text'])
                elif x >= cols['mark'] - 4:
                    row['marks'].append(l['text'])
                elif x >= cols['ans'] - 4:
                    row['answer'].append(l['text'])
                else:
                    row['working'].append(l['text'])
            else:
                if x >= cols['mark']:
                    row['marks'].append(l['text'])
                elif x >= cols['notes']:
                    row['notes'].append(l['text'])
                else:
                    row['answer'].append(l['text'])
    # make sure rows with the same key (split over pages) merge
    merged = {}
    order = []
    for r in rows:
        if r['key'] not in merged:
            merged[r['key']] = r
            order.append(r['key'])
        else:
            for f in ('answer', 'notes', 'marks', 'working'):
                merged[r['key']][f] += r[f]
    return [merged[k] for k in order]


STOP = set('the a an of to in and or is are be it that this with for as by on at from into than then its their they them there which when what idea allow ignore accept condone reject must can may not any one two three from more less'.split())


def accept_for(text):
    """Turn a mark-point sentence into keyword alternatives used for automatic comparison."""
    text = re.sub(r'\([^)]*\)', ' ', text)
    alts = re.split(r'/|;| or ', text)
    out = []
    for a in alts:
        words = [w for w in re.findall(r"[a-zA-Z]{4,}", a.lower()) if w not in STOP]
        if not words:
            continue
        words = sorted(set(words), key=lambda w: -len(w))[:3]
        out.append('+'.join(w[:6] if len(w) > 7 else w for w in words))
    return list(dict.fromkeys(out))[:6]


NUM_RE = re.compile(r'^\(?[^0-9\-+]{0,30}?\)?\s*(-?\d+(?:\.\d+)?)\s*(?:\(?[A-Za-zΩ°%/ ²³\-\.]{0,14}\)?)?;?$')


def numeric_of(answer_lines, subject):
    cand = [a for a in answer_lines if re.search(r'\d', a)]
    if not cand:
        return None
    last = cand[-1].replace(',', '')
    if len(cand) > 1 and subject != 'maths':
        last = cand[-1].replace(',', '')
    m = NUM_RE.match(last.strip())
    if not m:
        return None
    if re.search(r'[a-zA-Z]{3,}\s+[a-zA-Z]{3,}', last):
        return None
    try:
        return float(m.group(1))
    except ValueError:
        return None


def build_spec(leaf_marks, row, qp_prompt, qp_options, subject):
    answer_lines = row['answer']
    notes = row['notes']
    spec = {'marks': leaf_marks, 'prompt': qp_prompt}
    verbatim = '\n'.join(answer_lines + (['Notes: ' + ' '.join(notes)] if notes and subject != 'maths' else []))
    if subject == 'maths':
        verbatim = '\n'.join(filter(None, [
            ' '.join(row['answer']) and 'Answer: ' + ' '.join(row['answer']),
            ' '.join(row['working']) and 'Working: ' + ' '.join(row['working']),
            ' '.join(notes) and 'Notes: ' + ' '.join(notes)]))
    spec['schemeText'] = verbatim
    first = (answer_lines[0] if answer_lines else '').strip()
    mc = re.match(r'^([A-D])(?:\s|;|$|\()', first)
    if subject != 'maths' and mc and leaf_marks == 1 and (len(qp_options) >= 2 or 'cross' in qp_prompt.lower() or 'box' in qp_prompt.lower()):
        letters = ['A', 'B', 'C', 'D']
        opts = qp_options if len(qp_options) >= 2 else letters
        spec.update({'type': 'mcq', 'options': opts, 'answer': letters.index(mc.group(1)),
                     'markScheme': [{'kind': 'B', 'marks': 1, 'text': ' '.join(answer_lines)}]})
        return spec
    if subject == 'maths':
        codes = []
        for txt in row['marks'] + notes:
            for m in re.finditer(r'\b([MABCP])(\d)\b', txt):
                codes.append((m.group(1), int(m.group(2))))
        # codes repeated in notes ("M1 for ...") duplicate those in the mark column; keep the mark column first
        mark_codes = []
        for txt in row['marks']:
            for m in re.finditer(r'\b([MABCP])(\d)\b', txt):
                mark_codes.append((m.group(1), int(m.group(2))))
        use = mark_codes or codes
        points, total = [], 0
        for kind, n in use:
            if total + n > leaf_marks:
                break
            points.append({'kind': 'M' if kind == 'P' else kind, 'marks': n, 'text': f'{kind}{n}'})
            total += n
        value = numeric_of([' '.join(row['answer'])], subject) if row['answer'] else None
        if total != leaf_marks:
            points = [{'kind': 'A', 'marks': leaf_marks, 'text': ' '.join(row['answer']) or 'See mark scheme'}]
        for p in points:
            if p['kind'] == 'M':
                exprs = [w for w in row['working'] if re.search(r'\d', w) and re.search(r'[+\-×x/=]', w)]
                p['accept'] = [e.replace('(', '').replace(')', '') for e in exprs[:4]]
        if value is not None:
            spec.update({'type': 'numeric', 'answer': value, 'tolerance': 0 if float(value).is_integer() else abs(value) * 0.005,
                         'markScheme': points})
            u = re.search(r'(°|%|cm|m|mm|km|kg|g|s|£|\$)\s*$', ' '.join(row['answer']))
            if u:
                spec['unit'] = u.group(1)
        else:
            ans_text = ' '.join(row['answer'])
            for p in points:
                if p['kind'] in ('A', 'B', 'C') and ans_text:
                    p['accept'] = [ans_text]
            spec.update({'type': 'written', 'markScheme': points})
        return spec
    # physics / chemistry
    value = numeric_of(answer_lines, subject) if (leaf_marks >= 1 and any(re.search(r'evaluation|substitut|calculat', a, re.I) for a in answer_lines) or (leaf_marks <= 2 and len(answer_lines) <= 2 and numeric_of(answer_lines, subject) is not None)) else None
    pts_text, buf = [], []
    for ln in answer_lines:
        if re.match(r'^(any\s+\w+\s+from|MP\d+\.)', ln, re.I) and buf and not buf[-1].endswith(';'):
            pts_text.append(' '.join(buf)); buf = []
        buf.append(re.sub(r'^MP\d+\.\s*', '', ln))
        if ln.endswith(';'):
            pts_text.append(' '.join(buf)); buf = []
    if buf:
        pts_text.append(' '.join(buf))
    pts_text = [p for p in pts_text if not re.match(r'^any\s+\w+\s+from', p, re.I) or len(p) > 25] or [' '.join(answer_lines)]
    pts_text = [p.rstrip(';') for p in pts_text]
    marks_each = [1] * len(pts_text)
    if len(pts_text) < leaf_marks:
        extra = leaf_marks - len(pts_text)
        for i in range(extra):
            marks_each[-(i % len(marks_each)) - 1] += 1
    points = []
    for i, (txt, mk) in enumerate(zip(pts_text, marks_each)):
        kind = 'B'
        if value is not None:
            kind = 'A' if i == len(pts_text) - 1 else 'M'
        p = {'kind': kind, 'marks': mk, 'text': txt}
        if value is None:
            acc = accept_for(txt)
            if acc:
                p['accept'] = acc
        points.append(p)
    if value is not None:
        spec.update({'type': 'numeric', 'answer': value, 'tolerance': abs(value) * 0.01, 'markScheme': points})
        u = re.search(r'\(?\s*([A-Za-zΩ°%/²³]{1,8})\s*\)?;?$', answer_lines[-1] if answer_lines else '')
        if u and not re.match(r'^[eE]\d', u.group(1)):
            spec['unit'] = u.group(1)
    else:
        spec.update({'type': 'written', 'markScheme': points})
    return spec


def node_prompt(node):
    lines = [l for l in node['lines'] if not re.match(r'^[.\s]+$', l)]
    text = '\n'.join(re.sub(r'\.{4,}', '____', l) for l in lines)
    return text.strip()


def option_lines(node):
    opts, expect = [], 'A'
    for ln in node['lines']:
        m = re.match(r'^([A-D])\s+(.+)$', ln)
        if m and m.group(1) == expect:
            opts.append(m.group(2))
            expect = chr(ord(expect) + 1)
    return opts if len(opts) >= 2 else []


def strip_options(node):
    out, expect = [], 'A'
    for ln in node['lines']:
        m = re.match(r'^([A-D])\s+(.+)$', ln)
        if m and m.group(1) == expect:
            expect = chr(ord(expect) + 1)
            continue
        out.append(ln)
    return out


def import_paper(p):
    subject = p['subject']
    qp_path, ms_path = fetch(p['qp']), fetch(p['ms'])
    qs, totals, figures, qdoc = parse_qp(qp_path, p['id'])
    ms_rows = parse_ms(ms_path, subject)
    ms_by_key = {}
    for r in ms_rows:
        ms_by_key.setdefault(r['key'], r)
    fig_map = render_figures(qdoc, figures, p['id'], subject)
    good, report = [], []
    for qn in sorted(qs):
        q = qs[qn]
        nodes = q['nodes']
        leaves = [n for n in nodes if n['marks'] is not None]
        single_marks = nodes[0]['marks']
        if single_marks is not None:
            totals.setdefault(qn, single_marks)
            leaves = []
        problems = []
        if qn not in totals:
            problems.append('no printed question total')
        elif leaves and sum(n['marks'] for n in leaves) != totals[qn]:
            problems.append(f"part marks {sum(n['marks'] for n in leaves)} != printed total {totals.get(qn)}")
        built_parts = []
        stem_node = nodes[0]
        stem = node_prompt(stem_node)
        carry = ''
        for n in nodes[1:]:
            if n['marks'] is None:
                carry += (('\n' if carry else '') + node_prompt(n)) if node_prompt(n) else ''
                continue
            row = ms_by_key.get(n['key'])
            if row is None:
                problems.append(f"no mark scheme row for {n['key']}")
                continue
            ms_marks = None
            for t in row['marks']:
                m = re.match(r'^(\d+)(?:\s|$)', t)
                if m:
                    ms_marks = int(m.group(1)); break
            if ms_marks is not None and ms_marks != n['marks']:
                problems.append(f"{n['key']}: mark scheme marks {ms_marks} != question marks {n['marks']}")
                continue
            opts = option_lines(n)
            body = dict(n, lines=strip_options(n) if opts else n['lines'])
            prompt = (carry + '\n' if carry else '') + node_prompt(body)
            carry = ''
            spec = build_spec(n['marks'], row, prompt.strip(), opts, subject)
            spec['label'] = label_of(n['key'])
            figs = fig_map.get((qn, n['key']))
            if figs:
                spec['figures'] = figs
            built_parts.append(spec)
        if not leaves:
            # single-part question: marks and mark scheme sit on the question number itself
            row = ms_by_key.get(str(qn))
            marks_total = totals.get(qn)
            if row is None or marks_total is None:
                problems.append('no mark scheme row')
            else:
                spec = build_spec(marks_total, row, stem, option_lines(stem_node), subject)
                spec['label'] = ''
                built_parts.append(spec)
        qid = f"{p['id']}-q{qn}"
        if problems or not built_parts:
            report.append({'question': qid, 'problems': problems or ['no parts']})
            continue
        stem_figs = fig_map.get((qn, str(qn)))
        question = {'id': qid, 'subject': subject, 'paperId': p['id'], 'number': str(qn), 'topic': 'Past paper questions',
                    'difficulty': 2, 'marks': sum(x['marks'] for x in built_parts), 'explanation': ''}
        if len(built_parts) == 1 and built_parts[0]['label'] == '' and not leaves:
            question.update({k: v for k, v in built_parts[0].items() if k != 'label'})
        else:
            question.update({'type': 'written', 'prompt': stem, 'parts': built_parts})
            if stem_figs:
                question['figures'] = stem_figs
        good.append(question)
    return {'paper': p['id'], 'questions': good, 'rejected': report, 'questionCount': len(qs)}


def main():
    args = sys.argv[1:]
    papers = json.load(open(os.path.join(ROOT, 'lib/data/papers.json')))
    if '--subject' in args:
        papers = [p for p in papers if p['subject'] == args[args.index('--subject') + 1]]
    if '--paper' in args:
        papers = [p for p in papers if p['id'] == args[args.index('--paper') + 1]]
    if '--limit' in args:
        papers = papers[: int(args[args.index('--limit') + 1])]
    papers = [p for p in papers if p.get('ms')]

    def run(p):
        try:
            print('start', p['id'], flush=True)
            return import_paper(p)
        except Exception as e:  # keep going; the failure is reported
            return {'paper': p['id'], 'questions': [], 'rejected': [{'question': p['id'], 'problems': [f'paper failed: {e!r}']}], 'questionCount': 0}

    out_q = os.path.join(ROOT, 'lib/data/paper-questions.json')
    out_r = os.path.join(ROOT, 'lib/data/import-report.json')
    allq = json.load(open(out_q)) if os.path.exists(out_q) else []
    report = json.load(open(out_r)) if os.path.exists(out_r) else []
    done = {r['paper'] for r in report}
    if '--force' in args:
        done = set()
    papers = [p for p in papers if p['id'] not in done]
    print('to import', len(papers), flush=True)

    def save():
        json.dump(allq, open(out_q + '.tmp', 'w'), ensure_ascii=False, separators=(',', ':'))
        os.replace(out_q + '.tmp', out_q)
        json.dump(report, open(out_r + '.tmp', 'w'), indent=1, ensure_ascii=False)
        os.replace(out_r + '.tmp', out_r)

    with ThreadPoolExecutor(6) as ex:
        for r in ex.map(run, papers):
            allq[:] = [q for q in allq if q['paperId'] != r['paper']] + r['questions']
            report[:] = [x for x in report if x['paper'] != r['paper']] + [{'paper': r['paper'], 'found': r['questionCount'], 'imported': len(r['questions']), 'rejected': r['rejected']}]
            save()
            print('done', r['paper'], r['questionCount'], len(r['questions']), flush=True)
    print(f'papers {len(report)}  questions found {sum(x["found"] for x in report)}  imported {sum(x["imported"] for x in report)}')


if __name__ == '__main__':
    main()
