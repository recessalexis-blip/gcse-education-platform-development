import type { AnswerSpec, MarkPoint, Question } from '@/lib/data/subjects'

export interface PartResponse {
  answer: string
  working?: string
}

export interface PointMark {
  kind?: MarkPoint['kind']
  marks: number
  text: string
  awarded: boolean
}

export interface PartMark {
  label: string
  awarded: number
  max: number
  answered: boolean
  points: PointMark[]
  /** True when automatic marking cannot be trusted and the student should compare against the mark scheme. */
  flagged: boolean
  note?: string
}

export interface QuestionMark {
  awarded: number
  max: number
  answered: boolean
  flagged: boolean
  parts: PartMark[]
}

export type MarkablePart = AnswerSpec & { label: string }

/** Parts of a question; a single-part question is treated as one unlabelled part. */
export function getParts(q: Question): MarkablePart[] {
  if (q.parts && q.parts.length > 0) return q.parts
  return [{ ...q, label: '' }]
}

function squash(text: string): string {
  return text
    .toLowerCase()
    .replace(/×/g, 'x')
    .replace(/[^a-z0-9.^/=+\-*()]/g, '')
}

function wordsOnly(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function matchesPhrase(text: string, phrase: string, loose: boolean): boolean {
  const haystack = loose ? wordsOnly(text) : squash(text)
  return phrase
    .split('+')
    .map((token) => (loose ? wordsOnly(token) : squash(token)))
    .filter(Boolean)
    .every((token) => haystack.includes(token))
}

function pointEarned(point: MarkPoint, text: string, loose: boolean): boolean {
  return (point.accept ?? []).some((phrase) => matchesPhrase(text, phrase, loose))
}

function parseNumber(raw: string): number | null {
  const cleaned = raw.replace(/[£$€%°,\s]/g, '').replace(/^[a-z]+=/i, '')
  if (cleaned === '' || Number.isNaN(Number(cleaned))) return null
  return Number(cleaned)
}

export function checkAnswer(part: AnswerSpec, raw: string | number): boolean {
  if (part.type === 'mcq') return Number(raw) === part.answer
  if (part.type === 'numeric') {
    const value = parseNumber(String(raw))
    if (value === null) return false
    return Math.abs(value - (part.answer as number)) <= (part.tolerance ?? 0) + 1e-9
  }
  if (part.type === 'short') return (part.answer as string[]).includes(String(raw).trim().toLowerCase())
  return false
}

export function displayAnswer(part: AnswerSpec): string {
  if (part.type === 'mcq') return part.options![part.answer as number]
  if (part.type === 'numeric') {
    return `${part.answer as number}${part.unit && part.unit !== '£' ? ` ${part.unit}` : ''}`
  }
  if (part.type === 'short') return (part.answer as string[])[0]
  return (part.markScheme ?? []).map((p) => p.text).join('; ')
}

function toPointMarks(points: MarkPoint[] | undefined, awardedFor: (p: MarkPoint) => boolean): PointMark[] {
  return (points ?? []).map((p) => ({ kind: p.kind, marks: p.marks, text: p.text, awarded: awardedFor(p) }))
}

export function markPart(part: MarkablePart, response: PartResponse | undefined): PartMark {
  const answer = (response?.answer ?? '').trim()
  const working = (response?.working ?? '').trim()
  const base = { label: part.label, max: part.marks }

  if (answer === '' && working === '') {
    return { ...base, awarded: 0, answered: false, points: toPointMarks(part.markScheme, () => false), flagged: false }
  }

  if (part.type === 'mcq' || part.type === 'short') {
    const ok = checkAnswer(part, answer)
    return {
      ...base,
      awarded: ok ? part.marks : 0,
      answered: true,
      points: toPointMarks(part.markScheme, () => ok),
      flagged: false,
    }
  }

  if (part.type === 'numeric') {
    const ok = checkAnswer(part, answer)
    if (ok) {
      return { ...base, awarded: part.marks, answered: true, points: toPointMarks(part.markScheme, () => true), flagged: false }
    }
    const scheme = part.markScheme ?? []
    const methodPoints = scheme.filter((p) => p.kind === 'M' && p.accept?.length)
    const text = `${answer}\n${working}`
    const points = toPointMarks(scheme, (p) => p.kind === 'M' && pointEarned(p, text, false))
    const awarded = Math.min(
      part.marks - 1 < 0 ? 0 : part.marks - 1,
      points.filter((p) => p.awarded).reduce((sum, p) => sum + p.marks, 0),
    )
    const hasUncheckableWorking = working !== '' && methodPoints.length === 0
    return {
      ...base,
      awarded,
      answered: true,
      points,
      flagged: hasUncheckableWorking,
      note: hasUncheckableWorking ? 'Your working could not be marked automatically. Compare it with the mark scheme.' : undefined,
    }
  }

  const scheme = part.markScheme
  if (!scheme || scheme.length === 0) {
    return {
      ...base,
      awarded: 0,
      answered: true,
      points: [],
      flagged: true,
      note: 'This written answer cannot be marked automatically. Compare it with the model answer.',
    }
  }
  const points = toPointMarks(scheme, (p) => pointEarned(p, `${answer}\n${working}`, true))
  const awarded = Math.min(
    part.marks,
    points.filter((p) => p.awarded).reduce((sum, p) => sum + p.marks, 0),
  )
  return {
    ...base,
    awarded,
    answered: true,
    points,
    flagged: awarded < part.marks,
    note:
      awarded < part.marks
        ? 'Keyword matching can miss valid rewordings. Check the mark scheme in case you earned more.'
        : undefined,
  }
}

export function markQuestion(q: Question, responses: PartResponse[]): QuestionMark {
  const parts = getParts(q).map((part, i) => markPart(part, responses[i]))
  return {
    awarded: parts.reduce((sum, p) => sum + p.awarded, 0),
    max: parts.reduce((sum, p) => sum + p.max, 0),
    answered: parts.some((p) => p.answered),
    flagged: parts.some((p) => p.flagged),
    parts,
  }
}
