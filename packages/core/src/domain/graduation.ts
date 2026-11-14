import { monthsBetween } from '../dates'
import type { Rank, StudentProgress } from '../types'

export interface GraduationStatus {
  /** Grau atual; null = aluno ainda sem graduação. */
  current: Rank | null
  /** Próximo grau sugerido (sem graduação: o primeiro grau). Pode-se pular graus ao registrar. */
  next: Rank | null
  /** Treinos que contam desde a última graduação (ou desde o início). */
  count: number
  /** Treinos exigidos = ceil(required_classes × % mínima). null se o grau não exige. */
  needed: number | null
  /** Quantidade de treinos da tabela do grau. */
  requiredClasses: number | null
  /** % mínima da quantidade (ex.: 80 nos graus com *). null = 100%. */
  minPercent: number | null
  /** Aulas do período (presenças + faltas) — informativo. */
  classes: number
  /** Frequência sobre as aulas do período — informativo. */
  rate: number | null
  monthsElapsed: number
  monthsNeeded: number | null
  missingClasses: number
  missingMonths: number
  /** O próximo grau tem algum requisito configurado? */
  configured: boolean
  eligible: boolean
}

export function graduationStatus(
  progress: Pick<StudentProgress, 'current_rank_id' | 'last_graduated_at' | 'attendance_since'> & Partial<Pick<StudentProgress, 'classes_since'>> | undefined,
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

  const requiredClasses = next?.required_classes ?? null
  const minPercent = next?.min_percent ?? null
  const needed = requiredClasses == null ? null : Math.ceil((requiredClasses * (minPercent ?? 100)) / 100)

  const monthsNeeded = next?.min_months ?? null
  const monthsElapsed = monthsBetween(progress?.last_graduated_at ?? studentSince, today)

  const missingClasses = needed == null ? 0 : Math.max(0, needed - count)
  const missingMonths = monthsNeeded == null ? 0 : Math.max(0, monthsNeeded - monthsElapsed)
  const configured = next != null && (needed != null || monthsNeeded != null)

  return {
    current,
    next,
    count,
    needed,
    requiredClasses,
    minPercent,
    classes,
    rate: classes > 0 ? Math.round((count / classes) * 100) : null,
    monthsElapsed,
    monthsNeeded,
    missingClasses,
    missingMonths,
    configured,
    eligible: configured && missingClasses === 0 && missingMonths === 0,
  }
}

/** Texto curto do que falta, ex.: "faltam 12 treinos e 2 meses". Vazio se nada falta. */
export function missingLabel(s: GraduationStatus): string {
  const parts: string[] = []
  if (s.missingClasses > 0) parts.push(`${s.missingClasses} ${s.missingClasses === 1 ? 'treino' : 'treinos'}`)
  if (s.missingMonths > 0) parts.push(`${s.missingMonths} ${s.missingMonths === 1 ? 'mês' : 'meses'}`)
  if (!parts.length) return ''
  const single = parts.length === 1 && (s.missingClasses === 1 || (s.missingClasses === 0 && s.missingMonths === 1))
  return `${single ? 'falta' : 'faltam'} ${parts.join(' e ')}`
}
