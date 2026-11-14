'use client'

import { useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { Suspense, useEffect, type ReactNode } from 'react'
import { InstallPrompt } from '@/components/install-prompt'
import { BottomNav, Loading } from '@/components/shell'
import { useAuth } from '@/lib/auth'
import { outbox } from '@/lib/outbox'
import { db } from '@/lib/supabase'

export default function AppLayout({ children }: { children: ReactNode }) {
  const { session, ready } = useAuth()
  const router = useRouter()
  const queryClient = useQueryClient()
  const userId = session?.user.id

  useEffect(() => {
    if (ready && !session) router.replace('/login-professor')
  }, [ready, session, router])

  useEffect(() => {
    if (!userId) return
    return outbox.init(db(), queryClient)
  }, [userId, queryClient])

  if (!ready || !session) return <Loading />

  return (
    <>
      <main>
        <Suspense fallback={<Loading />}>{children}</Suspense>
      </main>
      <InstallPrompt />
      <BottomNav />
    </>
  )
}
