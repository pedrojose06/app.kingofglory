// Sistema da academia (academia.kingofglory.com.br): papéis, convites e regras puras de acesso.

export type AcademyRole = 'admin' | 'professor' | 'membro'
export const ACADEMY_ROLES: readonly AcademyRole[] = ['admin', 'professor', 'membro']

export const ACADEMY_ROLE_LABEL: Record<AcademyRole, string> = {
  admin: 'Administrador',
  professor: 'Professor',
  membro: 'Aluno ou responsável',
}

export const ACADEMY_ROLE_HINT: Record<AcademyRole, string> = {
  admin: 'Acesso a tudo: cadastros, financeiro, contratos e configurações.',
  professor: 'Aulas, turmas e chamada. Não vê o financeiro.',
  membro: 'Preenche os próprios dados e assina o contrato. Vê só o que é dele.',
}

export type AcademyInviteStatus = 'aberto' | 'aceito' | 'cancelado' | 'vencido'

export interface AcademyInviteRow {
  accepted_at: string | null
  cancelled_at: string | null
  expires_at: string
}

/** Situação do convite (mesma regra de `academy_invite_info` no banco). */
export function academyInviteStatus(invite: AcademyInviteRow, now: Date = new Date()): AcademyInviteStatus {
  if (invite.accepted_at) return 'aceito'
  if (invite.cancelled_at) return 'cancelado'
  if (new Date(invite.expires_at).getTime() < now.getTime()) return 'vencido'
  return 'aberto'
}

/** Rota do convite no app da academia. O token vai no `#`: não chega ao servidor nem aos logs. */
export const ACADEMY_INVITE_PATH = '/convite'
export const academyInviteLink = (origin: string, token: string) => `${origin.replace(/\/$/, '')}${ACADEMY_INVITE_PATH}#${token}`

/** E-mail como o banco guarda (minúsculo, sem espaços nas pontas). */
export const normalizeEmail = (email: string) => email.trim().toLowerCase()
export const isValidEmail = (email: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalizeEmail(email))

/** Requisito de senha do sistema da academia (o Supabase exige 6; aqui pedimos 8). */
export const ACADEMY_MIN_PASSWORD = 8
export function passwordIssue(password: string, confirm: string): string | null {
  if (password.length < ACADEMY_MIN_PASSWORD) return `A senha precisa ter pelo menos ${ACADEMY_MIN_PASSWORD} caracteres.`
  if (password !== confirm) return 'As senhas não conferem.'
  return null
}

/** Mensagem em português para os erros de login do Supabase Auth. */
export function authErrorMessage(error: unknown): string {
  const e = error as { message?: string; code?: string }
  const msg = e?.message ?? ''
  if (e?.code === 'email_not_confirmed' || /email not confirmed/i.test(msg)) return 'Confirme o seu e-mail pelo link que enviamos antes de entrar.'
  if (e?.code === 'invalid_credentials' || /invalid login credentials/i.test(msg)) return 'E-mail ou senha incorretos.'
  if (e?.code === 'user_already_exists' || /already registered/i.test(msg)) return 'Este e-mail já tem conta. Entre com ele.'
  if (e?.code === 'weak_password' || /password should be/i.test(msg)) return 'Senha fraca. Use pelo menos 8 caracteres, misturando letras e números.'
  if (e?.code === 'over_email_send_rate_limit' || /rate limit/i.test(msg)) return 'Muitos e-mails em pouco tempo. Aguarde alguns minutos e tente de novo.'
  if (/failed to fetch|networkerror|load failed/i.test(msg)) return 'Sem conexão. Tente de novo.'
  return msg || 'Algo deu errado.'
}
