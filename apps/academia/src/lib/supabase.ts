import { browserDb } from '@kog/web-kit'

/**
 * Cliente do Supabase do sistema da academia. Sessão própria (`storageKey`): é um login separado do app do
 * professor, mesmo quando os dois rodam na mesma origem (desenvolvimento local).
 */
export const supabase = browserDb(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
  storageKey: 'kog-academia-auth',
})

export const db = supabase.db
export const isConfigured = supabase.isConfigured
