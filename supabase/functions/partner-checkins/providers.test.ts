// Rodar: node --experimental-strip-types --test supabase/functions/partner-checkins/providers.test.ts
// (ou deno test supabase/functions/partner-checkins/providers.test.ts)
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { hmacHex, providerFromPath, safeEqual, toIso, totalpass, wellhub } from './providers.ts'

const body = {
  event_type: 'checkin',
  event_data: {
    user: { unique_token: '1234567890123', first_name: 'Ana', last_name: 'Souza', email: 'ana@exemplo.com' },
    gym: { id: 98765, title: 'King of Glory' },
    timestamp: 1796151600, // 2026-12-01T19:00:00Z
  },
}

test('lê o check-in do Wellhub', () => {
  assert.deepEqual(wellhub.parse(body), {
    externalGymId: '98765',
    externalId: '1234567890123',
    name: 'Ana Souza',
    email: 'ana@exemplo.com',
    checkedInAt: '2026-12-01T19:00:00.000Z',
    eventKey: 'gympass:98765:1234567890123:2026-12-01T19:00:00.000Z',
  })
})

test('ignora eventos que não são check-in e recusa corpo incompleto', () => {
  assert.equal(wellhub.parse({ event_type: 'booking-requested', event_data: {} }), null)
  assert.throws(() => wellhub.parse({ event_type: 'checkin', event_data: { user: {} } }))
  assert.throws(() => wellhub.parse(null))
})

test('confere a assinatura HMAC do webhook', async () => {
  const raw = JSON.stringify(body)
  const signature = await hmacHex('SHA-1', 'segredo', raw)
  const config = { webhookSecret: 'segredo', apiKey: 'k' }
  assert.equal(await wellhub.verifySignature(raw, new Headers({ 'X-Gympass-Signature': signature.toUpperCase() }), config), true)
  assert.equal(await wellhub.verifySignature(raw + ' ', new Headers({ 'X-Gympass-Signature': signature }), config), false)
  assert.equal(await wellhub.verifySignature(raw, new Headers(), config), false)
  assert.equal(await wellhub.verifySignature(raw, new Headers({ 'X-Gympass-Signature': signature }), { apiKey: 'k' }), false)
})

test('HMAC-SHA1 confere com o vetor conhecido', async () => {
  // RFC 2202, caso 2.
  assert.equal(await hmacHex('SHA-1', 'Jefe', 'what do ya want for nothing?'), 'effcdf6ae5eb2fa2d27416d5f184df9c259a7c79')
})

test('valida o check-in na API do Wellhub', async () => {
  const calls: { url: string; init: RequestInit }[] = []
  const ok = (async (url: string, init: RequestInit) => {
    calls.push({ url, init })
    return new Response('{}', { status: 200 })
  }) as unknown as typeof fetch
  assert.deepEqual(await wellhub.validate({ externalGymId: '98765', externalId: '123' }, { apiKey: 'chave' }, ok), { ok: true })
  assert.equal(calls[0]!.url, 'https://api.partners.gympass.com/access/v1/validate')
  const headers = calls[0]!.init.headers as Record<string, string>
  assert.equal(headers.Authorization, 'Bearer chave')
  assert.equal(headers['X-Gym-Id'], '98765')
  assert.equal(calls[0]!.init.body, '{"gympass_id":"123"}')

  const refused = (async () => new Response('check-in not found', { status: 404 })) as unknown as typeof fetch
  const result = await wellhub.validate({ externalGymId: '1', externalId: '2' }, { apiKey: 'chave', baseUrl: 'https://sandbox' }, refused)
  assert.equal(result.ok, false)
  assert.match(result.error!, /404.*not found/)
  assert.deepEqual(await wellhub.validate({ externalGymId: '1', externalId: '2' }, {}, ok), { ok: false, error: 'Chave da API do Gympass não configurada' })
})

test('TotalPass fica desligado até ter a documentação', () => {
  assert.equal(totalpass.ready({ apiKey: 'x', webhookSecret: 'y' }), false)
})

test('rotas e utilidades', () => {
  assert.equal(providerFromPath('/partner-checkins/gympass'), 'gympass')
  assert.equal(providerFromPath('/functions/v1/partner-checkins/wellhub/'), 'gympass')
  assert.equal(providerFromPath('/partner-checkins/totalpass'), 'totalpass')
  assert.equal(providerFromPath('/partner-checkins/approve'), null)
  assert.equal(toIso('2026-12-01T16:00:00-03:00'), '2026-12-01T19:00:00.000Z')
  assert.equal(toIso(1796151600000), '2026-12-01T19:00:00.000Z')
  assert.equal(toIso('1796151600'), '2026-12-01T19:00:00.000Z')
  assert.equal(toIso('abc'), null)
  assert.equal(safeEqual('abc', 'abc'), true)
  assert.equal(safeEqual('abc', 'abd'), false)
})
