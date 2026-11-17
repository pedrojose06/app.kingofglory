// Envia os lembretes de chamada e do plano de aula, o aviso de revisão do plano pelo mestre e o lembrete de aula
// do aluno, por Web Push; e o aviso de acesso aprovado ao aluno, por Web Push e e-mail.
//
// Dois jeitos de chamar:
//  - pg_cron ou banco (header x-cron-secret): envia os lembretes vencidos e as revisões pendentes, via
//    claim_attendance_reminders(), claim_lesson_plan_reminders(), claim_plan_review_notifications(),
//    claim_student_class_reminders() e claim_student_approval_notifications().
//  - app (Authorization: Bearer <sessão>): envia uma notificação de teste aos aparelhos do próprio usuário.
//
// Deploy sem verificação de JWT (a função valida por conta própria):
//   supabase functions deploy push-reminders --no-verify-jwt
// Segredos: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY e, opcional, VAPID_SUBJECT.
// E-mail (opcional; sem eles o aviso de aprovação sai só por push): SMTP_HOST, SMTP_USER, SMTP_PASS e, opcionais,
// SMTP_PORT (padrão 465, SSL; a Edge Function não pode usar as portas 25 e 587) e SMTP_FROM.
// O segredo do cron fica só no Vault do banco (push_reminders_secret), conferido por cron_secret_matches().

import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'
import { approvalEmail, type EmailMessage } from './email.ts'
import { approvalMessage, lessonPlanMessage, planReviewMessage, reminderMessage, studentClassMessage, type OpenClass, type PlanClass, type PlanReview, type PushMessage } from './message.ts'

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

interface ClaimedApproval {
  profile_id: string
  name: string | null
  email: string | null
  gym: string
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

const smtpHost = Deno.env.get('SMTP_HOST')
const smtpUser = Deno.env.get('SMTP_USER')
const smtpPass = Deno.env.get('SMTP_PASS')
const smtpPort = Number(Deno.env.get('SMTP_PORT') ?? 465)
const smtpFrom = Deno.env.get('SMTP_FROM') ?? 'King of Glory <nao-responda@kingofglory.com.br>'
// Carregado só na hora de mandar e-mail: um problema na biblioteca nunca derruba os lembretes por push.
let mailer: { sendMail: (m: Record<string, unknown>) => Promise<unknown> } | null = null
async function getMailer() {
  if (!mailer && smtpHost && smtpUser && smtpPass) {
    const { default: nodemailer } = await import('npm:nodemailer@6.9.16')
    mailer = nodemailer.createTransport({ host: smtpHost, port: smtpPort, secure: smtpPort === 465, auth: { user: smtpUser, pass: smtpPass },
      // Servidor lento não pode segurar a função (limite de tempo da Edge Function).
      connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 20_000 })
  }
  return mailer
}

/** Envia um e-mail; sem SMTP configurado, não envia. Falha não interrompe os outros avisos. */
async function sendEmail(message: EmailMessage): Promise<boolean> {
  if (!smtpHost || !smtpUser || !smtpPass) return false
  try {
    const mailer = await getMailer()
    if (!mailer) return false
    await mailer.sendMail({ from: smtpFrom, to: message.to, subject: message.subject, html: message.html, text: message.text })
    return true
  } catch (error) {
    console.error('email failed', (error as Error).message)
    return false
  }
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
    const [attendance, plans, reviews, students, approvals] = await Promise.all([
      admin.rpc('claim_attendance_reminders'),
      admin.rpc('claim_lesson_plan_reminders'),
      admin.rpc('claim_plan_review_notifications'),
      admin.rpc('claim_student_class_reminders'),
      admin.rpc('claim_student_approval_notifications'),
    ])
    // Um claim que falhou não impede o envio dos outros (o que já foi marcado como enviado não se perde).
    const error = attendance.error ?? plans.error ?? reviews.error ?? students.error ?? approvals.error
    const approved = (approvals.data ?? []) as ClaimedApproval[]
    const messages = [
      ...((attendance.data ?? []) as Claimed[]).map((c) => ({ to: c.subscriptions, msg: reminderMessage(c.reminder_id, c.classes) })),
      ...((plans.data ?? []) as ClaimedPlan[]).map((c) => ({ to: c.subscriptions, msg: lessonPlanMessage(c.profile_id, c.classes) })),
      ...((reviews.data ?? []) as ClaimedReview[]).map((c) => ({ to: c.subscriptions, msg: planReviewMessage(c) })),
      ...((students.data ?? []) as ClaimedStudent[]).map((c) => ({ to: c.subscriptions, msg: studentClassMessage(c.profile_id, c.classes) })),
      ...approved.filter((c) => c.subscriptions.length > 0).map((c) => ({ to: c.subscriptions, msg: approvalMessage(c.profile_id, c.gym) })),
    ]
    const totals = { reminders: messages.length, sent: 0, failed: 0, emails: 0 }
    for (const { to, msg } of messages) {
      const result = await sendAll(to, msg)
      totals.sent += result.sent
      totals.failed += result.failed
    }
    // E-mail depois do push: um servidor de e-mail lento não atrasa os avisos.
    for (const c of approved) {
      if (c.email && (await sendEmail(approvalEmail({ to: c.email, name: c.name, gym: c.gym })))) totals.emails++
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
