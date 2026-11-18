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
import { useProfile } from '@/lib/queries'
import { getStoredStudentToken } from '@/lib/student-link'
import { db } from '@/lib/supabase'

export default function AppLayout({ children }: { children: ReactNode }) {
  const { session, ready } = useAuth()
  const router = useRouter()
  const queryClient = useQueryClient()
  const userId = session?.user.id
  const profile = useProfile()
  const isStudent = profile.data?.role === 'student'

  // Conta de aluno não usa o app do professor: vai para a área do aluno.
  useEffect(() => {
    if (isStudent) router.replace(STUDENT_PORTAL_PATH)
  }, [isStudent, router])

  useEffect(() => {
    if (!ready || session) return
    // Sem login, o endereço do app abre na área do aluno (que tem o link "Sou professor"). Com o link do aluno
    // guardado no aparelho, o app instalado abre direto nas presenças dele.
    const studentToken = getStoredStudentToken()
    router.replace(studentToken ? `${STUDENT_PORTAL_PATH}#${studentToken}` : STUDENT_PORTAL_PATH)
  }, [ready, session, router])

  useEffect(() => {
    if (!userId || isStudent) return
    return outbox.init(db(), queryClient)
  }, [userId, isStudent, queryClient])

  useEffect(() => {
    if (userId && profile.data?.role === 'instructor') void syncPushSubscription().catch(() => {})
  }, [userId, profile.data?.role])

  if (!ready || !session || isStudent) return <Loading />

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
