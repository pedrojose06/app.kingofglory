import type { Db } from '../types'
import { unwrap } from './util'

/**
 * Convite de professor: qualquer professor gera um link; quem abre e entra (ou cria a conta) vira professor.
 * O convite só libera o acesso: o convidado cadastra a própria academia e não vê as de quem convidou.
 * Vale para uma pessoa e expira em 7 dias.
 */

export interface InstructorInvite {
  token: string
  created_at: string
  expires_at: string
  used_at: string | null
}

export interface InviteInfo {
  invited_by: string | null
  expires_at: string
}

export const INSTRUCTOR_INVITE_PATH = '/convite'

/** Token no fragmento (#): não vai ao servidor nem aos logs. */
export function instructorInviteUrl(origin: string, token: string): string {
  return `${origin}${INSTRUCTOR_INVITE_PATH}#${token}`
}

export async function createInstructorInvite(db: Db): Promise<string> {
  return unwrap(await db.rpc('create_instructor_invite'))
}

/** Convites que eu gerei, mais recentes primeiro. */
export async function listInstructorInvites(db: Db): Promise<InstructorInvite[]> {
  return unwrap(
    await db.from('instructor_invites').select('token, created_at, expires_at, used_at').order('created_at', { ascending: false }).limit(50),
  )
}

export async function deleteInstructorInvite(db: Db, token: string): Promise<void> {
  unwrap(await db.from('instructor_invites').delete().eq('token', token))
}

/** Dados do convite para a página pública; null se vencido, usado ou inexistente. */
export async function getInviteInfo(db: Db, token: string): Promise<InviteInfo | null> {
  const data = unwrap(await db.rpc('instructor_invite_info', { p_token: token }))
  return (data ?? null) as unknown as InviteInfo | null
}

export async function acceptInstructorInvite(db: Db, token: string): Promise<void> {
  unwrap(await db.rpc('accept_instructor_invite', { p_token: token }))
}
