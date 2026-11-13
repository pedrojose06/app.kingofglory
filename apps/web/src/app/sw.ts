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
