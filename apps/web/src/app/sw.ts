import { defaultCache } from '@serwist/next/worker'
import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist'
import { NetworkOnly, Serwist } from 'serwist'

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined
  }
}

declare const self: ServiceWorkerGlobalScope

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  // As telas recebem ids por query string (?id=…); a página pré-cacheada é a mesma.
  precacheOptions: { ignoreURLParametersMatching: [/.*/] },
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    // Dados e fotos do Supabase nunca passam pelo cache do SW: o cache de dados é do TanStack Query
    // (persistido em IndexedDB) e as escritas offline vão para a fila.
    { matcher: ({ url }) => url.hostname.endsWith('.supabase.co'), handler: new NetworkOnly() },
    ...defaultCache,
  ],
})

serwist.addEventListeners()

// ── Lembretes por push ───────────────────────────────────────────────────────
// O payload vem da Edge Function `push-reminders`: { title, body, url, tag }.
self.addEventListener('push', (event) => {
  let data: { title?: string; body?: string; url?: string; tag?: string } = {}
  try {
    data = event.data?.json() ?? {}
  } catch {
    data = { body: event.data?.text() }
  }
  event.waitUntil(
    self.registration.showNotification(data.title ?? 'KOG Presença', {
      body: data.body,
      tag: data.tag,
      icon: '/icons/notification-icon.png',
      // Ícone da barra de status no Android: só a silhueta (canal alfa) é usada; imagem opaca vira um quadrado branco.
      badge: '/icons/notification-badge.png',
      data: { url: data.url ?? '/' },
    }),
  )
})

// Toque na notificação: traz o app aberto para a frente (ou abre) já na tela indicada.
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = new URL((event.notification.data as { url?: string } | null)?.url ?? '/', self.location.origin).href
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      const open = windows[0]
      if (open) {
        await open.focus().catch(() => {})
        await open.navigate(url).catch(() => {})
        return
      }
      await self.clients.openWindow(url)
    })(),
  )
})
