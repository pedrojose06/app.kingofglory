import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'
import type { Db } from './types'

/** Storage de sessão injetável: localStorage no web, AsyncStorage no Expo. */
export interface SessionStorage {
  getItem(key: string): string | null | Promise<string | null>
  setItem(key: string, value: string): void | Promise<void>
  removeItem(key: string): void | Promise<void>
}

export interface CreateSupabaseOptions {
  storage?: SessionStorage
  /** true no web (lê o token da URL em links de recuperação de senha); false no nativo. */
  detectSessionInUrl?: boolean
  /** Chave da sessão no storage. Padrão do supabase-js quando omitida (não muda a sessão de quem já está logado). */
  storageKey?: string
}

export function createSupabase(url: string, publishableKey: string, options: CreateSupabaseOptions = {}): Db {
  return createClient<Database>(url, publishableKey, {
    auth: {
      storage: options.storage,
      ...(options.storageKey ? { storageKey: options.storageKey } : {}),
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: options.detectSessionInUrl ?? false,
    },
  })
}

/** Erro de rede (sem resposta do servidor) — a fila offline tenta de novo; outros erros são definitivos. */
export function isNetworkError(error: unknown): boolean {
  if (!error) return false
  const e = error as { message?: string; name?: string; status?: number; code?: string }
  if (e.name === 'AuthRetryableFetchError' || e.name === 'StorageUnknownError') return true
  const msg = String(e.message ?? error)
  return /failed to fetch|networkerror|network request failed|load failed|fetch failed|timeout/i.test(msg)
}
