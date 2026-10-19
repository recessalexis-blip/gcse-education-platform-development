import pg from 'pg'

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })

const statements = [
  `CREATE TABLE IF NOT EXISTS "user" (
    "id" text PRIMARY KEY,
    "name" text NOT NULL,
    "email" text NOT NULL UNIQUE,
    "emailVerified" boolean NOT NULL DEFAULT false,
    "image" text,
    "createdAt" timestamp NOT NULL DEFAULT now(),
    "updatedAt" timestamp NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS "session" (
    "id" text PRIMARY KEY,
    "expiresAt" timestamp NOT NULL,
    "token" text NOT NULL UNIQUE,
    "createdAt" timestamp NOT NULL DEFAULT now(),
    "updatedAt" timestamp NOT NULL DEFAULT now(),
    "ipAddress" text,
    "userAgent" text,
    "userId" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS "account" (
    "id" text PRIMARY KEY,
    "accountId" text NOT NULL,
    "providerId" text NOT NULL,
    "userId" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
    "accessToken" text,
    "refreshToken" text,
    "idToken" text,
    "accessTokenExpiresAt" timestamp,
    "refreshTokenExpiresAt" timestamp,
    "scope" text,
    "password" text,
    "createdAt" timestamp NOT NULL DEFAULT now(),
    "updatedAt" timestamp NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS "verification" (
    "id" text PRIMARY KEY,
    "identifier" text NOT NULL,
    "value" text NOT NULL,
    "expiresAt" timestamp NOT NULL,
    "createdAt" timestamp DEFAULT now(),
    "updatedAt" timestamp DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS "flashcard_progress" (
    "id" serial PRIMARY KEY,
    "userId" text NOT NULL,
    "cardId" text NOT NULL,
    "subject" text NOT NULL,
    "ease" double precision NOT NULL DEFAULT 2.5,
    "intervalDays" double precision NOT NULL DEFAULT 0,
    "reps" integer NOT NULL DEFAULT 0,
    "lapses" integer NOT NULL DEFAULT 0,
    "dueAt" timestamp NOT NULL DEFAULT now(),
    "lastReviewedAt" timestamp
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "flashcard_progress_user_card" ON "flashcard_progress" ("userId", "cardId")`,
  `CREATE TABLE IF NOT EXISTS "flashcard_reviews" (
    "id" serial PRIMARY KEY,
    "userId" text NOT NULL,
    "cardId" text NOT NULL,
    "subject" text NOT NULL,
    "rating" integer NOT NULL,
    "reviewedAt" timestamp NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS "flashcard_reviews_user" ON "flashcard_reviews" ("userId", "reviewedAt")`,
  `CREATE TABLE IF NOT EXISTS "question_attempts" (
    "id" serial PRIMARY KEY,
    "userId" text NOT NULL,
    "questionId" text NOT NULL,
    "subject" text NOT NULL,
    "topic" text NOT NULL,
    "correct" boolean NOT NULL,
    "timeMs" integer NOT NULL DEFAULT 0,
    "mode" text NOT NULL DEFAULT 'untimed',
    "createdAt" timestamp NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS "question_attempts_user" ON "question_attempts" ("userId", "createdAt")`,
  `CREATE TABLE IF NOT EXISTS "quiz_sessions" (
    "id" serial PRIMARY KEY,
    "userId" text NOT NULL,
    "subject" text NOT NULL,
    "topic" text NOT NULL,
    "mode" text NOT NULL,
    "total" integer NOT NULL,
    "correct" integer NOT NULL,
    "durationSec" integer NOT NULL DEFAULT 0,
    "createdAt" timestamp NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS "quiz_sessions_user" ON "quiz_sessions" ("userId", "createdAt")`,
  `CREATE TABLE IF NOT EXISTS "paper_progress" (
    "id" serial PRIMARY KEY,
    "userId" text NOT NULL,
    "paperKey" text NOT NULL,
    "score" integer,
    "completedAt" timestamp NOT NULL DEFAULT now()
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "paper_progress_user_paper" ON "paper_progress" ("userId", "paperKey")`,
  `CREATE TABLE IF NOT EXISTS "exam_attempts" (
    "id" serial PRIMARY KEY,
    "userId" text NOT NULL,
    "kind" text NOT NULL,
    "subject" text NOT NULL,
    "paperId" text,
    "label" text NOT NULL,
    "totalMarks" integer NOT NULL,
    "awardedMarks" integer NOT NULL,
    "grade" text,
    "durationSec" integer NOT NULL DEFAULT 0,
    "createdAt" timestamp NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS "exam_attempts_user" ON "exam_attempts" ("userId", "createdAt")`,
  `CREATE TABLE IF NOT EXISTS "review_questions" (
    "id" serial PRIMARY KEY,
    "userId" text NOT NULL,
    "questionId" text NOT NULL,
    "subject" text NOT NULL,
    "topic" text NOT NULL,
    "timesWrong" integer NOT NULL DEFAULT 1,
    "lastWrongAt" timestamp NOT NULL DEFAULT now(),
    "resolvedAt" timestamp
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "review_questions_user_question" ON "review_questions" ("userId", "questionId")`,
  `CREATE INDEX IF NOT EXISTS "question_attempts_question" ON "question_attempts" ("questionId")`,
  `ALTER TABLE "question_attempts" ADD COLUMN IF NOT EXISTS "marksAwarded" integer NOT NULL DEFAULT 0`,
  `ALTER TABLE "question_attempts" ADD COLUMN IF NOT EXISTS "marksMax" integer NOT NULL DEFAULT 1`,
  `ALTER TABLE "question_attempts" ADD COLUMN IF NOT EXISTS "flagged" boolean NOT NULL DEFAULT false`,
]

for (const sql of statements) {
  await pool.query(sql)
}
console.log(`Applied ${statements.length} statements`)
await pool.end()
