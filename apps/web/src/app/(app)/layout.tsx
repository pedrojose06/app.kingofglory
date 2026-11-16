'use client'

import { STUDENT_PORTAL_PATH } from '@kog/core'
import { useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { Suspense, useEffect, type ReactNode } from 'react'
import { InstallPrompt } from '@/components/install-prompt'
import { BottomNav, Loading } from '@/components/shell'
import { useAuth } from '@/lib/auth'
import { outbox } from '@/lib/outbox'
import { syncPushSubscription } from '@/lib/push'
import { getStoredStudentToken } from '@/lib/student-link'
import { db } from '@/lib/supabase'

export default function AppLayout({ children }: { children: ReactNode }) {
  const { session, ready } = useAuth()
  const router = useRouter()
  const queryClient = useQueryClient()
  const userId = session?.user.id

  useEffect(() => {
    if (!ready || session) return
    // Aparelho do aluno (link da área do aluno guardado): o app instalado abre nas presenças dele.
    const studentToken = getStoredStudentToken()
    router.replace(studentToken ? `${STUDENT_PORTAL_PATH}#${studentToken}` : '/login-professor')
  }, [ready, session, router])

  useEffect(() => {
    if (!userId) return
    return outbox.init(db(), queryClient)
  }, [userId, queryClient])

  useEffect(() => {
    if (userId) void syncPushSubscription().catch(() => {})
  }, [userId])

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
