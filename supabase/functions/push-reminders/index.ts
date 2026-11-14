// Envia os lembretes de chamada por Web Push.
//
// Dois jeitos de chamar:
//  - pg_cron (header x-cron-secret): envia os lembretes vencidos, via claim_attendance_reminders().
//  - app (Authorization: Bearer <sessão>): envia uma notificação de teste aos aparelhos do próprio usuário.
//
// Deploy sem verificação de JWT (a função valida por conta própria):
//   supabase functions deploy push-reminders --no-verify-jwt
// Segredos: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, CRON_SECRET e, opcional, VAPID_SUBJECT.

import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'
import { reminderMessage, type OpenClass, type PushMessage } from './message.ts'

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

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
})

webpush.setVapidDetails(
  Deno.env.get('VAPID_SUBJECT') ?? 'https://app.kingofglory.com.br',
  Deno.env.get('VAPID_PUBLIC_KEY')!,
  Deno.env.get('VAPID_PRIVATE_KEY')!,
)

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

  const cronSecret = Deno.env.get('CRON_SECRET')
  if (cronSecret && req.headers.get('x-cron-secret') === cronSecret) {
    const { data, error } = await admin.rpc('claim_attendance_reminders')
    if (error) return json({ error: error.message }, 500)
    const claimed = (data ?? []) as Claimed[]
    const totals = { reminders: claimed.length, sent: 0, failed: 0 }
    for (const item of claimed) {
      const result = await sendAll(item.subscriptions, reminderMessage(item.reminder_id, item.classes))
      totals.sent += result.sent
      totals.failed += result.failed
    }
    return json(totals)
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
    body: 'É assim que o lembrete da chamada vai chegar neste aparelho.',
    url: '/lembretes',
    tag: 'kog-test',
  })
  return json(result)
})
