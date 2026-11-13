import { createSupabase, type Db } from '@kog/core'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

export const isConfigured = Boolean(url && key)

let client: Db | undefined

/** Cliente único do browser. A sessão fica no localStorage, então o app abre logado mesmo offline. */
export function db(): Db {
  if (!client) {
    if (!url || !key) throw new Error('Variáveis NEXT_PUBLIC_SUPABASE_* não configuradas')
    client = createSupabase(url, key, { storage: window.localStorage, detectSessionInUrl: true })
  }
  return client
}
