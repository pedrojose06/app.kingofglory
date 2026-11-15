import type { AttendanceReminder, Db, LessonPlanReminder } from '../types'
import { unwrap } from './util'

/**
 * Lembretes de chamada do professor: `general` é um horário para todas as turmas do dia;
 * `bySchedule` dá horário próprio a uma turma (id do horário da grade → 'HH:MM').
 */
export interface ReminderPlan {
  general: string | null
  bySchedule: Record<string, string>
}

export async function listReminders(db: Db): Promise<AttendanceReminder[]> {
  return unwrap(await db.from('attendance_reminders').select('*').order('created_at'))
}

export function toReminderPlan(rows: readonly AttendanceReminder[]): ReminderPlan {
  const plan: ReminderPlan = { general: null, bySchedule: {} }
  for (const r of rows) {
    const time = r.remind_at.slice(0, 5)
    if (r.schedule_id) plan.bySchedule[r.schedule_id] = time
    else plan.general = time
  }
  return plan
}

/** O que gravar para o banco ficar igual ao plano, mexendo só no que mudou. */
export function diffReminders(current: readonly AttendanceReminder[], plan: ReminderPlan) {
  const wanted = new Map<string | null, string>(Object.entries(plan.bySchedule))
  if (plan.general) wanted.set(null, plan.general)

  const remove: string[] = []
  const update: { id: string; remind_at: string }[] = []
  for (const r of current) {
    const time = wanted.get(r.schedule_id)
    if (time === undefined) remove.push(r.id)
    else if (time !== r.remind_at.slice(0, 5)) update.push({ id: r.id, remind_at: time })
    wanted.delete(r.schedule_id)
  }
  const insert = [...wanted].map(([schedule_id, remind_at]) => ({ schedule_id, remind_at }))
  return { remove, update, insert }
}

export async function saveReminders(db: Db, plan: ReminderPlan): Promise<void> {
  const { remove, update, insert } = diffReminders(await listReminders(db), plan)
  if (remove.length > 0) unwrap(await db.from('attendance_reminders').delete().in('id', remove))
  for (const { id, remind_at } of update) {
    unwrap(await db.from('attendance_reminders').update({ remind_at }).eq('id', id))
  }
  if (insert.length > 0) unwrap(await db.from('attendance_reminders').insert(insert))
}

/** Horário padrão do lembrete do plano de aula (São Paulo). */
export const DEFAULT_PLAN_REMINDER = '13:30'

/** Lembrete do plano de aula do professor logado; nulo = desligado. */
export async function getLessonPlanReminder(db: Db): Promise<LessonPlanReminder | null> {
  return unwrap(await db.from('lesson_plan_reminders').select('*').maybeSingle())
}

/** Liga (com o horário 'HH:MM') ou desliga (nulo) o lembrete do plano de aula. */
export async function saveLessonPlanReminder(db: Db, remindAt: string | null): Promise<void> {
  if (remindAt === null) {
    const { data } = await db.auth.getSession()
    const userId = data.session?.user.id
    if (userId) unwrap(await db.from('lesson_plan_reminders').delete().eq('profile_id', userId))
    return
  }
  unwrap(await db.from('lesson_plan_reminders').upsert({ remind_at: remindAt }, { onConflict: 'profile_id' }))
}

/** Chaves de uma PushSubscription do navegador (`subscription.toJSON()`). */
export interface PushSubscriptionKeys {
  endpoint: string
  p256dh: string
  auth: string
}

export async function savePushSubscription(db: Db, sub: PushSubscriptionKeys, userAgent?: string): Promise<void> {
  unwrap(
    await db.rpc('save_push_subscription', {
      p_endpoint: sub.endpoint,
      p_p256dh: sub.p256dh,
      p_auth: sub.auth,
      p_user_agent: userAgent,
    }),
  )
}

export async function deletePushSubscription(db: Db, endpoint: string): Promise<void> {
  unwrap(await db.from('push_subscriptions').delete().eq('endpoint', endpoint))
}

/** Pede à Edge Function uma notificação de teste nos aparelhos do usuário. Devolve quantos receberam. */
export async function sendTestPush(db: Db): Promise<{ sent: number; failed: number }> {
  const { data, error } = await db.functions.invoke<{ sent: number; failed: number }>('push-reminders', { body: {} })
  if (error) throw error
  return data ?? { sent: 0, failed: 0 }
}
