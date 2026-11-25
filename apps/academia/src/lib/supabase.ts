import { browserDb } from '@kog/web-kit'

/**
 * Cliente do Supabase do sistema da academia. Sessão própria (`storageKey`): é um login separado do app do
 * professor, mesmo quando os dois rodam na mesma origem (desenvolvimento local).
 */
export const supabase = browserDb(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
  storageKey: 'kog-academia-auth',
  // Identifica o app nas policies do banco (os alunos da academia só aparecem aqui, não no app do professor).
  headers: { 'x-kog-app': 'academia' },
})

export const db = supabase.db
export const isConfigured = supabase.isConfigured
