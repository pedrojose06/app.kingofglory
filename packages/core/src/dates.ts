// Datas do app são "dias civis" em America/Sao_Paulo, trafegando como 'YYYY-MM-DD'.
// Nunca usar new Date('YYYY-MM-DD') diretamente: isso interpreta como UTC e desloca o dia.

export const TIME_ZONE = 'America/Sao_Paulo'

const isoFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/** Dia civil em São Paulo para um instante (padrão: agora). */
export function todayISO(now: Date = new Date()): string {
  return isoFmt.format(now)
}

const wallFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

/**
 * Minutos desde o início da aula (data 'YYYY-MM-DD' + horário 'HH:MM[:SS]', relógio de São Paulo).
 * Negativo antes da aula; null sem horário.
 */
export function minutesSinceClassStart(date: string, startTime: string | null | undefined, now: Date = new Date()): number | null {
  if (!startTime) return null
  const part = (type: string) => Number(wallFmt.formatToParts(now).find((p) => p.type === type)?.value)
  const nowWall = Date.UTC(part('year'), part('month') - 1, part('day'), part('hour'), part('minute'))
  const [y, m, d] = date.split('-').map(Number)
  const [hh, mm] = startTime.split(':').map(Number)
  const start = Date.UTC(y!, m! - 1, d!, hh!, mm!)
  if (Number.isNaN(start) || Number.isNaN(nowWall)) return null
  return Math.round((nowWall - start) / 60_000)
}

/** Converte 'YYYY-MM-DD' num Date ao meio-dia UTC — seguro para aritmética e formatação de dia. */
export function parseISODate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1, 12))
}

const toISO = (d: Date) => d.toISOString().slice(0, 10)

export function addDays(iso: string, days: number): string {
  const d = parseISODate(iso)
  d.setUTCDate(d.getUTCDate() + days)
  return toISO(d)
}

/** 0 = domingo … 6 = sábado. */
export function weekdayOf(iso: string): number {
  return parseISODate(iso).getUTCDay()
}

/** Meses completos entre duas datas (ex.: 10/01 → 09/07 = 5; 10/01 → 10/07 = 6). */
export function monthsBetween(fromISO: string, toISO_: string): number {
  const a = parseISODate(fromISO)
  const b = parseISODate(toISO_)
  let months = (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth())
  if (b.getUTCDate() < a.getUTCDate()) months -= 1
  return Math.max(0, months)
}

export const WEEKDAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'] as const
export const WEEKDAYS_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'] as const
const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'] as const

/** 13/11/2026 */
export function formatDateBR(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

/** qui, 13/11 */
export function formatDayShort(iso: string): string {
  const [, m, d] = iso.split('-')
  return `${WEEKDAYS_SHORT[weekdayOf(iso)]!.toLowerCase()}, ${d}/${m}`
}

/** quinta, 13 de novembro */
export function formatDayLong(iso: string): string {
  const [, m, d] = iso.split('-')
  return `${WEEKDAYS[weekdayOf(iso)]!.toLowerCase()}, ${Number(d)} de ${MONTHS[Number(m) - 1]}`
}

/** '2026-11' → 'novembro de 2026' */
export function formatMonth(ym: string): string {
  const [y, m] = ym.split('-')
  return `${MONTHS[Number(m) - 1]} de ${y}`
}

/** '19:00:00' → '19:00' */
export function formatTime(t: string | null | undefined): string {
  return t ? t.slice(0, 5) : ''
}

/** Aceita 'dd/mm/aaaa', 'dd/mm/aa', 'dd-mm-aaaa' e 'aaaa-mm-dd'. Devolve ISO ou null. */
export function parseDateLoose(input: string): string | null {
  const s = input.trim()
  let y: number, m: number, d: number
  let match = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s)
  if (match) {
    ;[y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])]
  } else {
    match = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})(?!\d)/.exec(s)
    if (!match) return null
    ;[d, m, y] = [Number(match[1]), Number(match[2]), Number(match[3])]
    if (y < 100) y += 2000
  }
  const date = new Date(Date.UTC(y, m - 1, d, 12))
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null
  return toISO(date)
}
