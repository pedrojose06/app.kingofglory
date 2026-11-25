'use client'

import { Button } from '@kog/ui'
import { useAuth } from '@kog/web-kit'
import { useRouter } from 'next/navigation'
import { useEffect, type ReactNode } from 'react'
import { AppShell } from '@/components/shell'
import { AuthFrame, ErrorState, Loading } from '@/components/states'
import { AcademyProvider, useMyAcademies } from '@/lib/academy'
import { db } from '@/lib/supabase'

export default function AppLayout({ children }: { children: ReactNode }) {
  const { session, ready } = useAuth()
  const router = useRouter()
  const academies = useMyAcademies()

  useEffect(() => {
    if (ready && !session) router.replace('/entrar')
  }, [ready, session, router])

  if (!ready || !session || academies.isPending) return <Loading />
  if (academies.isError) {
    return (
      <AuthFrame title="Academia">
        <ErrorState error={academies.error} onRetry={() => academies.refetch()} />
      </AuthFrame>
    )
  }
  if (academies.data.length === 0) {
    return (
      <AuthFrame title="Sem acesso">
        <p className="text-sm text-soft">
          A conta <strong className="text-text">{session.user.email}</strong> ainda não tem acesso a nenhuma academia.
        </p>
        <p className="mt-2 text-sm text-soft">
          O acesso é dado por convite: peça ao administrador da academia para enviar um convite para este e-mail e abra o link
          que ele mandar.
        </p>
        <Button variant="ghost" block className="mt-5" onPress={() => void db().auth.signOut()}>
          Sair
        </Button>
      </AuthFrame>
    )
  }

  return (
    <AcademyProvider academies={academies.data}>
      <AppShell>{children}</AppShell>
    </AcademyProvider>
  )
}
