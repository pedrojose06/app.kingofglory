'use client'

import { AuthProvider as BaseAuthProvider } from '@kog/web-kit'
import type { ReactNode } from 'react'
import { supabaseClient } from './supabase'

export function AuthProvider({ children }: { children: ReactNode }) {
  return <BaseAuthProvider client={supabaseClient}>{children}</BaseAuthProvider>
}

export { useAuth, useUserId } from '@kog/web-kit'
