import {
  boolean,
  doublePrecision,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core'

// Better Auth required tables. Column names are camelCase to match its defaults.

export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('emailVerified').notNull().default(false),
  image: text('image'),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
  updatedAt: timestamp('updatedAt').notNull().defaultNow(),
})

export const session = pgTable('session', {
  id: text('id').primaryKey(),
  expiresAt: timestamp('expiresAt').notNull(),
  token: text('token').notNull().unique(),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
  updatedAt: timestamp('updatedAt').notNull().defaultNow(),
  ipAddress: text('ipAddress'),
  userAgent: text('userAgent'),
  userId: text('userId')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
})

export const account = pgTable('account', {
  id: text('id').primaryKey(),
  accountId: text('accountId').notNull(),
  providerId: text('providerId').notNull(),
  userId: text('userId')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  accessToken: text('accessToken'),
  refreshToken: text('refreshToken'),
  idToken: text('idToken'),
  accessTokenExpiresAt: timestamp('accessTokenExpiresAt'),
  refreshTokenExpiresAt: timestamp('refreshTokenExpiresAt'),
  scope: text('scope'),
  password: text('password'),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
  updatedAt: timestamp('updatedAt').notNull().defaultNow(),
})

export const verification = pgTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expiresAt').notNull(),
  createdAt: timestamp('createdAt').defaultNow(),
  updatedAt: timestamp('updatedAt').defaultNow(),
})

// App tables. Every row is scoped by a plain userId column.

export const flashcardProgress = pgTable(
  'flashcard_progress',
  {
    id: serial('id').primaryKey(),
    userId: text('userId').notNull(),
    cardId: text('cardId').notNull(),
    subject: text('subject').notNull(),
    ease: doublePrecision('ease').notNull().default(2.5),
    intervalDays: doublePrecision('intervalDays').notNull().default(0),
    reps: integer('reps').notNull().default(0),
    lapses: integer('lapses').notNull().default(0),
    dueAt: timestamp('dueAt').notNull().defaultNow(),
    lastReviewedAt: timestamp('lastReviewedAt'),
  },
  (t) => [uniqueIndex('flashcard_progress_user_card').on(t.userId, t.cardId)],
)

export const flashcardReviews = pgTable('flashcard_reviews', {
  id: serial('id').primaryKey(),
  userId: text('userId').notNull(),
  cardId: text('cardId').notNull(),
  subject: text('subject').notNull(),
  rating: integer('rating').notNull(),
  reviewedAt: timestamp('reviewedAt').notNull().defaultNow(),
})

export const questionAttempts = pgTable('question_attempts', {
  id: serial('id').primaryKey(),
  userId: text('userId').notNull(),
  questionId: text('questionId').notNull(),
  subject: text('subject').notNull(),
  topic: text('topic').notNull(),
  correct: boolean('correct').notNull(),
  timeMs: integer('timeMs').notNull().default(0),
  mode: text('mode').notNull().default('untimed'),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
})

export const quizSessions = pgTable('quiz_sessions', {
  id: serial('id').primaryKey(),
  userId: text('userId').notNull(),
  subject: text('subject').notNull(),
  topic: text('topic').notNull(),
  mode: text('mode').notNull(),
  total: integer('total').notNull(),
  correct: integer('correct').notNull(),
  durationSec: integer('durationSec').notNull().default(0),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
})

export const paperProgress = pgTable(
  'paper_progress',
  {
    id: serial('id').primaryKey(),
    userId: text('userId').notNull(),
    paperKey: text('paperKey').notNull(),
    score: integer('score'),
    completedAt: timestamp('completedAt').notNull().defaultNow(),
  },
  (t) => [uniqueIndex('paper_progress_user_paper').on(t.userId, t.paperKey)],
)

export const examAttempts = pgTable('exam_attempts', {
  id: serial('id').primaryKey(),
  userId: text('userId').notNull(),
  kind: text('kind').notNull(),
  subject: text('subject').notNull(),
  paperId: text('paperId'),
  label: text('label').notNull(),
  totalMarks: integer('totalMarks').notNull(),
  awardedMarks: integer('awardedMarks').notNull(),
  grade: text('grade'),
  durationSec: integer('durationSec').notNull().default(0),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
})

export const reviewQuestions = pgTable(
  'review_questions',
  {
    id: serial('id').primaryKey(),
    userId: text('userId').notNull(),
    questionId: text('questionId').notNull(),
    subject: text('subject').notNull(),
    topic: text('topic').notNull(),
    timesWrong: integer('timesWrong').notNull().default(1),
    lastWrongAt: timestamp('lastWrongAt').notNull().defaultNow(),
    resolvedAt: timestamp('resolvedAt'),
  },
  (t) => [uniqueIndex('review_questions_user_question').on(t.userId, t.questionId)],
)
