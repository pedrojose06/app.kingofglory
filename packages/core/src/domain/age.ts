import { parseDateLoose, todayISO } from '../dates'

/** Maioridade civil (Código Civil, art. 5º). */
export const AGE_OF_MAJORITY = 18
/** Datas de nascimento anteriores a esta são tratadas como erro de digitação. */
export const MIN_BIRTH_DATE = '1900-01-01'

const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0

/**
 * Dia em que quem nasceu em `birthDate` completa `years` anos ('YYYY-MM-DD').
 * Nascido em 29/02: em ano não bissexto o aniversário é 01/03 (CC art. 132, § 3º: falta o dia
 * correspondente, o prazo vence no dia imediato). O banco usa a mesma regra (`public.is_minor`).
 */
export function birthdayAt(birthDate: string, years: number): string {
  const [y, m, d] = birthDate.split('-').map(Number) as [number, number, number]
  const year = y + years
  if (m === 2 && d === 29 && !isLeap(year)) return `${year}-03-01`
  return `${String(year).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/** Dia em que o aluno faz 18 anos. */
export const adulthoodDate = (birthDate: string) => birthdayAt(birthDate, AGE_OF_MAJORITY)

/**
 * Menor de 18 anos em `today`. `today` é um dia civil ('YYYY-MM-DD') ou um instante, convertido para o dia em
 * America/Sao_Paulo (às 23h de 19/11 em São Paulo já é 20/11 em UTC, mas o aniversário ainda não chegou).
 * Faz 18 no próprio dia do aniversário. Sem data de nascimento não dá para saber: `false` (ver birthDatePending).
 */
export function isMinor(birthDate: string | null | undefined, today: string | Date = new Date()): boolean {
  if (!birthDate) return false
  const day = typeof today === 'string' ? today : todayISO(today)
  return day < adulthoodDate(birthDate)
}

/** Aluno cadastrado antes da data de nascimento ser obrigatória: a ficha pede o preenchimento. */
export const birthDatePending = (s: { birth_date: string | null | undefined }) => !s.birth_date

/** Problema na data de nascimento ('YYYY-MM-DD'), ou null se estiver ok. */
export function birthDateIssue(birthDate: string | null | undefined, today: string = todayISO()): string | null {
  if (!birthDate) return 'Informe a data de nascimento'
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate) || parseDateLoose(birthDate) !== birthDate) return 'Data de nascimento inválida'
  if (birthDate > today) return 'A data de nascimento não pode ser no futuro'
  if (birthDate < MIN_BIRTH_DATE) return 'Confira o ano de nascimento'
  return null
}
