import type { AcademyInviteStatus, AcademyRole } from '../domain/academy'
import type { Db } from '../types'
import { unwrap } from './util'

export interface Academy {
  gym_id: string
  name: string
  address: string | null
  role: AcademyRole
}

export interface AcademyMember {
  profile_id: string
  role: AcademyRole
  created_at: string
  name: string
}

export interface AcademyInvite {
  id: string
  email: string
  role: AcademyRole
  created_at: string
  expires_at: string
  accepted_at: string | null
  cancelled_at: string | null
}

export interface AcademyInviteInfo {
  academy: string
  email: string
  role: AcademyRole
  status: AcademyInviteStatus
}

/** Academias em que o usuário logado tem acesso ao sistema de gestão (vazio sem e-mail confirmado). */
export async function listMyAcademies(db: Db): Promise<Academy[]> {
  return unwrap(await db.rpc('my_academies')) as Academy[]
}

export async function updateAcademy(db: Db, gymId: string, input: { name: string; address?: string | null }): Promise<void> {
  unwrap(await db.rpc('update_academy', { p_gym_id: gymId, p_name: input.name, p_address: (input.address ?? null) as string }))
}

/** Membros da academia (só o admin vê todos; os outros, só a si mesmos). */
export async function listAcademyMembers(db: Db, gymId: string): Promise<AcademyMember[]> {
  const rows = unwrap(
    await db.from('academy_members').select('profile_id, role, created_at, profiles!academy_members_profile_id_fkey(name)').eq('gym_id', gymId),
  )
  return rows
    .map((r) => ({ profile_id: r.profile_id, role: r.role as AcademyRole, created_at: r.created_at, name: r.profiles?.name ?? '' }))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
}

/** Muda o papel de um membro; `null` remove o acesso. O banco não deixa a academia sem administrador. */
export async function setAcademyMemberRole(db: Db, gymId: string, profileId: string, role: AcademyRole | null): Promise<void> {
  unwrap(await db.rpc('set_academy_member_role', { p_gym_id: gymId, p_profile_id: profileId, p_role: role as string }))
}

export async function listAcademyInvites(db: Db, gymId: string): Promise<AcademyInvite[]> {
  return unwrap(
    await db
      .from('academy_invites')
      .select('id, email, role, created_at, expires_at, accepted_at, cancelled_at')
      .eq('gym_id', gymId)
      .order('created_at', { ascending: false }),
  ) as AcademyInvite[]
}

/** Cria o convite e devolve o token (só desta vez: o banco guarda o hash). Substitui o convite aberto do mesmo e-mail. */
export async function createAcademyInvite(db: Db, gymId: string, email: string, role: AcademyRole): Promise<string> {
  return unwrap(await db.rpc('create_academy_invite', { p_gym_id: gymId, p_email: email, p_role: role }))
}

export async function cancelAcademyInvite(db: Db, inviteId: string): Promise<void> {
  unwrap(await db.rpc('cancel_academy_invite', { p_invite_id: inviteId }))
}

/** Dados do convite pelo token (funciona sem login). null = token inválido. */
export async function academyInviteInfo(db: Db, token: string): Promise<AcademyInviteInfo | null> {
  const rows = unwrap(await db.rpc('academy_invite_info', { p_token: token })) as AcademyInviteInfo[]
  return rows[0] ?? null
}

/** Aceita o convite com a conta logada (precisa ser o e-mail convidado, confirmado). Devolve a academia. */
export async function acceptAcademyInvite(db: Db, token: string): Promise<string> {
  return unwrap(await db.rpc('accept_academy_invite', { p_token: token }))
}
