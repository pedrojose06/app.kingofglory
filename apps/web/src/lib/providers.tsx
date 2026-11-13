'use client'

import { QueryClient } from '@tanstack/react-query'
import { PersistQueryClientProvider, type Persister } from '@tanstack/react-query-persist-client'
import { del, get, set } from 'idb-keyval'
import { useState, type ReactNode } from 'react'
import { AuthProvider } from './auth'

const WEEK = 1000 * 60 * 60 * 24 * 7
const CACHE_KEY = 'kog-query-cache'

// O cache de leitura fica no IndexedDB: offline, as telas abrem com os últimos dados vistos.
const persister: Persister = {
  persistClient: (client) => set(CACHE_KEY, client).catch(() => {}),
  restoreClient: () => get(CACHE_KEY).catch(() => undefined),
  removeClient: () => del(CACHE_KEY).catch(() => {}),
}

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            gcTime: WEEK,
            // Tenta a rede uma vez mesmo "offline" e, se falhar, mantém o dado em cache sem travar a tela.
            networkMode: 'offlineFirst',
            retry: 1,
            refetchOnWindowFocus: true,
          },
          mutations: { networkMode: 'offlineFirst' },
        },
      }),
  )

  return (
    <PersistQueryClientProvider client={queryClient} persistOptions={{ persister, maxAge: WEEK, buster: 'v1' }}>
      <AuthProvider>{children}</AuthProvider>
    </PersistQueryClientProvider>
  )
}
