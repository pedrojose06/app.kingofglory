// Adaptadores dos apps parceiros. Cada parceiro diz como conferir a assinatura do webhook, como ler o check-in do
// corpo e como validar o check-in na API dele. Sem Deno aqui (só Web Crypto e fetch), para testar com Node.
//
// IMPORTANTE: os formatos abaixo seguem a documentação da Access Control API do Wellhub (ex-Gympass) que conhecemos.
// Confirme com a documentação/sandbox que o Wellhub enviar ao liberar a integração; os pontos a conferir estão
// marcados com "CONFERIR".

export type Provider = 'gympass' | 'totalpass'

/** Check-in já normalizado, no formato que partner_checkin_receive() recebe. */
export interface CheckinEvent {
  externalGymId: string
  externalId: string
  name: string | null
  email: string | null
  checkedInAt: string // ISO 8601
  eventKey: string
}

export interface ValidateResult {
  ok: boolean
  /** Mensagem para a equipe quando o parceiro recusa (vai para o campo "motivo"). */
  error?: string
}

export interface ProviderConfig {
  apiKey?: string
  webhookSecret?: string
  baseUrl?: string
}

export interface Adapter {
  provider: Provider
  label: string
  /** false: integração ainda sem documentação/credenciais; o webhook responde 501. */
  ready: (config: ProviderConfig) => boolean
  verifySignature: (rawBody: string, headers: Headers, config: ProviderConfig) => Promise<boolean>
  /** null: evento que não é check-in (ignorado com 200). Lança erro se o corpo for inválido. */
  parse: (body: unknown) => CheckinEvent | null
  validate: (event: { externalGymId: string; externalId: string }, config: ProviderConfig, fetcher?: typeof fetch) => Promise<ValidateResult>
}

// ── utilidades ────────────────────────────────────────────────────────────────

const encoder = new TextEncoder()

export async function hmacHex(algorithm: 'SHA-1' | 'SHA-256', secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: algorithm }, false, ['sign'])
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(message))
  return Array.from(new Uint8Array(signature), (b) => b.toString(16).padStart(2, '0')).join('')
}

/** Compara sem vazar pelo tempo onde as strings diferem. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : typeof v === 'number' ? String(v) : null)

/** Aceita ISO 8601, segundos ou milissegundos desde 1970. */
export function toIso(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Date(value < 1e12 ? value * 1000 : value).toISOString()
  }
  if (typeof value === 'string' && value.trim()) {
    if (/^\d+$/.test(value.trim())) return toIso(Number(value.trim()))
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? null : date.toISOString()
  }
  return null
}

// ── Wellhub (Gympass) ─────────────────────────────────────────────────────────

const WELLHUB_URL = 'https://api.partners.gympass.com' // sandbox: https://apitesting.partners.gympass.com (CONFERIR)

export const wellhub: Adapter = {
  provider: 'gympass',
  label: 'Gympass',
  ready: (config) => Boolean(config.apiKey && config.webhookSecret),

  // CONFERIR: header X-Gympass-Signature = HMAC-SHA1 do corpo cru, em hexadecimal, com o segredo do webhook.
  async verifySignature(rawBody, headers, config) {
    const received = headers.get('x-gympass-signature')?.trim().toLowerCase()
    if (!received || !config.webhookSecret) return false
    const expected = await hmacHex('SHA-1', config.webhookSecret, rawBody)
    return safeEqual(received, expected)
  },

  // CONFERIR: { event_type: "checkin", event_data: { user: { unique_token, first_name, last_name, email },
  //            gym: { id }, timestamp } }
  parse(body) {
    const b = body as { event_type?: unknown; event_data?: Record<string, unknown> } | null
    if (!b || typeof b !== 'object') throw new Error('Corpo inválido')
    const type = str(b.event_type)?.toLowerCase()
    if (type && type !== 'checkin' && type !== 'check-in' && type !== 'check_in') return null
    const data = (b.event_data ?? {}) as Record<string, unknown>
    const user = (data.user ?? {}) as Record<string, unknown>
    const gym = (data.gym ?? {}) as Record<string, unknown>
    const externalId = str(user.unique_token) ?? str(user.gympass_id) ?? str(user.id)
    const externalGymId = str(gym.id) ?? str(data.gym_id)
    const checkedInAt = toIso(data.timestamp ?? data.checkin_at ?? data.created_at)
    if (!externalId || !externalGymId || !checkedInAt) throw new Error('Check-in sem usuário, academia ou horário')
    const name = [str(user.first_name), str(user.last_name)].filter(Boolean).join(' ') || str(user.name)
    return {
      externalGymId,
      externalId,
      name: name || null,
      email: str(user.email),
      checkedInAt,
      eventKey: `gympass:${externalGymId}:${externalId}:${checkedInAt}`,
    }
  },

  // CONFERIR: POST {base}/access/v1/validate, Authorization: Bearer <API key>, X-Gym-Id: <gym id>,
  //           corpo { "gympass_id": "<unique_token>" }. 200 = validado.
  async validate(event, config, fetcher = fetch) {
    if (!config.apiKey) return { ok: false, error: 'Chave da API do Gympass não configurada' }
    let response: Response
    try {
      response = await fetcher(`${config.baseUrl || WELLHUB_URL}/access/v1/validate`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          'X-Gym-Id': event.externalGymId,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ gympass_id: event.externalId }),
        signal: AbortSignal.timeout(10_000),
      })
    } catch (error) {
      return { ok: false, error: `Gympass fora do ar: ${(error as Error).message}` }
    }
    if (response.ok) return { ok: true }
    const text = await response.text().catch(() => '')
    return { ok: false, error: `Gympass recusou a validação (${response.status})${text ? `: ${text.slice(0, 300)}` : ''}` }
  },
}

// ── TotalPass ─────────────────────────────────────────────────────────────────
// A TotalPass não publica a API de integração: é preciso pedir a documentação ao gerente de conta. Enquanto isso,
// o webhook responde 501 e os check-ins TotalPass continuam sendo lançados à mão.
export const totalpass: Adapter = {
  provider: 'totalpass',
  label: 'TotalPass',
  ready: () => false,
  verifySignature: async () => false,
  parse: () => {
    throw new Error('Integração TotalPass ainda não implementada')
  },
  validate: async () => ({ ok: false, error: 'Integração TotalPass ainda não implementada' }),
}

export const adapters: Record<Provider, Adapter> = { gympass: wellhub, totalpass }

/** Rota do webhook → parceiro (/partner-checkins/gympass, /wellhub ou /totalpass). */
export function providerFromPath(pathname: string): Provider | null {
  const last = pathname.replace(/\/+$/, '').split('/').pop()?.toLowerCase()
  if (last === 'gympass' || last === 'wellhub') return 'gympass'
  if (last === 'totalpass') return 'totalpass'
  return null
}
