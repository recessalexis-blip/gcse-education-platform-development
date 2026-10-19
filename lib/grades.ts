/**
 * Official Pearson Edexcel International GCSE notional raw-mark grade boundaries per paper.
 * Only papers whose boundaries have been verified against Pearson's published grade boundary
 * documents are listed. A grade is only estimated for a complete paper (full marks available).
 */
export interface PaperBoundaries {
  maxMark: number
  /** Minimum raw mark for each grade. */
  grades: Record<string, number>
  source: string
}

export const GRADE_BOUNDARIES: Record<string, PaperBoundaries> = {
  'physics-new-spec-paper-1-june-2025': {
    maxMark: 110,
    grades: { '9': 83, '8': 73, '7': 64, '6': 56, '5': 49, '4': 42, '3': 35, '2': 28, '1': 22 },
    source: 'Pearson Edexcel June 2025 International GCSE Physics (4PH1) Paper 1P notional grade boundaries',
  },
}

export interface GradeEstimate {
  grade: string | null
  note: string
}

export function estimateGrade(paperId: string | undefined, awarded: number, totalAvailable: number): GradeEstimate {
  if (!paperId) return { grade: null, note: 'Grades are only estimated for full mock papers.' }
  const entry = GRADE_BOUNDARIES[paperId]
  if (!entry) {
    return { grade: null, note: 'Official grade boundaries for this paper have not been added yet, so no grade is estimated.' }
  }
  if (totalAvailable !== entry.maxMark) {
    return {
      grade: null,
      note: `Only ${totalAvailable} of the paper's ${entry.maxMark} marks are available here, so a grade cannot be estimated reliably.`,
    }
  }
  const ordered = Object.entries(entry.grades).sort(([, a], [, b]) => b - a)
  const hit = ordered.find(([, min]) => awarded >= min)
  return {
    grade: hit ? hit[0] : 'U',
    note: `Estimated from ${entry.source}. Automatic marking can under-credit written answers, so treat this as a guide.`,
  }
}
