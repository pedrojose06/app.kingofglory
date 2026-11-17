'use client'

// Fila offline no browser: persistência em IndexedDB + envio quando há conexão.
// As regras (coalescência, lotes, execução) vivem em @kog/core e são reaproveitáveis no app nativo.

import {
  type Db, type OutboxItem, type OutboxOp, enqueue, executeBatch, isNetworkError, keys, nextBatch,
} from '@kog/core'
import type { QueryClient } from '@tanstack/react-query'
import { createStore, del, get, set } from 'idb-keyval'
import { useSyncExternalStore } from 'react'

const store = typeof indexedDB === 'undefined' ? undefined : createStore('kog-outbox', 'items')
const ITEMS_KEY = 'queue'
const blobKey = (id: string) => `blob:${id}`

let items: OutboxItem[] = []
let loaded = false
let flushing = false
let ctx: { db: Db; queryClient: QueryClient } | undefined
const listeners = new Set<() => void>()

const emit = () => listeners.forEach((l) => l())
const persist = () => (store ? set(ITEMS_KEY, items, store).catch(() => {}) : Promise.resolve())

function update(next: OutboxItem[]) {
  items = next
  emit()
  void persist()
}

async function load() {
  if (loaded || !store) return
  const saved = await get<OutboxItem[]>(ITEMS_KEY, store).catch(() => undefined)
  // Itens adicionados antes do load terminar ficam depois dos salvos.
  items = [...(saved ?? []), ...items]
  loaded = true
  emit()
}

function invalidate(queryClient: QueryClient, op: OutboxOp) {
  const inv = (queryKey: readonly unknown[]) => void queryClient.invalidateQueries({ queryKey })
  switch (op.type) {
    case 'attendance.mark':
      inv(keys.classAttendance(op.mark.class_id))
      inv(keys.progress)
      inv(['classes', 'counts'])
      break
    case 'class.conclude':
    case 'class.status':
      inv(['classes'])
      inv(keys.class(op.classId))
      inv(keys.classAttendance(op.classId))
      inv(keys.progress)
      break
    case 'walkin.add':
      inv(['attendance'])
      inv(keys.progress)
      break
    case 'plan.save':
      inv(keys.lessonPlan(op.classId))
      inv(['lesson-plan', 'planned'])
      break
    case 'photo.upload':
      inv(keys.classPhotos(op.meta.class_id))
      break
    case 'face.decisions':
      inv(keys.photoFaces(op.classId))
      inv(keys.faceReferences(op.gymId))
      break
  }
}

const isRetryable = (error: unknown) => {
  const e = error as { status?: number; code?: string; message?: string }
  // Token expirado enquanto offline: o cliente renova sozinho; tentar de novo depois.
  return isNetworkError(error) || e?.status === 401 || e?.code === 'PGRST301' || /jwt expired/i.test(e?.message ?? '')
}

async function flush() {
  if (flushing || !ctx) return
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return
  flushing = true
  emit()
  try {
    await load()
    for (;;) {
      const batch = nextBatch(items)
      if (batch.length === 0) break
      const ids = new Set(batch.map((i) => i.id))
      try {
        await executeBatch(ctx.db, batch, { getBlob: async (key) => (store ? ((await get<Blob>(key, store)) ?? null) : null) })
        update(items.filter((i) => !ids.has(i.id)))
        for (const item of batch) {
          if (item.op.type === 'photo.upload' && store) void del(item.op.blobKey, store)
          invalidate(ctx.queryClient, item.op)
        }
      } catch (error) {
        if (isRetryable(error)) break
        const message = (error as { message?: string })?.message ?? 'Erro desconhecido'
        update(items.map((i) => (ids.has(i.id) ? { ...i, error: message } : i)))
      }
    }
  } finally {
    flushing = false
    emit()
  }
}

export const outbox = {
  /** Liga a fila ao cliente e começa a sincronizar. Chamado uma vez, com sessão ativa. */
  init(db: Db, queryClient: QueryClient) {
    ctx = { db, queryClient }
    void load().then(flush)
    if (typeof window === 'undefined') return () => {}
    const onWake = () => void flush()
    const onVisible = () => document.visibilityState === 'visible' && void flush()
    window.addEventListener('online', onWake)
    document.addEventListener('visibilitychange', onVisible)
    const timer = window.setInterval(() => items.length > 0 && void flush(), 20_000)
    return () => {
      window.removeEventListener('online', onWake)
      document.removeEventListener('visibilitychange', onVisible)
      window.clearInterval(timer)
    }
  },

  add(op: OutboxOp) {
    update(enqueue(items, { id: crypto.randomUUID(), createdAt: new Date().toISOString(), op }))
    void flush()
  },

  /** Enfileira uma foto: o arquivo comprimido fica no IndexedDB até o upload dar certo. */
  async addPhoto(meta: Extract<OutboxOp, { type: 'photo.upload' }>['meta'], file: Blob) {
    const key = blobKey(meta.id)
    if (store) await set(key, file, store)
    outbox.add({ type: 'photo.upload', meta, blobKey: key })
  },

  retry(id?: string) {
    update(items.map((i) => (!id || i.id === id ? { ...i, error: undefined } : i)))
    void flush()
  },

  discard(id: string) {
    const item = items.find((i) => i.id === id)
    if (item?.op.type === 'photo.upload' && store) void del(item.op.blobKey, store)
    update(items.filter((i) => i.id !== id))
  },

  flush,
  getBlob: async (key: string) => (store ? ((await get<Blob>(key, store)) ?? null) : null),
}

const subscribe = (l: () => void) => {
  listeners.add(l)
  void load()
  return () => listeners.delete(l)
}
const empty: OutboxItem[] = []

export const useOutbox = () => useSyncExternalStore(subscribe, () => items, () => empty)
export const useOutboxSyncing = () => useSyncExternalStore(subscribe, () => flushing, () => false)

function subscribeOnline(l: () => void) {
  window.addEventListener('online', l)
  window.addEventListener('offline', l)
  return () => {
    window.removeEventListener('online', l)
    window.removeEventListener('offline', l)
  }
}
export const useOnline = () => useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true)
