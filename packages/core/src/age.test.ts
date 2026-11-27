import { describe, expect, it } from 'vitest'
import {
  adulthoodDate, birthDateIssue, guardianConsentFileIssue, guardianConsentMime, guardianTermFileName, guardianTermStatus, isMinor,
  studentInput,
} from './index'

describe('isMinor', () => {
  it('faz 18 anos no próprio dia do aniversário', () => {
    expect(isMinor('2008-11-20', '2026-11-19')).toBe(true)
    expect(isMinor('2008-11-20', '2026-11-20')).toBe(false)
    expect(isMinor('2008-11-20', '2026-11-21')).toBe(false)
    expect(isMinor('2008-01-01', '2025-12-31')).toBe(true)
    expect(isMinor('2008-01-01', '2026-01-01')).toBe(false)
  })

  it('nascido em 29/02: em ano não bissexto faz 18 em 01/03', () => {
    expect(adulthoodDate('2008-02-29')).toBe('2026-03-01')
    expect(isMinor('2008-02-29', '2026-02-28')).toBe(true)
    expect(isMinor('2008-02-29', '2026-03-01')).toBe(false)
    expect(isMinor('2012-02-29', '2030-02-28')).toBe(true)
    expect(isMinor('2012-02-29', '2030-03-01')).toBe(false)
    // 28/02 não muda, mesmo com os 18 anos caindo em ano bissexto.
    expect(adulthoodDate('2006-02-28')).toBe('2024-02-28')
    expect(isMinor('2006-02-28', '2024-02-28')).toBe(false)
  })

  it('usa o dia civil de America/Sao_Paulo quando recebe um instante', () => {
    // 20/11/2026 02:30 UTC = 19/11 23:30 em São Paulo: o aniversário de 18 anos ainda não chegou.
    expect(isMinor('2008-11-20', new Date('2026-11-20T02:30:00Z'))).toBe(true)
    // 03:00 UTC = 00:00 de 20/11 em São Paulo: já é maior.
    expect(isMinor('2008-11-20', new Date('2026-11-20T03:00:00Z'))).toBe(false)
    // Fim do dia 20/11 em São Paulo já é 21/11 em UTC: continua maior, sem voltar a ser menor.
    expect(isMinor('2008-11-21', new Date('2026-11-21T02:59:00Z'))).toBe(true)
  })

  it('sem data de nascimento não é tratado como menor (data pendente)', () => {
    expect(isMinor(null, '2026-11-20')).toBe(false)
    expect(isMinor(undefined, '2026-11-20')).toBe(false)
    expect(isMinor('', '2026-11-20')).toBe(false)
  })
})

describe('data de nascimento', () => {
  const today = '2026-11-20'
  it('obrigatória, válida e não futura', () => {
    expect(birthDateIssue('', today)).toBe('Informe a data de nascimento')
    expect(birthDateIssue(null, today)).toBe('Informe a data de nascimento')
    expect(birthDateIssue('2010-02-30', today)).toBe('Data de nascimento inválida')
    expect(birthDateIssue('20/11/2010', today)).toBe('Data de nascimento inválida')
    expect(birthDateIssue('2026-11-21', today)).toBe('A data de nascimento não pode ser no futuro')
    expect(birthDateIssue('1899-12-31', today)).toBe('Confira o ano de nascimento')
    expect(birthDateIssue('2026-11-20', today)).toBeNull()
    expect(birthDateIssue('2012-02-29', today)).toBeNull()
  })
  it('schema do aluno aceita sem data, mas valida a data informada', () => {
    const base = { gym_id: '3f2504e0-4f89-41d3-9a0c-0305e82c3301', name: 'Ana Souza' }
    expect(studentInput.parse(base).birth_date).toBeNull()
    expect(studentInput.parse({ ...base, birth_date: null }).birth_date).toBeNull()
    expect(studentInput.parse({ ...base, birth_date: '' }).birth_date).toBeNull()
    expect(studentInput.safeParse({ ...base, birth_date: '2999-01-01' }).success).toBe(false)
    expect(studentInput.safeParse({ ...base, birth_date: '2012-05-05' }).success).toBe(true)
  })
})

describe('termo do responsável', () => {
  it('situação do termo', () => {
    expect(guardianTermStatus({ birth_date: '2012-05-05' }, null, '2026-11-20')).toBe('pendente')
    expect(guardianTermStatus({ birth_date: '2012-05-05' }, { status: 'pendente' }, '2026-11-20')).toBe('pendente')
    expect(guardianTermStatus({ birth_date: '2012-05-05' }, { status: 'enviado' }, '2026-11-20')).toBe('enviado')
    expect(guardianTermStatus({ birth_date: '2012-05-05' }, { status: 'em_analise' }, '2026-11-20')).toBe('em_analise')
    // Fez 18 com o termo ainda em análise: não se aplica mais.
    expect(guardianTermStatus({ birth_date: '2008-11-20' }, { status: 'em_analise' }, '2026-11-20')).toBeNull()
    expect(guardianTermStatus({ birth_date: '1990-05-05' }, null, '2026-11-20')).toBeNull()
    expect(guardianTermStatus({ birth_date: null }, null, '2026-11-20')).toBeNull()
  })
  it('arquivo: PDF, JPG ou PNG até 10 MB', () => {
    const MB = 1024 * 1024
    expect(guardianConsentFileIssue({ type: 'application/pdf', size: 2 * MB })).toBeNull()
    expect(guardianConsentFileIssue({ type: 'image/png', size: 10 * MB })).toBeNull()
    expect(guardianConsentFileIssue({ type: 'image/jpeg', size: 10 * MB + 1 })).toBe('O arquivo passa de 10 MB')
    expect(guardianConsentFileIssue({ type: 'image/heic', size: MB })).toBe('Envie o termo em PDF, JPG ou PNG')
    expect(guardianConsentFileIssue({ type: 'application/pdf', size: 0 })).toBe('O arquivo está vazio')
    // Aparelho que não informa o tipo: vale a extensão.
    expect(guardianConsentMime({ type: '', name: 'Termo.JPEG' })).toBe('image/jpeg')
    expect(guardianConsentMime({ type: '', name: 'termo.docx' })).toBeNull()
  })
  it('nome do arquivo baixado', () => {
    expect(guardianTermFileName('João da Silva')).toBe('termo-responsavel-joao-da-silva.pdf')
    expect(guardianTermFileName('  ')).toBe('termo-responsavel.pdf')
  })
})
