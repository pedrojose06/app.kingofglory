// Envia os lembretes de chamada e do plano de aula, o aviso de revisão do plano pelo mestre e o lembrete de aula
// do aluno, por Web Push.
//
// Dois jeitos de chamar:
//  - pg_cron ou banco (header x-cron-secret): envia os lembretes vencidos e as revisões pendentes, via
//    claim_attendance_reminders(), claim_lesson_plan_reminders(), claim_plan_review_notifications() e
//    claim_student_class_reminders().
//  - app (Authorization: Bearer <sessão>): envia uma notificação de teste aos aparelhos do próprio usuário.
//
// Deploy sem verificação de JWT (a função valida por conta própria):
//   supabase functions deploy push-reminders --no-verify-jwt
// Segredos: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY e, opcional, VAPID_SUBJECT.
// O segredo do cron fica só no Vault do banco (push_reminders_secret), conferido por cron_secret_matches().

import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'
import { lessonPlanMessage, planReviewMessage, reminderMessage, studentClassMessage, type OpenClass, type PlanClass, type PlanReview, type PushMessage } from './message.ts'

interface Subscription {
  id: string
  endpoint: string
  p256dh: string
  auth: string
}

interface Claimed {
  reminder_id: string
  classes: OpenClass[]
  subscriptions: Subscription[]
}

interface ClaimedPlan {
  profile_id: string
  classes: PlanClass[]
  subscriptions: Subscription[]
}

interface ClaimedStudent {
  profile_id: string
  classes: OpenClass[]
  subscriptions: Subscription[]
}

interface ClaimedReview extends PlanReview {
  subscriptions: Subscription[]
}

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const vapidPublic = Deno.env.get('VAPID_PUBLIC_KEY')
const vapidPrivate = Deno.env.get('VAPID_PRIVATE_KEY')
if (vapidPublic && vapidPrivate) {
  webpush.setVapidDetails(Deno.env.get('VAPID_SUBJECT') ?? 'https://app.kingofglory.com.br', vapidPublic, vapidPrivate)
}

/** Envia para vários aparelhos; inscrições que o navegador já cancelou (404/410) são apagadas. */
async function sendAll(subscriptions: Subscription[], message: PushMessage) {
  const payload = JSON.stringify(message)
  const gone: string[] = []
  let sent = 0
  let failed = 0
  await Promise.all(
    subscriptions.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, {
          TTL: 6 * 60 * 60,
          urgency: 'high',
        })
        sent++
      } catch (error) {
        failed++
        const status = (error as { statusCode?: number }).statusCode
        if (status === 404 || status === 410) gone.push(s.id)
        else console.error('push failed', status, (error as Error).message)
      }
    }),
  )
  if (gone.length > 0) await admin.from('push_subscriptions').delete().in('id', gone)
  return { sent, failed }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)

  if (!vapidPublic || !vapidPrivate) return json({ error: 'VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY não configuradas' }, 500)

  const cronHeader = req.headers.get('x-cron-secret')
  if (cronHeader) {
    const { data: ok, error: checkError } = await admin.rpc('cron_secret_matches', { p_secret: cronHeader })
    if (checkError) return json({ error: checkError.message }, 500)
    if (!ok) return json({ error: 'unauthorized' }, 401)
    const [attendance, plans, reviews, students] = await Promise.all([
      admin.rpc('claim_attendance_reminders'),
      admin.rpc('claim_lesson_plan_reminders'),
      admin.rpc('claim_plan_review_notifications'),
      admin.rpc('claim_student_class_reminders'),
    ])
    // Um claim que falhou não impede o envio dos outros (o que já foi marcado como enviado não se perde).
    const error = attendance.error ?? plans.error ?? reviews.error ?? students.error
    const messages = [
      ...((attendance.data ?? []) as Claimed[]).map((c) => ({ to: c.subscriptions, msg: reminderMessage(c.reminder_id, c.classes) })),
      ...((plans.data ?? []) as ClaimedPlan[]).map((c) => ({ to: c.subscriptions, msg: lessonPlanMessage(c.profile_id, c.classes) })),
      ...((reviews.data ?? []) as ClaimedReview[]).map((c) => ({ to: c.subscriptions, msg: planReviewMessage(c) })),
      ...((students.data ?? []) as ClaimedStudent[]).map((c) => ({ to: c.subscriptions, msg: studentClassMessage(c.profile_id, c.classes) })),
    ]
    const totals = { reminders: messages.length, sent: 0, failed: 0 }
    for (const { to, msg } of messages) {
      const result = await sendAll(to, msg)
      totals.sent += result.sent
      totals.failed += result.failed
    }
    return error ? json({ ...totals, error: error.message }, 500) : json(totals)
  }

  // Teste pedido pelo app: só para os aparelhos de quem está logado.
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? ''
  const { data: auth } = await admin.auth.getUser(token)
  if (!auth?.user) return json({ error: 'unauthorized' }, 401)

  const { data: subscriptions, error } = await admin
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('profile_id', auth.user.id)
  if (error) return json({ error: error.message }, 500)

  const result = await sendAll((subscriptions ?? []) as Subscription[], {
    title: 'Notificações ativadas',
    body: 'É assim que os lembretes da chamada e do plano de aula vão chegar neste aparelho.',
    url: '/lembretes',
    tag: 'kog-test',
  })
  return json(result)
})
