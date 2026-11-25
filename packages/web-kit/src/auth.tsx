'use client'

import type { Session } from '@supabase/supabase-js'
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { BrowserDb } from './supabase'

interface AuthState {
  session: Session | null
  /** false até a sessão local ser lida (não depende de rede). */
  ready: boolean
}

const AuthContext = createContext<AuthState>({ session: null, ready: false })

export function AuthProvider({ client, children }: { client: BrowserDb; children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ session: null, ready: false })

  useEffect(() => {
    if (!client.isConfigured) {
      setState({ session: null, ready: true })
      return
    }
    const { data } = client.db().auth.onAuthStateChange((_event, session) => setState({ session, ready: true }))
    return () => data.subscription.unsubscribe()
  }, [client])

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>
}

export const useAuth = () => useContext(AuthContext)
export const useUserId = () => useContext(AuthContext).session?.user.id ?? ''
