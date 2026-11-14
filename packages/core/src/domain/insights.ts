// Análise de frequência: alunos sumindo (faltas seguidas) e padrões de lotação das aulas.
// Só aponta como padrão o que se sustenta nos números; diferença pequena com poucas aulas é ruído.

import { addDays, weekdayOf, WEEKDAYS } from '../dates'

export interface AbsenceStreak {
  student_id: string
  gym_id: string
  last_present_on: string | null
  absences_in_row: number
}

export interface ClassTurnout {
  class_id: string
  gym_id: string
  date: string
  present: number
}

/** Alunos que passaram do limite de faltas seguidas, quem está há mais tempo sem vir primeiro. */
export function absenceAlerts(streaks: readonly AbsenceStreak[], threshold: number): AbsenceStreak[] {
  return streaks
    .filter((s) => s.absences_in_row > threshold)
    .sort((a, b) => b.absences_in_row - a.absences_in_row || (a.last_present_on ?? '').localeCompare(b.last_present_on ?? ''))
}

export interface Bucket {
  key: string
  label: string
  classes: number
  /** Média de alunos presentes por aula. */
  mean: number
}

export type Strength = 'strong' | 'weak'

export interface Insight {
  gymId: string
  kind: 'period' | 'weekday' | 'trend'
  strength: Strength
  /** Diferença relativa entre o grupo mais cheio e o mais vazio (0.2 = 20%). */
  change: number
  /** Frase sem o nome da academia (a tela mostra a academia junto). */
  text: string
}

export interface GymTurnout {
  gymId: string
  classes: number
  mean: number
  byPeriod: Bucket[]
  byWeekday: Bucket[]
  trend: { recent: Bucket; previous: Bucket } | null
  insights: Insight[]
}

/** Mínimo de aulas num grupo para ele entrar na comparação. */
export const MIN_BUCKET_CLASSES = 6
/** Dia da semana só entra na comparação se tiver ao menos esta fração das aulas (exclui aulas extras avulsas). */
export const REGULAR_WEEKDAY_SHARE = 0.2
/** Mínimo de aulas da academia para mostrar a análise. */
export const MIN_GYM_CLASSES = 12
const STRONG_T = 2
const WEAK_T = 1.3
const MIN_CHANGE = 0.1
const TREND_DAYS = 56

const PERIODS = [
  { key: 'start', label: 'início do mês (dias 1–10)', short: 'Início (1–10)', test: (d: number) => d <= 10 },
  { key: 'mid', label: 'meio do mês (dias 11–20)', short: 'Meio (11–20)', test: (d: number) => d > 10 && d <= 20 },
  { key: 'end', label: 'fim do mês (dias 21–31)', short: 'Fim (21–31)', test: (d: number) => d > 20 },
] as const

interface Stats {
  n: number
  mean: number
  variance: number
}

function stats(values: readonly number[]): Stats {
  const n = values.length
  const mean = n === 0 ? 0 : values.reduce((s, v) => s + v, 0) / n
  const variance = n < 2 ? 0 : values.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1)
  return { n, mean, variance }
}

