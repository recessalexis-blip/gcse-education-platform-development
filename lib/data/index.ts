import { chemistryCards } from './cards-chemistry'
import { mathsCards } from './cards-maths'
import { physicsCards } from './cards-physics'
import { chemistryQuestions } from './questions-chemistry'
import { mathsQuestions } from './questions-maths'
import { physicsQuestions } from './questions-physics'
import paperQuestionsJson from './paper-questions.json'
import papersJson from './papers.json'
import type { Flashcard, Question, SubjectId } from './subjects'

export const PAPER_QUESTIONS = paperQuestionsJson as unknown as Question[]

const paperQuestionsBySubject = (subject: SubjectId) => PAPER_QUESTIONS.filter((q) => q.subject === subject)

export const QUESTIONS: Record<SubjectId, Question[]> = {
  maths: [...mathsQuestions, ...paperQuestionsBySubject('maths')],
  physics: [...physicsQuestions, ...paperQuestionsBySubject('physics')],
  chemistry: [...chemistryQuestions, ...paperQuestionsBySubject('chemistry')],
  biology: [],
  history: [],
  geography: [],
}

export const CARDS: Record<SubjectId, Flashcard[]> = {
  maths: mathsCards,
  physics: physicsCards,
  chemistry: chemistryCards,
  biology: [],
  history: [],
  geography: [],
}

export const ALL_CARDS: Flashcard[] = Object.values(CARDS).flat()
export const CARD_BY_ID = new Map(ALL_CARDS.map((c) => [c.id, c]))

export const ALL_QUESTIONS: Question[] = Object.values(QUESTIONS).flat()
export const QUESTION_BY_ID = new Map(ALL_QUESTIONS.map((q) => [q.id, q]))

export interface PastPaper {
  id: string
  subject: SubjectId
  board: string
  paper: string
  series: string
  year: number
  resit: boolean
  label: string
  qp: string
  ms: string | null
  ma: string | null
}

export const PAPERS = papersJson as PastPaper[]

export const PAPER_BY_ID = new Map(PAPERS.map((p) => [p.id, p]))

export function questionsForPaper(paperId: string): Question[] {
  return PAPER_QUESTIONS.filter((q) => q.paperId === paperId).sort(
    (a, b) => Number(a.number) - Number(b.number),
  )
}

/** Number of transcribed questions and marks available per paper. */
export const PAPER_AVAILABILITY: Record<string, { questions: number; marks: number }> = (() => {
  const map: Record<string, { questions: number; marks: number }> = {}
  for (const q of PAPER_QUESTIONS) {
    if (!q.paperId) continue
    const entry = (map[q.paperId] ??= { questions: 0, marks: 0 })
    entry.questions += 1
    entry.marks += q.marks
  }
  return map
})()

export function paperGroupLabel(paper: string): string {
  return paper.replace('New-Spec-', '').replace('-', ' ')
}

export function papersForSubject(subject: SubjectId) {
  const rows = PAPERS.filter((p) => p.subject === subject)
  const groups = new Map<string, PastPaper[]>()
  for (const p of rows) {
    const list = groups.get(p.paper) ?? []
    list.push(p)
    groups.set(p.paper, list)
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([paper, items]) => ({ paper, label: paperGroupLabel(paper), items }))
}
