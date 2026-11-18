import type { Json } from '../database.types'
import type { ClassStatus, Db } from '../types'
import { chunk, unwrap } from './util'

/**
 * Compartilhar o plano de aula: link secreto por aula (`lesson_plan_shares.token`). O mestre abre sem login,
 * lê o plano e aprova ou pede ajustes; o professor vê a revisão na aba Plano.
 */

export type PlanReviewStatus = 'approved' | 'changes_requested'

export interface PlanReview {
  status: PlanReviewStatus
  note: string | null
  reviewer_name: string | null
  reviewed_at: string
}

export interface PlanShare {
  token: string
  created_at: string
  last_seen_at: string | null
  review_status: PlanReviewStatus | null
  review_note: string | null
  reviewer_name: string | null
  reviewed_at: string | null
}

export interface SharedPlan {
  class: { date: string; start_time: string | null; title: string | null; status: ClassStatus }
  gym_name: string
  instructor_name: string | null
  /** Documento do Tiptap; null se o plano ainda não foi escrito. */
  content: Json | null
  updated_at: string | null
  review: PlanReview | null
}

export const PLAN_REVIEW_LABEL: Record<PlanReviewStatus, string> = {
  approved: 'Aprovado',
  changes_requested: 'Ajustes pedidos',
}

/** O plano mudou depois da revisão (a aprovação pode estar desatualizada). */
export const editedAfterReview = (planUpdatedAt: string | null | undefined, reviewedAt: string | null | undefined): boolean =>
  !!planUpdatedAt && !!reviewedAt && Date.parse(planUpdatedAt) > Date.parse(reviewedAt)

export async function getPlanShare(db: Db, classId: string): Promise<PlanShare | null> {
  const row = unwrap(
    await db
      .from('lesson_plan_shares')
      .select('token, created_at, last_seen_at, review_status, review_note, reviewer_name, reviewed_at')
      .eq('class_id', classId)
      .maybeSingle(),
  )
  return row as PlanShare | null
}

/** Revisão do mestre por aula (só as aulas com plano compartilhado e já revisado). */
export async function listPlanReviews(db: Db, classIds: readonly string[]): Promise<Record<string, PlanReviewStatus>> {
  const reviews: Record<string, PlanReviewStatus> = {}
  for (const ids of chunk(classIds, 100)) {
    const rows = unwrap(
      await db.from('lesson_plan_shares').select('class_id, review_status').in('class_id', ids).not('review_status', 'is', null),
    )
    for (const r of rows) if (r.review_status) reviews[r.class_id] = r.review_status as PlanReviewStatus
  }
  return reviews
}

/** Gera o link do plano ou troca o atual (o antigo para de funcionar e a revisão zera). Devolve o token novo. */
export async function rotatePlanShare(db: Db, classId: string): Promise<string> {
  return unwrap(await db.rpc('rotate_lesson_plan_share', { p_class_id: classId }))
}

export async function revokePlanShare(db: Db, classId: string): Promise<void> {
  unwrap(await db.from('lesson_plan_shares').delete().eq('class_id', classId))
}

/** Plano pelo link; null se o link não existe ou foi desativado. Funciona sem login. */
export async function getSharedPlan(db: Db, token: string): Promise<SharedPlan | null> {
  const data = unwrap(await db.rpc('shared_lesson_plan', { p_token: token }))
  return (data ?? null) as unknown as SharedPlan | null
}

/** Revisão do mestre pelo link. Devolve false se o link foi desativado. */
export async function reviewSharedPlan(
  db: Db,
  token: string,
  review: { status: PlanReviewStatus; note?: string; reviewerName?: string },
): Promise<boolean> {
  return unwrap(
    await db.rpc('review_shared_lesson_plan', {
      p_token: token,
      p_status: review.status,
      p_note: review.note ?? '',
      p_reviewer_name: review.reviewerName ?? '',
    }),
  )
}

const stamp = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo',
})
/** "16/11, 14:05" no horário de São Paulo (aberto, revisado, atualizado). */
export const formatStamp = (iso: string): string => stamp.format(new Date(iso))

export const SHARED_PLAN_PATH = '/plano'

/** Link que o mestre recebe. O token vai no fragmento (#), que não é enviado ao servidor nem fica em logs. */
export function sharedPlanUrl(origin: string, token: string): string {
  return `${origin}${SHARED_PLAN_PATH}#${token}`
}