/** Estatística t de Welch: quão longe as médias estão, considerando a variação e o tamanho de cada grupo. */
export function welchT(a: readonly number[], b: readonly number[]): number {
  const x = stats(a)
  const y = stats(b)
  const diff = Math.abs(x.mean - y.mean)
  const se = Math.sqrt(x.variance / Math.max(x.n, 1) + y.variance / Math.max(y.n, 1))
  if (se === 0) return diff === 0 ? 0 : Infinity
  return diff / se
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const fmt = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

function strengthOf(t: number, change: number): Strength | null {
  if (change < MIN_CHANGE) return null
  if (t >= STRONG_T) return 'strong'
  if (t >= WEAK_T) return 'weak'
  return null
}

interface Group {
  key: string
  label: string
  short: string
  values: number[]
}

/** Compara o grupo mais cheio com o mais vazio entre os que têm aulas suficientes. */
function compareGroups(groups: readonly Group[]): { high: Group; low: Group; t: number; change: number } | null {
  const eligible = groups.filter((g) => g.values.length >= MIN_BUCKET_CLASSES)
  if (eligible.length < 2) return null
  const byMean = [...eligible].sort((a, b) => stats(b.values).mean - stats(a.values).mean)
  const high = byMean[0]!
  const low = byMean[byMean.length - 1]!
  const hi = stats(high.values).mean
  const lo = stats(low.values).mean
  if (hi === 0) return null
  return { high, low, t: welchT(high.values, low.values), change: (hi - lo) / hi }
}

const toBucket = (g: Group): Bucket => ({ key: g.key, label: g.short, classes: g.values.length, mean: stats(g.values).mean })

/** Análise por academia. `today` é o dia de referência da tendência (últimas 8 semanas contra as 8 anteriores). */
export function analyzeTurnout(rows: readonly ClassTurnout[], today: string): GymTurnout[] {
  const byGym = new Map<string, ClassTurnout[]>()
  for (const r of rows) byGym.set(r.gym_id, [...(byGym.get(r.gym_id) ?? []), r])

  const out: GymTurnout[] = []
  for (const [gymId, list] of byGym) {
    if (list.length < MIN_GYM_CLASSES) continue
    const all = stats(list.map((r) => r.present))
    const insights: Insight[] = []

    const periods: Group[] = PERIODS.map((p) => ({
      key: p.key,
      label: p.label,
      short: p.short,
      values: list.filter((r) => p.test(Number(r.date.slice(8, 10)))).map((r) => r.present),
    }))
    const period = compareGroups(periods)
    if (period) {
      const strength = strengthOf(period.t, period.change)
      if (strength) {
        insights.push({
          gymId,
          kind: 'period',
          strength,
          change: period.change,
          text: `O ${period.high.label} tem mais alunos: ${fmt(stats(period.high.values).mean)} por aula, contra ${fmt(stats(period.low.values).mean)} no ${period.low.label}.`,
        })
      }
    }

    const weekdays: Group[] = WEEKDAYS.map((label, wd) => ({
      key: String(wd),
      label: label.toLowerCase(),
      short: label,
      values: list.filter((r) => weekdayOf(r.date) === wd).map((r) => r.present),
    })).filter((g) => g.values.length >= Math.max(MIN_BUCKET_CLASSES, REGULAR_WEEKDAY_SHARE * list.length))
    const weekday = compareGroups(weekdays)
    if (weekday) {
      const strength = strengthOf(weekday.t, weekday.change)
      if (strength) {
        insights.push({
          gymId,
          kind: 'weekday',
          strength,
          change: weekday.change,
          text: `${capitalize(weekday.high.label)} enche mais que ${weekday.low.label}: ${fmt(stats(weekday.high.values).mean)} alunos por aula, contra ${fmt(stats(weekday.low.values).mean)}.`,
        })
      }
    }

    const cut = addDays(today, -TREND_DAYS)
    const cutPrev = addDays(today, -2 * TREND_DAYS)
    const recent: Group = { key: 'recent', label: 'últimas 8 semanas', short: 'Últimas 8 semanas', values: list.filter((r) => r.date > cut && r.date <= today).map((r) => r.present) }
    const previous: Group = { key: 'previous', label: '8 semanas anteriores', short: '8 semanas anteriores', values: list.filter((r) => r.date > cutPrev && r.date <= cut).map((r) => r.present) }
    let trend: GymTurnout['trend'] = null
    if (recent.values.length >= MIN_BUCKET_CLASSES && previous.values.length >= MIN_BUCKET_CLASSES) {
      trend = { recent: toBucket(recent), previous: toBucket(previous) }
      const r = stats(recent.values).mean
      const p = stats(previous.values).mean
      const base = Math.max(r, p)
      const change = base === 0 ? 0 : Math.abs(r - p) / base
      const strength = strengthOf(welchT(recent.values, previous.values), change)
      if (strength) {
        insights.push({
          gymId,
          kind: 'trend',
          strength,
          change,
          text: `A frequência está ${r > p ? 'subindo' : 'caindo'}: ${fmt(r)} alunos por aula nas últimas 8 semanas, contra ${fmt(p)} nas 8 anteriores.`,
        })
      }
    }

    out.push({
      gymId,
      classes: list.length,
      mean: all.mean,
      byPeriod: periods.map(toBucket),
      byWeekday: weekdays.map(toBucket),
      trend,
      insights,
    })
  }
  return out.sort((a, b) => b.classes - a.classes)
}
