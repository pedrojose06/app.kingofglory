import { describe, expect, it } from 'vitest'
import { academyInviteLink, academyInviteStatus, authErrorMessage, isValidEmail, normalizeEmail, passwordIssue } from './domain/academy'

describe('convite da academia', () => {
  const now = new Date('2026-11-25T12:00:00Z')
  const base = { accepted_at: null, cancelled_at: null, expires_at: '2026-12-09T12:00:00Z' }

  it('situação segue a mesma ordem do banco: aceito > cancelado > vencido > aberto', () => {
    expect(academyInviteStatus(base, now)).toBe('aberto')
    expect(academyInviteStatus({ ...base, expires_at: '2026-11-25T11:59:59Z' }, now)).toBe('vencido')
    expect(academyInviteStatus({ ...base, cancelled_at: '2026-11-25T10:00:00Z', expires_at: '2026-11-01T00:00:00Z' }, now)).toBe('cancelado')
    expect(academyInviteStatus({ ...base, accepted_at: '2026-11-25T10:00:00Z', cancelled_at: '2026-11-25T11:00:00Z' }, now)).toBe('aceito')
  })

  it('link leva o token no # (não vai ao servidor)', () => {
    expect(academyInviteLink('https://academia.kingofglory.com.br/', 'abc')).toBe('https://academia.kingofglory.com.br/convite#abc')
  })

  it('e-mail normalizado como no banco', () => {
    expect(normalizeEmail('  Mestre@Gmail.COM ')).toBe('mestre@gmail.com')
    expect(isValidEmail('academykingofglory@gmail.com')).toBe(true)
    expect(isValidEmail('sem-arroba.com')).toBe(false)
    expect(isValidEmail('a@b')).toBe(false)
  })
})

describe('senha e erros de login', () => {
  it('exige 8 caracteres e confirmação igual', () => {
    expect(passwordIssue('1234567', '1234567')).toMatch(/8 caracteres/)
    expect(passwordIssue('12345678', '12345679')).toMatch(/não conferem/)
    expect(passwordIssue('12345678', '12345678')).toBeNull()
  })

  it('traduz os erros do Supabase Auth', () => {
    expect(authErrorMessage({ code: 'email_not_confirmed', message: 'Email not confirmed' })).toMatch(/Confirme o seu e-mail/)
    expect(authErrorMessage({ message: 'Invalid login credentials' })).toBe('E-mail ou senha incorretos.')
    expect(authErrorMessage({ message: 'Failed to fetch' })).toMatch(/Sem conexão/)
  })
})
