import { monthsBetween } from '../dates'
import type { Rank, StudentProgress } from '../types'

export type RankTrack = 'adulto' | 'infantil'
export const RANK_TRACKS: readonly RankTrack[] = ['adulto', 'infantil']
export const TRACK_LABEL: Record<RankTrack, string> = { adulto: 'Adulto', infantil: 'Infantil' }

/** Trilha de um grau ou aluno (dados em cache antigos não têm o campo: adulto). */
export const trackOf = (x: { track?: string | null } | null | undefined): RankTrack =>
  x?.track === 'infantil' ? 'infantil' : 'adulto'

/** Graus de uma trilha, em ordem. */
export const ranksOfTrack = (ranks: readonly Rank[], track: RankTrack): Rank[] =>
  ranks.filter((r) => trackOf(r) === track).sort((a, b) => a.grade - b.grade)

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
  /** Primeira graduação, apto ao primeiro grau e com tempo para pular direto ao segundo (decisão do professor). */
  skipTo: Rank | null
  /** Graduação infantil: requisito é a idade que o aluno completa no ano. */
  byAge: boolean
  /** Idade que o aluno completa no ano de hoje; null sem data de nascimento. */
  ageThisYear: number | null
  /** Idade exigida pelo próximo grau (infantil). */
  ageNeeded: number | null
  /** Ano em que o aluno completa ageNeeded. */
  ageYear: number | null
  /** Infantil sem data de nascimento cadastrada. */
  missingBirth: boolean
  /** Infantil já graduado neste ano: só no próximo. */
  gradedThisYear: boolean
}

/** Meses desde o início a partir dos quais a primeira graduação pode pular o primeiro grau. */
export const SKIP_FIRST_RANK_MONTHS = 5

export function graduationStatus(
  progress: Pick<StudentProgress, 'current_rank_id' | 'last_graduated_at' | 'attendance_since'> & Partial<Pick<StudentProgress, 'classes_since'>> | undefined,
  ranks: readonly Rank[],
  studentSince: string,
  today: string,
  opts: {
    /** Trilha que o aluno segue; o próximo grau sai dela. */
    track?: RankTrack
    /** Data de nascimento (requisito da graduação infantil). */
    birthDate?: string | null
  } = {},
): GraduationStatus {
  const track = opts.track ?? 'adulto'
  const sorted = ranksOfTrack(ranks, track)
  if (track === 'infantil') return kidsStatus(progress, ranks, sorted, studentSince, today, opts.birthDate ?? null)
  const current = ranks.find((r) => r.id === progress?.current_rank_id) ?? null
  // Grau atual de outra trilha (ex.: criança que passou para o adulto): próximo é o primeiro da trilha.
  const next = current && trackOf(current) === track
    ? (sorted.find((r) => r.grade > current.grade) ?? null)
    : (sorted[0] ?? null)
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
  const eligible = configured && missingClasses === 0 && missingMonths === 0
  const skipTo = !current && eligible && monthsElapsed >= SKIP_FIRST_RANK_MONTHS ? (sorted[1] ?? null) : null

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
    eligible,
    skipTo,
    byAge: false,
    ageThisYear: null,
    ageNeeded: null,
    ageYear: null,
    missingBirth: false,
    gradedThisYear: false,
  }
}

const yearOf = (iso: string) => Number(iso.slice(0, 4))

/**
 * Graduação infantil: pode fazer o grau cuja idade mínima o aluno completa no ano.
 * O primeiro grau (Branco) não pode ser pulado; depois dele vai direto ao maior grau que a idade permite.
 * Uma graduação infantil por ano.
 */
function kidsStatus(
  progress: Parameters<typeof graduationStatus>[0],
  ranks: readonly Rank[],
  sorted: Rank[],
  studentSince: string,
  today: string,
  birthDate: string | null,
): GraduationStatus {
  const thisYear = yearOf(today)
  const ageThisYear = birthDate ? thisYear - yearOf(birthDate) : null
  const found = ranks.find((r) => r.id === progress?.current_rank_id) ?? null
  // Grau de outra trilha não conta: recomeça pelo primeiro grau infantil.
  const current = found && trackOf(found) === 'infantil' ? found : null
  const ahead = current ? sorted.filter((r) => r.grade > current.grade) : sorted.slice(0, 1)
  const reachable = ageThisYear == null ? [] : ahead.filter((r) => r.min_age != null && r.min_age <= ageThisYear)
  const next = reachable.at(-1) ?? ahead[0] ?? null

  const gradedThisYear = !!progress?.last_graduated_at && !!current && yearOf(progress.last_graduated_at) === thisYear
  const ageNeeded = next?.min_age ?? null
  const missingBirth = next != null && ageNeeded != null && !birthDate
  const configured = next != null && ageNeeded != null
  const eligible = configured && ageThisYear != null && ageThisYear >= ageNeeded && !gradedThisYear
  const count = progress?.attendance_since ?? 0
  const classes = Math.max(progress?.classes_since ?? count, count)

  return {
    current: found,
    next,
    count,
    needed: null,
    requiredClasses: null,
    minPercent: null,
    classes,
    rate: classes > 0 ? Math.round((count / classes) * 100) : null,
    monthsElapsed: monthsBetween(progress?.last_graduated_at ?? studentSince, today),
    monthsNeeded: null,
    missingClasses: 0,
    missingMonths: 0,
    configured,
    eligible,
    skipTo: null,
    byAge: true,
    ageThisYear,
    ageNeeded,
    ageYear: birthDate && ageNeeded != null ? yearOf(birthDate) + ageNeeded : null,
    missingBirth,
    gradedThisYear,
  }
}

/** Texto curto do que falta, ex.: "faltam 12 treinos e 2 meses". Vazio se nada falta. */
export function missingLabel(s: GraduationStatus): string {
  if (s.byAge) {
    if (s.missingBirth) return 'falta a data de nascimento'
    if (s.ageNeeded != null && s.ageThisYear != null && s.ageThisYear < s.ageNeeded) return `completa ${s.ageNeeded} anos em ${s.ageYear}`
    if (s.gradedThisYear) return 'já graduou este ano; só no próximo'
    return ''
  }
  const parts: string[] = []
  if (s.missingClasses > 0) parts.push(`${s.missingClasses} ${s.missingClasses === 1 ? 'treino' : 'treinos'}`)
  if (s.missingMonths > 0) parts.push(`${s.missingMonths} ${s.missingMonths === 1 ? 'mês' : 'meses'}`)
  if (!parts.length) return ''
  const single = parts.length === 1 && (s.missingClasses === 1 || (s.missingClasses === 0 && s.missingMonths === 1))
  return `${single ? 'falta' : 'faltam'} ${parts.join(' e ')}`
}
