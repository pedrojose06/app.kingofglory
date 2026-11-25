// Regras do financeiro da academia. Valores em centavos (inteiro); datas 'YYYY-MM-DD' em dia civil de São Paulo.
// O banco guarda as cobranças geradas aqui (create_contract) e calcula a mesma situação na view charge_overview.

export type ContractBilling = 'mensal' | 'isento' | 'app_parceiro'
export type ChargeKind = 'mensalidade' | 'matricula' | 'avulsa' | 'exame' | 'produto'
export type ChargeStatus = 'aberta' | 'paga' | 'cancelada'
export type ChargeState = 'em_aberto' | 'atrasada' | 'paga' | 'cancelada'
export type PaymentMethod = 'pix' | 'dinheiro' | 'boleto' | 'credito' | 'debito' | 'gympass' | 'totalpass' | 'transferencia' | 'outro'

export const CONTRACT_BILLING_LABEL: Record<ContractBilling, string> = {
  mensal: 'Mensalidade',
  isento: 'Isento (bolsista)',
  app_parceiro: 'Gympass / Totalpass',
}
export const CHARGE_KIND_LABEL: Record<ChargeKind, string> = {
  mensalidade: 'Mensalidade',
  matricula: 'Matrícula',
  avulsa: 'Avulsa',
  exame: 'Exame de graduação',
  produto: 'Produto',
}
export const CHARGE_STATE_LABEL: Record<ChargeState, string> = {
  em_aberto: 'Em aberto',
  atrasada: 'Atrasada',
  paga: 'Paga',
  cancelada: 'Cancelada',
}
export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  pix: 'Pix',
  dinheiro: 'Dinheiro',
  boleto: 'Boleto',
  credito: 'Cartão de crédito',
  debito: 'Cartão de débito',
  gympass: 'Gympass',
  totalpass: 'Totalpass',
  transferencia: 'Transferência',
  outro: 'Outro',
}

/** Dias de vencimento sugeridos na tela (a academia usa múltiplos de 5). O banco aceita de 1 a 31. */
export const SUGGESTED_DUE_DAYS = [5, 10, 15, 20, 25, 30] as const

// ── dinheiro ──────────────────────────────────────────────────────────────────

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

/** 9590 → "R$ 95,90" (com espaço comum, não o espaço fino do Intl). */
export function formatBRL(cents: number): string {
  return brl.format(cents / 100).replace(/\s/g, ' ')
}

/**
 * Texto digitado → centavos. Aceita "95,90", "95.90", "1.234,56", "R$ 95,9" e "95". null se não for um valor.
 * Com vírgula, o ponto é separador de milhar; sem vírgula, um ponto seguido de 1–2 dígitos é decimal.
 */
export function parseBRL(text: string): number | null {
  let s = text.replace(/R\$/i, '').replace(/\s/g, '')
  if (!s) return null
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.')
  else if (!/^\d+(\.\d{1,2})?$/.test(s)) s = s.replace(/\./g, '')
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null
  const [int, dec = ''] = s.split('.')
  return Number(int) * 100 + Number(dec.padEnd(2, '0'))
}

// ── datas ─────────────────────────────────────────────────────────────────────

