import { describe, expect, it } from 'vitest'
import {
  addMonths, buildContractCharges, chargeState, chargeTotals, contractEndFor, contractExtensionCharges, contractExtensionEnd,
  contractExtensionIssue, contractIssue, contractPeriodState, daysLate,
  dueDateIn, formatBRL, parseBRL,
} from './domain/billing'

const base = { billing: 'mensal' as const, startsOn: '2026-12-01', endsOn: '2027-11-30', dueDay: 10, amountCents: 9590 }

describe('dinheiro', () => {
  it('formata em reais', () => {
    expect(formatBRL(9590)).toBe('R$ 95,90')
    expect(formatBRL(123456)).toBe('R$ 1.234,56')
    expect(formatBRL(0)).toBe('R$ 0,00')
  })
  it('lê o que a pessoa digita', () => {
    expect(parseBRL('95,90')).toBe(9590)
    expect(parseBRL('R$ 95,9')).toBe(9590)
    expect(parseBRL('95.90')).toBe(9590)
    expect(parseBRL('1.234,56')).toBe(123456)
    expect(parseBRL('1.234')).toBe(123400)
    expect(parseBRL('95')).toBe(9500)
    expect(parseBRL('')).toBeNull()
    expect(parseBRL('abc')).toBeNull()
    expect(parseBRL('9,999')).toBeNull()
  })
})

describe('datas de vencimento', () => {
  it('dia 30 em fevereiro cai no último dia', () => {
    expect(dueDateIn(2027, 2, 30)).toBe('2027-02-28')
    expect(dueDateIn(2028, 2, 30)).toBe('2028-02-29')
    expect(dueDateIn(2027, 4, 31)).toBe('2027-04-30')
    expect(dueDateIn(2027, 3, 15)).toBe('2027-03-15')
  })
  it('soma meses e calcula o fim da vigência', () => {
    expect(addMonths('2027-01-31', 1)).toBe('2027-02-28')
    expect(addMonths('2026-11-15', 2)).toBe('2027-01-15')
    expect(contractEndFor('2026-12-01', 12)).toBe('2027-11-30')
    expect(contractEndFor('2026-11-20', 1)).toBe('2026-12-19')
  })
})

describe('parcelas do contrato', () => {
  it('12 mensalidades, uma por mês, no dia escolhido', () => {
    const c = buildContractCharges(base)
    expect(c).toHaveLength(12)
    expect(c[0]).toMatchObject({ kind: 'mensalidade', dueOn: '2026-12-10', competence: '2026-12-01', amountCents: 9590, installment: 1, installmentsTotal: 12 })
    expect(c[11]).toMatchObject({ dueOn: '2027-11-10', installment: 12 })
  })

  it('sem proporcional: começa depois do vencimento, a primeira é no mês seguinte', () => {
    const c = buildContractCharges({ ...base, startsOn: '2026-12-20', endsOn: '2027-12-19' })
    expect(c[0]!.dueOn).toBe('2027-01-10')
    expect(c.at(-1)!.dueOn).toBe('2027-12-10')
    expect(c).toHaveLength(12)
  })

  it('vencimento no próprio dia do início conta', () => {
    expect(buildContractCharges({ ...base, startsOn: '2026-12-10' })[0]!.dueOn).toBe('2026-12-10')
  })

  it('dia 30 em fevereiro vira 28', () => {
    const c = buildContractCharges({ ...base, dueDay: 30 })
    expect(c.find((x) => x.competence === '2027-02-01')!.dueOn).toBe('2027-02-28')
  })

  it('desconto é abatido em toda parcela', () => {
    expect(buildContractCharges({ ...base, discountCents: 1000 })[0]!.amountCents).toBe(8590)
  })

  it('taxa de matrícula vence no início', () => {
    const c = buildContractCharges({ ...base, enrollmentFeeCents: 5000 })
    expect(c[0]).toMatchObject({ kind: 'matricula', dueOn: '2026-12-01', amountCents: 5000, competence: null })
    expect(c.filter((x) => x.kind === 'mensalidade')).toHaveLength(12)
  })

  it('isento e app parceiro não geram mensalidade (só a matrícula, se houver)', () => {
    expect(buildContractCharges({ ...base, billing: 'isento', amountCents: 0 })).toHaveLength(0)
    expect(buildContractCharges({ ...base, billing: 'app_parceiro', amountCents: 0, enrollmentFeeCents: 3000 })).toEqual([
      expect.objectContaining({ kind: 'matricula', amountCents: 3000 }),
    ])
  })

  it('`from` pula o que já foi cobrado, mantendo a numeração', () => {
    const c = buildContractCharges({ ...base, startsOn: '2026-09-01', endsOn: '2026-12-31', enrollmentFeeCents: 5000 }, { from: '2026-12-01' })
    expect(c).toEqual([expect.objectContaining({ kind: 'mensalidade', dueOn: '2026-12-10', installment: 4, installmentsTotal: 4 })])
  })

  it('recusa contrato inválido', () => {
    expect(contractIssue({ ...base, endsOn: '2026-11-01' })).toMatch(/antes do início/)
    expect(contractIssue({ ...base, dueDay: 0 })).toMatch(/1 a 31/)
    expect(contractIssue({ ...base, discountCents: 10000 })).toMatch(/desconto/)
    expect(contractIssue({ ...base, amountCents: 0 })).toMatch(/Isento/)
    expect(() => buildContractCharges({ ...base, dueDay: 32 })).toThrow()
  })
})

