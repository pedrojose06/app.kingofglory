'use client'

import { useSyncExternalStore } from 'react'

export interface Toast {
  id: number
  message: string
  tone: 'info' | 'error'
}

let toasts: Toast[] = []
let seq = 0
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

export function toast(message: string, tone: Toast['tone'] = 'info') {
  const id = ++seq
  toasts = [...toasts, { id, message, tone }]
  emit()
  setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== id)
    emit()
  }, tone === 'error' ? 6000 : 3000)
}

/** Mensagem legível para erros do Supabase/rede. */
export function errorMessage(error: unknown): string {
  const e = error as { message?: string; code?: string }
  if (e?.code === '23505') return 'Já existe um registro igual.'
  if (e?.code === '42501') return 'Sem permissão para esta ação.'
  if (/failed to fetch|networkerror|load failed/i.test(e?.message ?? '')) return 'Sem conexão. Tente de novo quando houver sinal.'
  return e?.message ?? 'Algo deu errado.'
}

export const toastError = (error: unknown) => toast(errorMessage(error), 'error')

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}
const empty: Toast[] = []
export const useToasts = () => useSyncExternalStore(subscribe, () => toasts, () => empty)
