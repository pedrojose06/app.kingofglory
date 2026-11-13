'use client'

import type { Session } from '@supabase/supabase-js'
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { db, isConfigured } from './supabase'

interface AuthState {
  session: Session | null
  /** false até a sessão local ser lida (não depende de rede). */
  ready: boolean
}

const AuthContext = createContext<AuthState>({ session: null, ready: false })

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ session: null, ready: false })

  useEffect(() => {
    if (!isConfigured) {
      setState({ session: null, ready: true })
      return
    }
    const { data } = db().auth.onAuthStateChange((_event, session) => setState({ session, ready: true }))
    return () => data.subscription.unsubscribe()
  }, [])

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>
}

export const useAuth = () => useContext(AuthContext)
export const useUserId = () => useContext(AuthContext).session?.user.id ?? ''
