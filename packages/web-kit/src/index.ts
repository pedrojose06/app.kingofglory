// Peças de React para os apps web (professor e academia): cliente do Supabase no browser, sessão e avisos.
export { browserDb, type BrowserDb } from './supabase'
export { AuthProvider, useAuth, useUserId } from './auth'
export { toast, toastError, errorMessage, useToasts, type Toast } from './toast'
export { Toaster } from './toaster'
