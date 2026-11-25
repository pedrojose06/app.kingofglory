// Check-ins dos apps parceiros (Gympass/Wellhub e TotalPass), com aprovação automática.
//
// Rotas (POST):
//  - /partner-checkins/gympass (ou /wellhub), /partner-checkins/totalpass: webhook do parceiro. Confere a assinatura,
//    grava o check-in (partner_checkin_receive) e, se passar nas regras da academia, valida no parceiro e grava a
//    presença (partner_checkin_finish). Senão, o check-in fica pendente para a equipe.
//  - /partner-checkins/approve: aprovação manual pelo app da academia (Authorization: Bearer <sessão>), corpo
//    { id, student_id, class_id? }. A permissão é conferida no banco (partner_checkin_prepare, só equipe da academia).
//
// Deploy sem verificação de JWT (o webhook do parceiro não tem sessão; a função confere a assinatura):
//   supabase functions deploy partner-checkins --no-verify-jwt
// Segredos: GYMPASS_API_KEY, GYMPASS_WEBHOOK_SECRET e, opcional, GYMPASS_API_URL (sandbox do Wellhub nos testes).
// URL a cadastrar no Wellhub: https://<projeto>.supabase.co/functions/v1/partner-checkins/gympass

import { createClient } from 'npm:@supabase/supabase-js@2'
import { adapters, type Provider, type ProviderConfig, providerFromPath } from './providers.ts'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-kog-app',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

const url = Deno.env.get('SUPABASE_URL')!
// Chave pública do projeto: a que o app mandou (header apikey) ou a do ambiente.
const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const configs: Record<Provider, ProviderConfig> = {
  gympass: {
    apiKey: Deno.env.get('GYMPASS_API_KEY'),
    webhookSecret: Deno.env.get('GYMPASS_WEBHOOK_SECRET'),
    baseUrl: Deno.env.get('GYMPASS_API_URL'),
  },
  totalpass: {
    apiKey: Deno.env.get('TOTALPASS_API_KEY'),
    webhookSecret: Deno.env.get('TOTALPASS_WEBHOOK_SECRET'),
    baseUrl: Deno.env.get('TOTALPASS_API_URL'),
  },
}

/** Valida no parceiro e conclui no banco (grava a presença ou marca "erro" com o motivo). */
async function validateAndFinish(provider: Provider, id: string, externalGymId: string, externalId: string) {
  const result = await adapters[provider].validate({ externalGymId, externalId }, configs[provider])
  const { error } = await admin.rpc('partner_checkin_finish', { p_id: id, p_error: result.ok ? null : (result.error ?? 'Validação recusada') })
  if (error) throw new Error(error.message)
  return result.ok ? 'aprovado' : 'erro'
}

async function webhook(req: Request, provider: Provider) {
  const adapter = adapters[provider]
  const config = configs[provider]
  if (!adapter.ready(config)) return json({ error: `Integração ${adapter.label} não configurada` }, 501)

  const raw = await req.text()
  if (!(await adapter.verifySignature(raw, req.headers, config))) return json({ error: 'invalid signature' }, 401)

  let event
  try {
    event = adapter.parse(JSON.parse(raw))
  } catch (error) {
    return json({ error: (error as Error).message }, 400)
  }
  if (!event) return json({ ignored: true })

  const { data, error } = await admin.rpc('partner_checkin_receive', {
    p_provider: provider,
    p_external_gym_id: event.externalGymId,
    p_external_id: event.externalId,
    p_name: event.name,
    p_email: event.email,
    p_checked_in_at: event.checkedInAt,
    p_event_key: event.eventKey,
    p_payload: JSON.parse(raw),
  })
  if (error) {
    console.error('receive failed', error.message)
    return json({ error: 'internal error' }, 500)
  }
  const received = data as { id?: string; approve: boolean; reason?: string; ignored?: boolean; duplicate?: boolean }
  if (!received.approve || !received.id) return json({ ...received, status: received.ignored || received.duplicate ? undefined : 'pendente' })

  try {
    const status = await validateAndFinish(provider, received.id, event.externalGymId, event.externalId)
    return json({ id: received.id, status })
  } catch (error) {
    // O check-in já está gravado como pendente: a equipe aprova no app.
    console.error('finish failed', (error as Error).message)
    return json({ id: received.id, status: 'pendente' })
  }
}

async function approve(req: Request) {
  const authorization = req.headers.get('authorization') ?? ''
  if (!/^Bearer\s+\S+/i.test(authorization)) return json({ error: 'unauthorized' }, 401)
  const body = (await req.json().catch(() => null)) as { id?: string; student_id?: string; class_id?: string | null } | null
  if (!body?.id || !body.student_id) return json({ error: 'Informe o check-in e o aluno.' }, 400)

  // Com a sessão de quem pediu: o banco confere se é da equipe da academia.
  const asUser = createClient(url, req.headers.get('apikey') || anonKey, {
    global: { headers: { Authorization: authorization, 'x-kog-app': 'academia' } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data, error } = await asUser.rpc('partner_checkin_prepare', {
    p_id: body.id,
    p_student_id: body.student_id,
    p_class_id: body.class_id ?? null,
  })
  if (error) return json({ error: error.message }, 400)
  const prepared = data as { id: string; provider: Provider; external_gym_id: string; external_id: string }

  try {
    const status = await validateAndFinish(prepared.provider, prepared.id, prepared.external_gym_id, prepared.external_id)
    if (status === 'erro') {
      const { data: row } = await admin.from('partner_checkins').select('reason').eq('id', prepared.id).single()
      return json({ id: prepared.id, status, error: row?.reason ?? 'O parceiro recusou a validação.' })
    }
    return json({ id: prepared.id, status })
  } catch (error) {
    return json({ error: (error as Error).message }, 500)
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)
  const { pathname } = new URL(req.url)
  if (/\/approve\/?$/.test(pathname)) return approve(req)
  const provider = providerFromPath(pathname)
  if (!provider) return json({ error: 'not found' }, 404)
  return webhook(req, provider)
})
