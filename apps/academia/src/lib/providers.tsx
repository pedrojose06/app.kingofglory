'use client'

import { AuthProvider } from '@kog/web-kit'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { supabase } from './supabase'

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: true } } }),
  )
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider client={supabase}>{children}</AuthProvider>
    </QueryClientProvider>
  )
}
