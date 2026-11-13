'use client'

import { Button, Field, Input, Kicker } from '@kog/ui'
import { useRouter } from 'next/navigation'
import { useEffect, useState, type FormEvent } from 'react'
import { useAuth } from '@/lib/auth'
import { db, isConfigured } from '@/lib/supabase'
import { errorMessage } from '@/lib/toast'

type Mode = 'signin' | 'signup' | 'reset' | 'newpass'

const COPY: Record<Mode, { submit: string }> = {
  signin: { submit: 'Entrar' },
  signup: { submit: 'Criar conta' },
  reset: { submit: 'Enviar link' },
  newpass: { submit: 'Salvar nova senha' },
}

export default function LoginPage() {
  const router = useRouter()
  const { session, ready } = useAuth()
  const [mode, setMode] = useState<Mode>('signin')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null)

  // Link de recuperação de senha abre aqui com uma sessão temporária.
  useEffect(() => {
    if (!isConfigured) return
    const { data } = db().auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setMode('newpass')
    })
    return () => data.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (ready && session && mode !== 'newpass') router.replace('/')
  }, [ready, session, mode, router])

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setMessage(null)
    try {
      const auth = db().auth
      if (mode === 'signin') {
        const { error } = await auth.signInWithPassword({ email, password })
        if (error) throw error
      } else if (mode === 'signup') {
        const { data, error } = await auth.signUp({ email, password, options: { data: { name } } })
        if (error) throw error
        if (!data.session) setMessage({ text: 'Conta criada. Confirme pelo link enviado ao seu e-mail e depois entre.', error: false })
      } else if (mode === 'reset') {
        const { error } = await auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/login` })
        if (error) throw error
        setMessage({ text: 'Se o e-mail existir, você receberá um link para criar uma nova senha.', error: false })
      } else {
        const { error } = await auth.updateUser({ password })
        if (error) throw error
        router.replace('/')
      }
    } catch (error) {
      const text = errorMessage(error)
      setMessage({ text: /invalid login credentials/i.test(text) ? 'E-mail ou senha incorretos.' : text, error: true })
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-5 py-10">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/icons/icon-192.png" alt="" width={96} height={96} className="mx-auto rounded-full ring-1 ring-line-strong" />
      <Kicker className="mt-6 text-center">King of Glory Academy</Kicker>
      <h1 className="mt-2 text-center font-display text-4xl uppercase tracking-[0.02em] text-accent">Presença</h1>

      {!isConfigured ? (
        <p className="mt-8 rounded border border-danger/50 p-4 text-sm text-danger">
          App sem configuração do Supabase. Defina NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.
        </p>
      ) : (
        <form onSubmit={submit} className="mt-8 space-y-4">
          {mode === 'signup' ? (
            <Field label="Nome">
              <Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required />
            </Field>
          ) : null}
          {mode !== 'newpass' ? (
            <Field label="E-mail">
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" inputMode="email" required />
            </Field>
          ) : null}
          {mode !== 'reset' ? (
            <Field label={mode === 'newpass' ? 'Nova senha' : 'Senha'}>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                minLength={8}
                required
              />
            </Field>
          ) : null}

          {message ? <p className={message.error ? 'text-sm text-danger' : 'text-sm text-success'}>{message.text}</p> : null}

          <Button type="submit" size="lg" block loading={busy}>
            {COPY[mode].submit}
          </Button>

          {mode !== 'newpass' ? (
            <div className="flex justify-between pt-1 text-sm font-medium text-dim">
              {mode === 'signin' ? (
                <>
                  <button type="button" onClick={() => setMode('reset')}>Esqueci a senha</button>
                  <button type="button" onClick={() => setMode('signup')}>Criar conta</button>
                </>
              ) : (
                <button type="button" onClick={() => setMode('signin')}>Já tenho conta</button>
              )}
            </div>
          ) : null}
        </form>
      )}
    </main>
  )
}
