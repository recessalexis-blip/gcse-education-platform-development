'use client'

import { ArrowUpRight, Atom, Dna, FlaskConical, Globe, Landmark, Sigma } from 'lucide-react'
import { motion } from 'motion/react'
import Link from 'next/link'
import { SUBJECT_IDS, SUBJECTS, type SubjectId } from '@/lib/data/subjects'

const ICONS = {
  maths: Sigma,
  physics: Atom,
  chemistry: FlaskConical,
  biology: Dna,
  history: Landmark,
  geography: Globe,
} as const

export function SubjectCards({
  counts,
}: {
  counts: Record<SubjectId, { papers: number; questions: number; cards: number }>
}) {
  return (
    <div className="grid gap-5 md:grid-cols-3">
      {SUBJECT_IDS.map((id, i) => {
        const s = SUBJECTS[id]
        const Icon = ICONS[id]
        return (
          <motion.div
            key={id}
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={{ duration: 0.6, delay: i * 0.12, ease: [0.22, 1, 0.36, 1] }}
            whileHover={{ y: -8 }}
          >
            <Link
              href={`/flashcards/${id}`}
              className="group relative block overflow-hidden rounded-3xl border border-border bg-card p-7 transition-colors hover:border-[color:var(--c)]"
              style={{ '--c': s.colorVar } as React.CSSProperties}
            >
              <div
                className="absolute -right-16 -top-16 size-56 rounded-full opacity-20 blur-3xl transition-opacity duration-500 group-hover:opacity-50"
                style={{ background: s.colorVar }}
              />
              <div className="relative">
                <span
                  className="grid size-12 place-items-center rounded-2xl"
                  style={{ background: `color-mix(in oklch, ${s.colorVar} 18%, transparent)`, color: s.colorVar }}
                >
                  <Icon className="size-6" aria-hidden />
                </span>
                <h3 className="mt-6 font-display text-2xl font-semibold">{s.name}</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Edexcel iGCSE {s.code} · {s.tagline}
                </p>
                <dl className="mt-6 flex gap-6 text-sm">
                  <div>
                    <dd className="font-display text-xl font-semibold">{counts[id].papers}</dd>
                    <dt className="text-muted-foreground">papers</dt>
                  </div>
                  <div>
                    <dd className="font-display text-xl font-semibold">{counts[id].questions}</dd>
                    <dt className="text-muted-foreground">questions</dt>
                  </div>
                  <div>
                    <dd className="font-display text-xl font-semibold">{counts[id].cards}</dd>
                    <dt className="text-muted-foreground">cards</dt>
                  </div>
                </dl>
                <span
                  className="mt-6 inline-flex items-center gap-1 text-sm font-medium"
                  style={{ color: s.colorVar }}
                >
                  Start a deck
                  <ArrowUpRight
                    className="size-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
                    aria-hidden
                  />
                </span>
              </div>
            </Link>
          </motion.div>
        )
      })}
    </div>
  )
}