describe('atraso', () => {
  const today = '2026-11-25'
  it('aberta vencida antes de hoje está atrasada; vencendo hoje, ainda em aberto', () => {
    expect(chargeState({ status: 'aberta', due_on: '2026-11-24' }, today)).toBe('atrasada')
    expect(chargeState({ status: 'aberta', due_on: '2026-11-25' }, today)).toBe('em_aberto')
    expect(chargeState({ status: 'paga', due_on: '2026-01-01' }, today)).toBe('paga')
    expect(chargeState({ status: 'cancelada', due_on: '2026-01-01' }, today)).toBe('cancelada')
  })
  it('conta os dias de atraso, inclusive atravessando o ano', () => {
    expect(daysLate({ status: 'aberta', due_on: '2026-11-20' }, today)).toBe(5)
    expect(daysLate({ status: 'aberta', due_on: '2025-12-31' }, '2026-01-02')).toBe(2)
    expect(daysLate({ status: 'paga', due_on: '2026-11-20' }, today)).toBe(0)
  })
  it('totais por situação; pagas somam o recebido', () => {
    const t = chargeTotals([
      { state: 'em_aberto', amount_cents: 9590 },
      { state: 'atrasada', amount_cents: 7990 },
      { state: 'atrasada', amount_cents: 7990 },
      { state: 'paga', amount_cents: 8590, paid_cents: 8761 },
    ])
    expect(t.em_aberto).toEqual({ count: 1, cents: 9590 })
    expect(t.atrasada).toEqual({ count: 2, cents: 15980 })
    expect(t.paga).toEqual({ count: 1, cents: 8761 })
  })
})

describe('vigência do contrato', () => {
  const c = { status: 'ativo' as const, starts_on: '2026-01-01', ends_on: '2026-12-15' }
  it('vigente, vencendo (30 dias), vencido', () => {
    expect(contractPeriodState(c, '2026-10-01')).toBe('vigente')
    expect(contractPeriodState(c, '2026-11-25')).toBe('vencendo')
    expect(contractPeriodState(c, '2026-12-16')).toBe('vencido')
    expect(contractPeriodState({ ...c, status: 'cancelado' }, '2026-11-25')).toBe('cancelado')
    expect(contractPeriodState({ ...c, starts_on: '2027-01-01', ends_on: '2027-12-31' }, '2026-11-25')).toBe('futuro')
  })
})

describe('prorrogação do contrato', () => {
  it('sugere mais 1 ano depois do fim atual', () => {
    expect(contractExtensionEnd('2027-11-30')).toBe('2028-11-30')
    expect(contractExtensionEnd('2027-12-31')).toBe('2028-12-31')
    expect(contractExtensionEnd('2027-11-30', 6)).toBe('2028-05-31')
  })
  it('nova data precisa ser depois do fim atual', () => {
    expect(contractExtensionIssue('2027-11-30', '2027-11-30')).toMatch(/depois/)
    expect(contractExtensionIssue('2027-11-30', '')).toMatch(/Informe/)
    expect(contractExtensionIssue('2027-11-30', '2028-11-30')).toBeNull()
  })
  it('gera só as mensalidades do período novo, continuando a numeração', () => {
    const drafts = contractExtensionCharges({ ...base, enrollmentFeeCents: 5000 }, '2028-11-30')
    expect(drafts).toHaveLength(12)
    expect(drafts.every((d) => d.kind === 'mensalidade')).toBe(true)
    expect(drafts[0]).toMatchObject({ dueOn: '2027-12-10', installment: 13, installmentsTotal: 24, amountCents: 9590 })
    expect(drafts.at(-1)).toMatchObject({ dueOn: '2028-11-10', installment: 24 })
  })
  it('contrato isento prorroga sem cobranças', () => {
    expect(contractExtensionCharges({ ...base, billing: 'isento', amountCents: 0 }, '2028-11-30')).toEqual([])
  })
})
