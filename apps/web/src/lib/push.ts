'use client'

import { deletePushSubscription, savePushSubscription } from '@kog/core'
import { db } from './supabase'

const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY

/**
 * unconfigured: build sem a chave VAPID · unsupported: navegador sem Web Push (no iPhone, só com o app instalado)
 * no-worker: service worker ausente (ex.: `next dev`) · denied: bloqueado nas permissões do navegador
 */
export type PushState = 'unconfigured' | 'unsupported' | 'no-worker' | 'denied' | 'off' | 'on'

const supported = () =>
  typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const base64 = (base64url + '='.repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const bytes = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
  return bytes
}

async function save(subscription: PushSubscription) {
  const { endpoint, keys } = subscription.toJSON()
  if (!endpoint || !keys?.p256dh || !keys.auth) throw new Error('O navegador não devolveu a inscrição de push')
  await savePushSubscription(db(), { endpoint, p256dh: keys.p256dh, auth: keys.auth }, navigator.userAgent)
}

export async function getPushState(): Promise<PushState> {
  if (!vapidKey) return 'unconfigured'
  if (!supported()) return 'unsupported'
  if (Notification.permission === 'denied') return 'denied'
  const registration = await navigator.serviceWorker.getRegistration()
  if (!registration) return 'no-worker'
  return (await registration.pushManager.getSubscription()) ? 'on' : 'off'
}

/** Pede permissão, inscreve este aparelho e grava a inscrição. Precisa partir de um toque do usuário. */
export async function enablePush(): Promise<PushState> {
  if (!vapidKey) return 'unconfigured'
  if (!supported()) return 'unsupported'
  const registration = await navigator.serviceWorker.getRegistration()
  if (!registration) return 'no-worker'
  if ((await Notification.requestPermission()) !== 'granted') return Notification.permission === 'denied' ? 'denied' : 'off'
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(vapidKey) }))
  await save(subscription)
  return 'on'
}

export async function disablePush(): Promise<void> {
  if (!supported()) return
  const registration = await navigator.serviceWorker.getRegistration()
  const subscription = await registration?.pushManager.getSubscription()
  if (!subscription) return
  await deletePushSubscription(db(), subscription.endpoint).catch(() => {})
  await subscription.unsubscribe()
}

/**
 * Regrava a inscrição existente: o navegador pode renová-la sozinho, e o aparelho pode ter trocado de conta.
 * Chamado ao abrir o app logado; falha em silêncio (offline, sem permissão).
 */
export async function syncPushSubscription(): Promise<void> {
  if (!vapidKey || !supported() || Notification.permission !== 'granted') return
  const registration = await navigator.serviceWorker.getRegistration()
  const subscription = await registration?.pushManager.getSubscription()
  if (subscription) await save(subscription)
}
