import { describe, expect, it } from 'vitest'
import { formatCpf, guardianSignFormIssue, guardianSignUrl, isValidCpf, maskCpf, type GuardianSignForm } from './domain/guardian-consent'

describe('CPF', () => {
  it('confere os dígitos verificadores', () => {
    expect(isValidCpf('529.982.247-25')).toBe(true)
    expect(isValidCpf('52998224725')).toBe(true)
    expect(isValidCpf('52998224724')).toBe(false)
    expect(isValidCpf('11111111111')).toBe(false)
    expect(isValidCpf('1234567890')).toBe(false)
    // Resto 10 → dígito 0.
    expect(isValidCpf('11144477735')).toBe(true)
  })
  it('formata enquanto digita e esconde nas telas', () => {
    expect(formatCpf('529')).toBe('529')
    expect(formatCpf('5299')).toBe('529.9')
    expect(formatCpf('5299822')).toBe('529.982.2')
    expect(formatCpf('52998224725')).toBe('529.982.247-25')
    expect(formatCpf('529982247251234')).toBe('529.982.247-25')
    expect(maskCpf('52998224725')).toBe('***.982.247-**')
  })
})

describe('formulário de assinatura do responsável', () => {
  const ok: GuardianSignForm = {
    guardianName: 'Maria da Silva',
    guardianCpf: '529.982.247-25',
    relationship: 'Mãe',
    image: true,
    face: false,
    place: 'Bauru',
    signature: 'data:image/png;base64,AAAA',
    declaration: true,
  }
  it('aceita o formulário completo (autorizar ou não)', () => {
    expect(guardianSignFormIssue(ok)).toBeNull()
  })
  it('aponta o primeiro problema', () => {
    expect(guardianSignFormIssue({ ...ok, guardianName: 'Maria' })).toMatch(/nome completo/)
    expect(guardianSignFormIssue({ ...ok, guardianCpf: '123' })).toMatch(/CPF/)
    expect(guardianSignFormIssue({ ...ok, relationship: '' })).toMatch(/parentesco/)
    expect(guardianSignFormIssue({ ...ok, face: null })).toMatch(/autorizações/)
    expect(guardianSignFormIssue({ ...ok, place: ' ' })).toMatch(/cidade/)
    expect(guardianSignFormIssue({ ...ok, signature: '' })).toMatch(/Assine/)
    expect(guardianSignFormIssue({ ...ok, declaration: false })).toMatch(/declaração/)
  })
  it('link com o código no #', () => {
    expect(guardianSignUrl('https://app.x', 'abc')).toBe('https://app.x/termo#abc')
  })
})
