'use client'

import { acceptInstructorInvite, getInviteInfo, getProfile, keys } from '@kog/core'
import { Button, Card, EmptyState, Kicker } from '@kog/ui'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { LogOut } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { Loading } from '@/components/shell'
import { StudentAuthForm, formatDateTimeBR } from '@/components/student-account'
import { useAuth } from '@/lib/auth'
import { db, isConfigured } from '@/lib/supabase'
import { errorMessage } from '@/lib/toast'

// O convite fica guardado no aparelho para o retorno da confirmação de e-mail (que chega sem o #token).
const KEY = 'kog-instructor-invite'
const readStored = () => {
  try {
    return window.localStorage.getItem(KEY)
  } catch {
    return null
  }
}
const store = (token: string | null) => {
  try {
    if (token) window.localStorage.setItem(KEY, token)
    else window.localStorage.removeItem(KEY)
  } catch {
    // sem storage: só não lembra o convite
  }
}

/** Convite de professor (/convite#token): quem entra ou cria a conta por aqui vira professor. */
export default function InvitePage() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { session, ready } = useAuth()
  const [token, setToken] = useState<string | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  // Aviso acima do formulário e modo inicial dele (entrar, quando a conta já existe).
  const [notice, setNotice] = useState<string | null>(null)
  const [formMode, setFormMode] = useState<'signup' | 'signin'>('signup')
  const [checking, setChecking] = useState(false)
  const handled = useRef<string | null>(null)

  useEffect(() => {
    const hash = window.location.hash.replace(/^#/, '').trim()
    const hashParams = new URLSearchParams(hash)
    // Link de confirmação já usado ou vencido: a conta existe, então vai direto para "Entrar".
    if (hashParams.get('error_code') || hashParams.get('error')) {
      setNotice('Este link de confirmação já foi usado ou venceu. Se você já confirmou o e-mail, entre com seu e-mail e senha.')
      setFormMode('signin')
    }
    // Retorno da confirmação de e-mail: tokens de login no fragmento (com "=") e o convite em ?c=, para funcionar
    // mesmo se o e-mail for aberto em outro navegador (ex.: o navegador do app do Gmail).
    const fromQuery = new URLSearchParams(window.location.search).get('c')?.trim()
    const t = (hash && !hash.includes('=') ? hash : null) ?? fromQuery ?? readStored()
    if (t) store(t)
    setToken(t)
  }, [])

  const info = useQuery({
    queryKey: keys.inviteInfo(token ?? ''),
    queryFn: () => getInviteInfo(db(), token!),
    enabled: !!token && isConfigured,
    networkMode: 'online',
  })

  async function signOutFor(message: string) {
    await db().auth.signOut()
    queryClient.clear()
    handled.current = null
    setNotice(message)
    setFormMode('signin')
  }

  // Logado e com convite: o convite tem prioridade. Conta que já é professor ou aluno é desconectada para o
  // convidado entrar com a conta dele; conta nova (sem acesso) aceita o convite.
  useEffect(() => {
    if (!ready || !session || !token || !info.data || handled.current === session.user.id) return
    handled.current = session.user.id
    const email = session.user.email ?? 'outra conta'
    setChecking(true)
    void (async () => {
      try {
        const profile = await getProfile(db(), session.user.id)
        if (profile?.role === 'instructor') {
          await signOutFor(`Você estava conectado como ${email}, que já é professor. Entre (ou crie a conta) com o e-mail de quem recebeu o convite.`)
          return
        }
        await acceptInstructorInvite(db(), token)
        store(null)
        await queryClient.invalidateQueries({ queryKey: keys.profile })
        router.replace('/')
      } catch (e) {
        const text = errorMessage(e)
        if (/aluno/i.test(text)) await signOutFor(`${text} Você foi desconectado de ${email}.`)
        else setError(text)
      } finally {
        setChecking(false)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, session, token, info.data])

  const valid = !!info.data
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-5 py-10">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/icons/icon-192.png" alt="" width={96} height={96} className="mx-auto rounded-full ring-1 ring-line-strong" />
      <Kicker className="mt-6 text-center">King of Glory Academy</Kicker>
      <h1 className="mt-2 text-center font-display text-4xl uppercase tracking-[0.02em] text-accent">Convite de professor</h1>

      <div className="mt-8">
        {!ready || token === undefined || (token && info.isPending) || checking || (session && token && valid && !error) ? (
          <Loading />
        ) : error ? (
          <>
            <EmptyState title="Não foi possível aceitar o convite">{error}</EmptyState>
            {session ? (
              <Button variant="ghost" block className="mt-4" onPress={() => { setError(null); void signOutFor('Entre com a conta de quem recebeu o convite.') }}>
                <LogOut className="size-4" /> Entrar com outra conta
              </Button>
            ) : null}
          </>
        ) : !token ? (
          <EmptyState title={session ? 'Falta abrir o convite' : 'Abra o link do convite'}>
            {session
              ? 'Sua conta está pronta. Para virar professor, abra de novo neste navegador o link do convite que você recebeu.'
              : 'Use o link de convite que você recebeu de um professor da equipe.'}
          </EmptyState>
        ) : !valid ? (
          <EmptyState title="Convite vencido ou já usado">
            Cada convite vale para uma pessoa e por 7 dias. Peça um novo a quem te convidou.
          </EmptyState>
        ) : (
          <>
            <p className="mb-5 text-center text-sm text-soft">
              {info.data!.invited_by ? `${info.data!.invited_by} convidou você` : 'Você foi convidado'} para usar o app como professor:
              chamada, plano de aula, graduação e área do aluno. Depois de entrar, cadastre a sua academia.
            </p>
            {notice ? <Card className="mb-3 border-warning p-3 text-sm text-text">{notice}</Card> : null}
            <Card className="p-4">
              <StudentAuthForm key={formMode} initialMode={formMode} canSignUp redirectPath={`/convite?c=${token}`} linkName="convite" />
            </Card>
            <p className="mt-3 text-center text-xs text-dim">Convite válido até {formatDateTimeBR(info.data!.expires_at)}.</p>
          </>
        )}
      </div>
    </main>
  )
}
