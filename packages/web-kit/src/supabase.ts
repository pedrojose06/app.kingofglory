import { createSupabase, type Db } from '@kog/core'

export interface BrowserDb {
  /** false quando as variáveis NEXT_PUBLIC_SUPABASE_* não foram configuradas. */
  isConfigured: boolean
  /** Cliente único do browser (criado no primeiro uso). */
  db: () => Db
}

/**
 * Cliente do Supabase para um app web. A sessão fica no localStorage da origem do app, então cada app
 * (professor, academia) tem o próprio login. `storageKey` separa as sessões mesmo na mesma origem (dev local).
 */
export function browserDb(url: string | undefined, key: string | undefined, options: { storageKey?: string } = {}): BrowserDb {
  let client: Db | undefined
  return {
    isConfigured: Boolean(url && key),
    db() {
      if (!client) {
        if (!url || !key) throw new Error('Variáveis NEXT_PUBLIC_SUPABASE_* não configuradas')
        client = createSupabase(url, key, { storage: window.localStorage, detectSessionInUrl: true, storageKey: options.storageKey })
      }
      return client
    },
  }
}
