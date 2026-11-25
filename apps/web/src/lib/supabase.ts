import { browserDb } from '@kog/web-kit'

/** Cliente único do browser. A sessão fica no localStorage, então o app abre logado mesmo offline. */
const client = browserDb(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)

export const isConfigured = client.isConfigured
export const db = client.db
export const supabaseClient = client
