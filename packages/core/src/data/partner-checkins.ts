// Check-ins Gympass/TotalPass no sistema da academia: fila de pendentes, histórico, vínculos e configuração.

import type { PartnerCheckinStatus, PartnerProvider } from '../domain/partner-checkin'
import type { Db, Row } from '../types'
import { unwrap } from './util'

export type PartnerIntegration = Row<'partner_integrations'>
export type PartnerLink = Row<'partner_links'>

export interface PartnerCheckinRow {
  id: string
  provider: PartnerProvider
  external_id: string
  external_name: string | null
  external_email: string | null
  checked_in_at: string
  status: PartnerCheckinStatus
  reason: string | null
  decided_at: string | null
  validated_at: string | null
  class_id: string | null
  student: { id: string; name: string } | null
  suggested: { id: string; name: string } | null
  klass: { id: string; title: string; date: string; start_time: string | null } | null
  decider: { id: string; name: string } | null
}

const CHECKIN_SELECT =
  'id, provider, external_id, external_name, external_email, checked_in_at, status, reason, decided_at, validated_at, class_id, ' +
  'student:students!partner_checkins_student_id_fkey(id, name), suggested:students!partner_checkins_suggested_student_id_fkey(id, name), ' +
  'klass:classes!partner_checkins_class_id_fkey(id, title, date, start_time), decider:profiles!partner_checkins_decided_by_fkey(id, name)'

export type PartnerCheckinList = 'pendentes' | 'historico'

/** Pendentes (inclui os que deram erro na validação), do mais antigo; ou o histórico recente (até 200). */
export async function listPartnerCheckins(db: Db, gymId: string, list: PartnerCheckinList): Promise<PartnerCheckinRow[]> {
  const query = db.from('partner_checkins').select(CHECKIN_SELECT).eq('gym_id', gymId)
  const rows =
    list === 'pendentes'
      ? await query.in('status', ['pendente', 'erro']).order('checked_in_at', { ascending: true }).limit(500)
      : await query.in('status', ['aprovado', 'recusado']).order('checked_in_at', { ascending: false }).limit(200)
  return unwrap(rows) as unknown as PartnerCheckinRow[]
}

/** Quantos check-ins esperam a equipe (para o aviso no menu/painel). */
export async function countPendingPartnerCheckins(db: Db, gymId: string): Promise<number> {
  const { count, error } = await db
    .from('partner_checkins')
    .select('id', { count: 'exact', head: true })
    .eq('gym_id', gymId)
    .in('status', ['pendente', 'erro'])
  if (error) throw error
  return count ?? 0
}

/** Mensagem de erro da Edge Function (o supabase-js só diz "non-2xx status code"). */
async function functionError(error: unknown): Promise<Error> {
  const context = (error as { context?: { json?: () => Promise<unknown> } }).context
  if (context && typeof context.json === 'function') {
    const body = (await context.json().catch(() => null)) as { error?: string } | null
    if (body?.error) return new Error(body.error)
  }
  return error instanceof Error ? error : new Error('Não foi possível aprovar o check-in.')
}

/**
 * Aprova à mão: vincula o usuário do parceiro ao aluno (os próximos check-ins dele entram sozinhos), valida o check-in
 * no parceiro e grava a presença na aula (ou avulsa, sem aula). Se o parceiro recusar, lança o motivo.
 */
export async function approvePartnerCheckin(db: Db, input: { id: string; studentId: string; classId: string | null }): Promise<void> {
  const { data, error } = await db.functions.invoke<{ status: string; error?: string }>('partner-checkins/approve', {
    body: { id: input.id, student_id: input.studentId, class_id: input.classId },
  })
  if (error) throw await functionError(error)
  if (data?.status !== 'aprovado') throw new Error(data?.error ?? 'O parceiro recusou a validação.')
}

export async function rejectPartnerCheckin(db: Db, id: string, reason: string): Promise<void> {
  unwrap(await db.rpc('partner_checkin_reject', { p_id: id, p_reason: reason }))
}

// ── configuração ──────────────────────────────────────────────────────────────

export async function listPartnerIntegrations(db: Db, gymId: string): Promise<PartnerIntegration[]> {
  return unwrap(await db.from('partner_integrations').select('*').eq('gym_id', gymId).order('provider'))
}

export type PartnerIntegrationInput = Pick<
  PartnerIntegration,
  'external_gym_id' | 'enabled' | 'auto_approve' | 'require_class' | 'window_before_min' | 'window_after_min' | 'max_per_day'
>

export async function savePartnerIntegration(db: Db, gymId: string, provider: PartnerProvider, input: PartnerIntegrationInput): Promise<void> {
  unwrap(
    await db
      .from('partner_integrations')
      .upsert({ ...input, external_gym_id: input.external_gym_id.trim(), gym_id: gymId, provider }, { onConflict: 'gym_id,provider' }),
  )
}

// ── vínculos ──────────────────────────────────────────────────────────────────

export interface PartnerLinkRow extends PartnerLink {
  student: { id: string; name: string } | null
}

export async function listPartnerLinks(db: Db, gymId: string): Promise<PartnerLinkRow[]> {
  return unwrap(
    await db.from('partner_links').select('*, student:students(id, name)').eq('gym_id', gymId).order('created_at', { ascending: false }),
  ) as unknown as PartnerLinkRow[]
}

/** Desfaz o vínculo: o próximo check-in desse usuário volta a pedir aprovação manual. */
export async function deletePartnerLink(db: Db, link: Pick<PartnerLink, 'gym_id' | 'provider' | 'external_id'>): Promise<void> {
  unwrap(await db.from('partner_links').delete().eq('gym_id', link.gym_id).eq('provider', link.provider).eq('external_id', link.external_id))
}