const pad = (n: number) => String(n).padStart(2, '0')
const ymd = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`
const partsOf = (iso: string) => iso.split('-').map(Number) as [number, number, number]

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

/** Vencimento no mês: o dia escolhido ou o último dia do mês, se ele for mais curto (30 em fevereiro → 28/29). */
export function dueDateIn(year: number, month: number, dueDay: number): string {
  return ymd(year, month, Math.min(dueDay, daysInMonth(year, month)))
}

/** Primeiro dia do mês da data. */
export const monthStart = (iso: string) => `${iso.slice(0, 7)}-01`

/** Soma meses mantendo o dia quando possível (31/01 + 1 → 28/02). */
export function addMonths(iso: string, months: number): string {
  const [y, m, d] = partsOf(iso)
  const total = y * 12 + (m - 1) + months
  const ny = Math.floor(total / 12)
  const nm = (total % 12) + 1
  return ymd(ny, nm, Math.min(d, daysInMonth(ny, nm)))
}

/** Último dia de uma vigência de N meses começando em `startsOn` (01/12/2026 + 12 → 30/11/2027). */
export function contractEndFor(startsOn: string, months: number): string {
  const [y, m, d] = partsOf(addMonths(startsOn, months))
  const end = new Date(Date.UTC(y, m - 1, d - 1))
  return end.toISOString().slice(0, 10)
}

/** Dias entre duas datas (b − a). */
export function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = partsOf(a)
  const [by, bm, bd] = partsOf(b)
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000)
}

// ── geração das parcelas ──────────────────────────────────────────────────────

export interface ContractTerms {
  billing: ContractBilling
  startsOn: string
  endsOn: string
  dueDay: number
  amountCents: number
  discountCents?: number
  enrollmentFeeCents?: number
}

export interface ChargeDraft {
  kind: ChargeKind
  /** Mês de referência (dia 1); só nas mensalidades. */
  competence: string | null
  dueOn: string
  amountCents: number
  installment: number | null
  installmentsTotal: number | null
  description: string | null
}

export function contractIssue(t: ContractTerms): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t.startsOn) || !/^\d{4}-\d{2}-\d{2}$/.test(t.endsOn)) return 'Informe o início e o fim da vigência.'
  if (t.endsOn < t.startsOn) return 'O fim da vigência é antes do início.'
  if (!Number.isInteger(t.dueDay) || t.dueDay < 1 || t.dueDay > 31) return 'Dia de vencimento deve ser de 1 a 31.'
  if (!Number.isInteger(t.amountCents) || t.amountCents < 0) return 'Valor inválido.'
  if ((t.discountCents ?? 0) < 0 || (t.discountCents ?? 0) > t.amountCents) return 'O desconto não pode ser maior que o valor.'
  if ((t.enrollmentFeeCents ?? 0) < 0) return 'Taxa de matrícula inválida.'
  if (t.billing === 'mensal' && t.amountCents - (t.discountCents ?? 0) <= 0) return 'Contrato mensal precisa ter valor. Para bolsista, use "Isento".'
  return null
}

/**
 * Cobranças de um contrato:
 * - matrícula (se houver taxa) vencendo no início da vigência;
 * - uma mensalidade por mês, no dia de vencimento, de vencimento ≥ início até ≤ fim. Sem proporcional: quem começa
 *   depois do dia de vencimento paga a primeira no mês seguinte;
 * - `from` pula os vencimentos anteriores (contrato importado cujas parcelas passadas já existem).
 * Contrato isento ou de app parceiro não gera mensalidade.
 */
export function buildContractCharges(t: ContractTerms, options: { from?: string } = {}): ChargeDraft[] {
  const issue = contractIssue(t)
  if (issue) throw new Error(issue)
  const out: ChargeDraft[] = []
  const from = options.from ?? t.startsOn

  const fee = t.enrollmentFeeCents ?? 0
  if (fee > 0 && t.startsOn >= from) {
    out.push({ kind: 'matricula', competence: null, dueOn: t.startsOn, amountCents: fee, installment: null, installmentsTotal: null, description: null })
  }
  if (t.billing !== 'mensal') return out

  const net = t.amountCents - (t.discountCents ?? 0)
  const months: string[] = []
  let [y, m] = partsOf(t.startsOn)
  const [ey, em] = partsOf(t.endsOn)
  while (y < ey || (y === ey && m <= em)) {
    const due = dueDateIn(y, m, t.dueDay)
    if (due >= t.startsOn && due <= t.endsOn) months.push(due)
    m += 1
    if (m > 12) {
      m = 1
      y += 1
    }
  }
  months.forEach((due, i) => {
    if (due < from) return
    out.push({
      kind: 'mensalidade',
      competence: monthStart(due),
      dueOn: due,
      amountCents: net,
      installment: i + 1,
      installmentsTotal: months.length,
      description: null,
    })
  })
  return out
}

// ── prorrogação ───────────────────────────────────────────────────────────────

/** Dia seguinte. */
export function nextDay(iso: string): string {
  const [y, m, d] = partsOf(iso)
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10)
}

/** Nova data de fim sugerida ao prorrogar: mais N meses (padrão 1 ano) depois do fim atual (30/11/2027 → 30/11/2028). */
export function contractExtensionEnd(endsOn: string, months = 12): string {
  return contractEndFor(nextDay(endsOn), months)
}

export function contractExtensionIssue(currentEndsOn: string, newEndsOn: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(newEndsOn)) return 'Informe a nova data de fim.'
  if (newEndsOn <= currentEndsOn) return 'A nova data de fim precisa ser depois do fim atual.'
  return null
}

/**
 * Mensalidades do período novo de uma prorrogação (do dia seguinte ao fim atual até o novo fim). A numeração continua a
 * do contrato e o total passa a contar a vigência inteira (12/12 → 13/24). Não cobra matrícula de novo.
 */
export function contractExtensionCharges(t: ContractTerms, newEndsOn: string): ChargeDraft[] {
  const issue = contractExtensionIssue(t.endsOn, newEndsOn)
  if (issue) throw new Error(issue)
  return buildContractCharges({ ...t, endsOn: newEndsOn, enrollmentFeeCents: 0 }, { from: nextDay(t.endsOn) })
}

// ── situação e totais ─────────────────────────────────────────────────────────

/** Mesma regra da view charge_overview: aberta e vencida antes de hoje = atrasada (vencendo hoje ainda está em aberto). */
export function chargeState(charge: { status: ChargeStatus; due_on: string }, today: string): ChargeState {
  if (charge.status === 'paga') return 'paga'
  if (charge.status === 'cancelada') return 'cancelada'
  return charge.due_on < today ? 'atrasada' : 'em_aberto'
}

export function daysLate(charge: { status: ChargeStatus; due_on: string }, today: string): number {
  return chargeState(charge, today) === 'atrasada' ? daysBetween(charge.due_on, today) : 0
}

export interface ChargeTotals {
  count: number
  cents: number
}

/** Totais por situação. Paga soma o valor recebido (pode diferir do cobrado: juros, desconto na hora). */
export function chargeTotals(
  rows: readonly { state: ChargeState; amount_cents: number; paid_cents?: number | null }[],
): Record<ChargeState, ChargeTotals> {
  const out: Record<ChargeState, ChargeTotals> = {
    em_aberto: { count: 0, cents: 0 },
    atrasada: { count: 0, cents: 0 },
    paga: { count: 0, cents: 0 },
    cancelada: { count: 0, cents: 0 },
  }
  for (const r of rows) {
    out[r.state].count += 1
    out[r.state].cents += r.state === 'paga' ? (r.paid_cents ?? r.amount_cents) : r.amount_cents
  }
  return out
}

// ── vigência ──────────────────────────────────────────────────────────────────

export type ContractPeriodState = 'vigente' | 'vencendo' | 'vencido' | 'cancelado' | 'suspenso' | 'futuro'

/** Situação do contrato pela vigência. "Vencendo": termina em até `warnDays` dias. */
export function contractPeriodState(
  c: { status: 'ativo' | 'suspenso' | 'cancelado'; starts_on: string; ends_on: string },
  today: string,
  warnDays = 30,
): ContractPeriodState {
  if (c.status === 'cancelado') return 'cancelado'
  if (c.status === 'suspenso') return 'suspenso'
  if (c.ends_on < today) return 'vencido'
  if (c.starts_on > today) return 'futuro'
  return daysBetween(today, c.ends_on) <= warnDays ? 'vencendo' : 'vigente'
}
