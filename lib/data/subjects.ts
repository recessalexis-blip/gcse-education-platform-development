export type SubjectId = 'maths' | 'physics' | 'chemistry' | 'biology' | 'history' | 'geography'

export interface SubjectMeta {
  id: SubjectId
  name: string
  code: string
  tagline: string
  colorVar: string
  topics: string[]
}

export const SUBJECTS: Record<SubjectId, SubjectMeta> = {
  maths: {
    id: 'maths',
    name: 'Mathematics',
    code: '4MA1',
    tagline: 'Number, algebra, geometry and data',
    colorVar: 'var(--maths)',
    topics: [
      'Number',
      'Algebra',
      'Graphs',
      'Ratio & Proportion',
      'Geometry',
      'Trigonometry',
      'Statistics & Probability',
    ],
  },
  physics: {
    id: 'physics',
    name: 'Physics',
    code: '4PH1',
    tagline: 'Forces, energy, waves and the universe',
    colorVar: 'var(--physics)',
    topics: [
      'Forces & Motion',
      'Energy',
      'Waves',
      'Electricity',
      'Magnetism',
      'Particles & Matter',
      'Radioactivity',
      'Astrophysics',
    ],
  },
  chemistry: {
    id: 'chemistry',
    name: 'Chemistry',
    code: '4CH1',
    tagline: 'Atoms, reactions, bonding and organic',
    colorVar: 'var(--chemistry)',
    topics: [
      'Atomic Structure & Periodic Table',
      'Bonding & Structure',
      'Chemical Calculations',
      'Reactions & Energetics',
      'Acids, Bases & Salts',
      'Rates & Equilibrium',
      'Organic Chemistry',
      'Inorganic & Analysis',
    ],
  },
  biology: {
    id: 'biology',
    name: 'Biology',
    code: '4BI1',
    tagline: 'Content coming soon',
    colorVar: 'var(--biology)',
    topics: [],
  },
  history: {
    id: 'history',
    name: 'History',
    code: '4HI1',
    tagline: 'Content coming soon',
    colorVar: 'var(--history)',
    topics: [],
  },
  geography: {
    id: 'geography',
    name: 'Geography',
    code: '4GE1',
    tagline: 'Content coming soon',
    colorVar: 'var(--geography)',
    topics: [],
  },
}

export const SUBJECT_IDS = Object.keys(SUBJECTS) as SubjectId[]

export function isSubjectId(value: string): value is SubjectId {
  return value in SUBJECTS
}

/**
 * One creditable point in a mark scheme.
 * `accept` lists alternative phrasings; a phrase may join required keywords with "+"
 * (e.g. "particles+move"). The point is awarded when the student's text contains any alternative.
 * M points are method marks and are credited from working even when the final answer is wrong.
 */
export interface MarkPoint {
  kind?: 'M' | 'A' | 'B' | 'C'
  marks: number
  text: string
  accept?: string[]
}

export interface AnswerSpec {
  type: 'mcq' | 'numeric' | 'short' | 'written'
  marks: number
  prompt: string
  options?: string[]
  /** mcq: index of the correct option. numeric: the number. short: accepted answers (lowercase). */
  answer?: number | string[]
  tolerance?: number
  unit?: string
  markScheme?: MarkPoint[]
  /** Official mark scheme text transcribed from the paper's mark scheme. */
  schemeText?: string
  explanation?: string
}

export interface QuestionPart extends AnswerSpec {
  /** Label shown to the student, e.g. "(a)" or "(b)(ii)". */
  label: string
}

export interface Question extends AnswerSpec {
  id: string
  subject: SubjectId
  topic: string
  difficulty: 1 | 2 | 3
  /** Total marks. For multi-part questions this is the sum of the parts. */
  marks: number
  /** For multi-part questions `prompt` is the stem and the parts are answered separately. */
  parts?: QuestionPart[]
  explanation: string
  /** Set on questions transcribed from an official past paper. */
  paperId?: string
  number?: string
  /** Public paths of diagrams cropped from the question paper. */
  figures?: string[]
}

export interface Flashcard {
  id: string
  subject: SubjectId
  topic: string
  front: string
  back: string
}
