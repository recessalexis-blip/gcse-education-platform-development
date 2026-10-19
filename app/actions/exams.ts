'use server'

import { PAPER_BY_ID, PAPER_AVAILABILITY, QUESTION_BY_ID } from '@/lib/data'
import { db } from '@/lib/db'
import { examAttempts, questionAttempts, quizSessions, reviewQuestions } from '@/lib/db/schema'
import { estimateGrade, type GradeEstimate } from '@/lib/grades'
import { markQuestion, type PartResponse } from '@/lib/marking'
import { getSession } from '@/lib/session'
import { and, eq, inArray, sql } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'

export interface AttemptAnswer {
  questionId: string
  responses: PartResponse[]
  timeMs: number
}

export interface SubmitAttemptInput {
  kind: 'quiz' | 'mock' | 'review'
  mode: 'timed' | 'untimed'
  subject: string
  label: string
  paperId?: string
  durationSec: number
  answers: AttemptAnswer[]
}

export interface QuestionStat {
  attempts: number
  fullMarks: number
}

export interface SubmitAttemptResult {
  saved: boolean
  grade: GradeEstimate
  stats: Record<string, QuestionStat>
}

const MAX_ANSWERS = 300
const MAX_TEXT = 4000

function clean(responses: PartResponse[]): PartResponse[] {
  return responses.slice(0, 20).map((r) => ({
    answer: String(r?.answer ?? '').slice(0, MAX_TEXT),
    working: r?.working ? String(r.working).slice(0, MAX_TEXT) : undefined,
  }))
}

export async function getQuestionStats(ids: string[]): Promise<Record<string, QuestionStat>> {
  const unique = [...new Set(ids)].filter((id) => QUESTION_BY_ID.has(id)).slice(0, 500)
  if (unique.length === 0) return {}
  const rows = await db
    .select({
      questionId: questionAttempts.questionId,
      attempts: sql<number>`count(*)::int`,
      fullMarks: sql<number>`count(*) filter (where ${questionAttempts.marksAwarded} >= ${questionAttempts.marksMax})::int`,
    })
    .from(questionAttempts)
    .where(inArray(questionAttempts.questionId, unique))
    .groupBy(questionAttempts.questionId)
  return Object.fromEntries(rows.map((r) => [r.questionId, { attempts: r.attempts, fullMarks: r.fullMarks }]))
}

export async function submitAttempt(input: SubmitAttemptInput): Promise<SubmitAttemptResult> {
  const session = await getSession()
  const userId = session?.user?.id ?? null

  const answers = input.answers
    .filter((a) => QUESTION_BY_ID.has(a.questionId))
    .slice(0, MAX_ANSWERS)
    .map((a) => ({ ...a, responses: clean(a.responses ?? []) }))

  const marked = answers.map((a) => {
    const q = QUESTION_BY_ID.get(a.questionId)!
    return { a, q, mark: markQuestion(q, a.responses) }
  })

  const paper = input.paperId ? PAPER_BY_ID.get(input.paperId) : undefined
  const available = input.paperId ? PAPER_AVAILABILITY[input.paperId]?.marks ?? 0 : 0
  const awardedTotal = marked.reduce((sum, m) => sum + m.mark.awarded, 0)
  const maxTotal = marked.reduce((sum, m) => sum + m.mark.max, 0)
  const grade = input.kind === 'mock' && paper ? estimateGrade(input.paperId, awardedTotal, available) : estimateGrade(undefined, 0, 0)

  let saved = false
  if (userId && marked.length > 0) {
    // Mock papers count unanswered questions as attempts; quizzes only count questions the student answered.
    const toStore = marked.filter((m) => input.kind === 'mock' || m.mark.answered)

    if (toStore.length > 0) {
      await db.insert(questionAttempts).values(
        toStore.map((m) => ({
          userId,
          questionId: m.q.id,
          subject: m.q.subject,
          topic: m.q.topic,
          correct: m.mark.awarded >= m.mark.max,
          marksAwarded: m.mark.awarded,
          marksMax: m.mark.max,
          flagged: m.mark.flagged,
          timeMs: Math.max(0, Math.min(Math.round(m.a.timeMs), 3_600_000)),
          mode: input.mode,
        })),
      )
    }

    for (const m of toStore) {
      const full = m.mark.awarded >= m.mark.max
      // Flagged written answers may be under-marked, so they never create or clear a review entry on their own.
      if (full) {
        await db
          .update(reviewQuestions)
          .set({ resolvedAt: new Date() })
          .where(and(eq(reviewQuestions.userId, userId), eq(reviewQuestions.questionId, m.q.id)))
      } else if (!(m.mark.flagged && m.mark.awarded > 0)) {
        await db
          .insert(reviewQuestions)
          .values({ userId, questionId: m.q.id, subject: m.q.subject, topic: m.q.topic })
          .onConflictDoUpdate({
            target: [reviewQuestions.userId, reviewQuestions.questionId],
            set: {
              timesWrong: sql`${reviewQuestions.timesWrong} + 1`,
              lastWrongAt: new Date(),
              resolvedAt: null,
            },
          })
      }
    }

    const duration = Math.max(0, Math.min(Math.round(input.durationSec), 86_400))
    const label = input.label.slice(0, 200)
    await db.insert(quizSessions).values({
      userId,
      subject: input.subject,
      topic: label,
      mode: input.mode,
      total: marked.length,
      correct: marked.filter((m) => m.mark.awarded >= m.mark.max).length,
      durationSec: duration,
    })
    if (input.kind === 'mock') {
      await db.insert(examAttempts).values({
        userId,
        kind: input.kind,
        subject: input.subject,
        paperId: input.paperId ?? null,
        label,
        totalMarks: maxTotal,
        awardedMarks: awardedTotal,
        grade: grade.grade,
        durationSec: duration,
      })
    }
    saved = true
    revalidatePath('/dashboard')
  }

  const stats = await getQuestionStats(marked.map((m) => m.q.id))
  return { saved, grade, stats }
}
