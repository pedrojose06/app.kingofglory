import { monthsBetween } from '../dates'
import type { Rank, StudentProgress } from '../types'

export interface GraduationStatus {
  /** Grau atual; sem graduação registrada o aluno é tratado como grau 1 (Branco). */
  current: Rank | null
  next: Rank | null
  /** Presenças que contam desde a última graduação. */
  count: number
  /** Presenças necessárias = ceil(aulas de referência × % mínima). null se o grau não tem requisito. */
  needed: number | null
  requiredClasses: number | null
  minPercent: number | null
  /** % de presença sobre as aulas de referência. */
  percent: number | null
  monthsElapsed: number
  monthsNeeded: number | null
  missingClasses: number
  missingMonths: number
  /** O próximo grau tem algum requisito configurado? */
  configured: boolean
  eligible: boolean
}

export function graduationStatus(
  progress: Pick<StudentProgress, 'current_rank_id' | 'last_graduated_at' | 'attendance_since'> | undefined,
  ranks: readonly Rank[],
  studentSince: string,
  today: string,
): GraduationStatus {
  const sorted = [...ranks].sort((a, b) => a.grade - b.grade)
  const current =
    sorted.find((r) => r.id === progress?.current_rank_id) ?? sorted.find((r) => r.grade === 1) ?? null
  const next = current ? (sorted.find((r) => r.grade === current.grade + 1) ?? null) : null
  const count = progress?.attendance_since ?? 0

  const requiredClasses = next?.required_classes ?? null
  const minPercent = next?.min_percent ?? null
  const needed = requiredClasses == null ? null : Math.ceil((requiredClasses * (minPercent ?? 100)) / 100)
  const percent = requiredClasses ? Math.round((count / requiredClasses) * 100) : null

  const monthsNeeded = next?.min_months ?? null
  const monthsElapsed = monthsBetween(progress?.last_graduated_at ?? studentSince, today)

  const missingClasses = needed == null ? 0 : Math.max(0, needed - count)
  const missingMonths = monthsNeeded == null ? 0 : Math.max(0, monthsNeeded - monthsElapsed)
  const configured = !!next && (needed != null || monthsNeeded != null)

  return {
    current,
    next,
    count,
    needed,
    requiredClasses,
    minPercent,
    percent,
    monthsElapsed,
    monthsNeeded,
    missingClasses,
    missingMonths,
    configured,
    eligible: configured && missingClasses === 0 && missingMonths === 0,
  }
}
