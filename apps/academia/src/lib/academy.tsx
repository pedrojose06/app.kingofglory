'use client'

import { type Academy, type AcademyRole, listMyAcademies } from '@kog/core'
import { useAuth } from '@kog/web-kit'
import { useQuery } from '@tanstack/react-query'
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { db } from './supabase'

const SELECTED_KEY = 'kog-academia-selecionada'

export const academyKeys = {
  mine: (userId: string) => ['academia', 'minhas', userId] as const,
  members: (gymId: string) => ['academia', gymId, 'membros'] as const,
  invites: (gymId: string) => ['academia', gymId, 'convites'] as const,
}

export function useMyAcademies() {
  const { session } = useAuth()
  const userId = session?.user.id ?? ''
  return useQuery({ queryKey: academyKeys.mine(userId), queryFn: () => listMyAcademies(db()), enabled: Boolean(userId) })
}

interface CurrentAcademy {
  academy: Academy
  role: AcademyRole
  isAdmin: boolean
  isStaff: boolean
  all: Academy[]
  select: (gymId: string) => void
}

const AcademyContext = createContext<CurrentAcademy | null>(null)

const readSelected = () => {
  try {
    return localStorage.getItem(SELECTED_KEY)
  } catch {
    return null
  }
}

/** Academia em uso (a escolhida por último neste navegador, ou a primeira). */
export function AcademyProvider({ academies, children }: { academies: Academy[]; children: ReactNode }) {
  const [selected, setSelected] = useState<string | null>(null)
  useEffect(() => setSelected(readSelected()), [])

  const select = useCallback((gymId: string) => {
    setSelected(gymId)
    try {
      localStorage.setItem(SELECTED_KEY, gymId)
    } catch {}
  }, [])

  const value = useMemo<CurrentAcademy | null>(() => {
    const academy = academies.find((a) => a.gym_id === selected) ?? academies[0]
    if (!academy) return null
    return {
      academy,
      role: academy.role,
      isAdmin: academy.role === 'admin',
      isStaff: academy.role === 'admin' || academy.role === 'professor',
      all: academies,
      select,
    }
  }, [academies, selected, select])

  return <AcademyContext.Provider value={value}>{children}</AcademyContext.Provider>
}

export function useAcademy(): CurrentAcademy {
  const value = useContext(AcademyContext)
  if (!value) throw new Error('useAcademy fora do AcademyProvider')
  return value
}
