import { monthsBetween } from '../dates'
import type { Rank, StudentProgress } from '../types'

export interface GraduationStatus {
  /** Grau atual; null = aluno ainda sem graduação. */
  current: Rank | null
  /** Próximo grau sugerido (sem graduação: o primeiro grau). Pode-se pular graus ao registrar. */
  next: Rank | null
  /** Presenças que contam desde a última graduação (ou desde o início). */
  count: number
  /** Aulas do período: presenças + faltas desde a última graduação. */
  classes: number
  /** % de presença sobre as aulas do período. null se ainda não houve aula. */
  percent: number | null
  /** % mínima exigida pelo próximo grau. */
  minPercent: number | null
  /** Presenças mínimas exigidas pelo próximo grau. */
  minPresences: number | null
  monthsElapsed: number
  monthsNeeded: number | null
  /** Presenças que ainda faltam para cumprir o mínimo absoluto e o % (supondo que não falte mais). */
  missingClasses: number
  /** O % exigido é inalcançável (100% com alguma falta). */
  percentUnreachable: boolean
  missingMonths: number
  /** O próximo grau tem algum requisito configurado? */
  configured: boolean
  eligible: boolean
}

/** Presenças seguidas necessárias para que count/classes chegue a minPercent. */
function presencesToReach(count: number, classes: number, minPercent: number): number {
  if (classes > 0 && count * 100 >= minPercent * classes) return 0
  if (minPercent >= 100) return classes === count ? 0 : Number.POSITIVE_INFINITY
  return Math.max(1, Math.ceil((minPercent * classes - 100 * count) / (100 - minPercent)))
}

export function graduationStatus(
  progress: Pick<StudentProgress, 'current_rank_id' | 'last_graduated_at' | 'attendance_since' | 'classes_since'> | undefined,
  ranks: readonly Rank[],
  studentSince: string,
  today: string,
): GraduationStatus {
  const sorted = [...ranks].sort((a, b) => a.grade - b.grade)
  const current = sorted.find((r) => r.id === progress?.current_rank_id) ?? null
  const next = current ? (sorted.find((r) => r.grade > current.grade) ?? null) : (sorted[0] ?? null)
  const count = progress?.attendance_since ?? 0
  // Caches antigos não têm classes_since; nunca menor que as presenças.
  const classes = Math.max(progress?.classes_since ?? count, count)

  const minPercent = next?.min_percent ?? null
  const minPresences = next?.required_classes ?? null
  const percent = classes > 0 ? Math.floor((count / classes) * 100) : null

  const monthsNeeded = next?.min_months ?? null
  const monthsElapsed = monthsBetween(progress?.last_graduated_at ?? studentSince, today)

  const byPercent = minPercent == null ? 0 : presencesToReach(count, classes, minPercent)
  const percentUnreachable = !Number.isFinite(byPercent)
  const byMinimum = minPresences == null ? 0 : Math.max(0, minPresences - count)
  const missingClasses = percentUnreachable ? byMinimum : Math.max(byPercent, byMinimum)
  const missingMonths = monthsNeeded == null ? 0 : Math.max(0, monthsNeeded - monthsElapsed)
  const configured = next != null && (minPercent != null || minPresences != null || monthsNeeded != null)

  return {
    current,
    next,
    count,
    classes,
    percent,
    minPercent,
    minPresences,
    monthsElapsed,
    monthsNeeded,
    missingClasses,
    percentUnreachable,
    missingMonths,
    configured,
    eligible: configured && missingClasses === 0 && !percentUnreachable && missingMonths === 0,
  }
}

/** Texto curto do que falta, ex.: "falta 3 presenças e 2 meses". Vazio se nada falta. */
export function missingLabel(s: GraduationStatus): string {
  const parts: string[] = []
  if (s.percentUnreachable) parts.push(`presença abaixo de ${s.minPercent}%`)
  if (s.missingClasses > 0) parts.push(`${s.missingClasses} ${s.missingClasses === 1 ? 'presença' : 'presenças'}`)
  if (s.missingMonths > 0) parts.push(`${s.missingMonths} ${s.missingMonths === 1 ? 'mês' : 'meses'}`)
  return parts.length ? `falta ${parts.join(' e ')}` : ''
}
