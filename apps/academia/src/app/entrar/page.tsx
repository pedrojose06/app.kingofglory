'use client'

import { authErrorMessage, passwordIssue } from '@kog/core'
import { Button, Field, Input } from '@kog/ui'
import { useAuth } from '@kog/web-kit'
import { useRouter } from 'next/navigation'
import { useEffect, useState, type FormEvent } from 'react'
import { AuthFrame, FormMessage } from '@/components/states'
import { db, isConfigured } from '@/lib/supabase'

type Mode = 'signin' | 'reset' | 'newpass'
type Message = { text: string; error: boolean } | null

export default function SignInPage() {
  const router = useRouter()
  const { session, ready } = useAuth()
  const [mode, setMode] = useState<Mode>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<Message>(null)
  const [unconfirmed, setUnconfirmed] = useState(false)

  // O link de "esqueci a senha" abre aqui com uma sessão temporária.
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
    setUnconfirmed(false)
    try {
      const auth = db().auth
      if (mode === 'signin') {
        const { error } = await auth.signInWithPassword({ email: email.trim(), password })
        if (error) {
          if (error.code === 'email_not_confirmed' || /email not confirmed/i.test(error.message)) setUnconfirmed(true)
          throw error
        }
      } else if (mode === 'reset') {
        const { error } = await auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/entrar` })
        if (error) throw error
        setMessage({ text: 'Se o e-mail tiver conta, você vai receber um link para criar uma nova senha.', error: false })
      } else {
        const issue = passwordIssue(password, confirm)
        if (issue) throw new Error(issue)
        const { error } = await auth.updateUser({ password })
        if (error) throw error
        router.replace('/')
      }
    } catch (error) {
      setMessage({ text: authErrorMessage(error), error: true })
    } finally {
      setBusy(false)
    }
  }

  async function resend() {
    setBusy(true)
    try {
      const { error } = await db().auth.resend({ type: 'signup', email: email.trim(), options: { emailRedirectTo: `${window.location.origin}/entrar` } })
      if (error) throw error
      setUnconfirmed(false)
      setMessage({ text: `Enviamos um novo link de confirmação para ${email.trim()}.`, error: false })
    } catch (error) {
      setMessage({ text: authErrorMessage(error), error: true })
    } finally {
      setBusy(false)
    }
  }

  const title = mode === 'newpass' ? 'Nova senha' : mode === 'reset' ? 'Recuperar senha' : 'Academia'

  return (
    <AuthFrame
      title={title}
      footer={mode === 'signin' ? 'Acesso por convite da academia. Recebeu um link? Abra-o para criar a sua conta.' : undefined}
    >
      {!isConfigured ? (
        <FormMessage message={{ text: 'Configure NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY em apps/academia/.env.local.', error: true }} />
      ) : (
        <form onSubmit={submit} className="space-y-4">
          {mode !== 'newpass' ? (
            <Field label="E-mail">
              <Input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
          ) : null}
          {mode !== 'reset' ? (
            <Field label={mode === 'newpass' ? 'Nova senha' : 'Senha'}>
              <Input
                type="password"
                autoComplete={mode === 'newpass' ? 'new-password' : 'current-password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
          ) : null}
          {mode === 'newpass' ? (
            <Field label="Repita a nova senha">
              <Input type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            </Field>
          ) : null}

          <FormMessage message={message} />
          {unconfirmed ? (
            <Button variant="ghost" block loading={busy} onPress={resend}>
              Reenviar e-mail de confirmação
            </Button>
          ) : null}

          <Button type="submit" block size="lg" loading={busy}>
            {mode === 'signin' ? 'Entrar' : mode === 'reset' ? 'Enviar link' : 'Salvar nova senha'}
          </Button>

          {mode !== 'newpass' ? (
            <button
              type="button"
              className="block w-full text-center text-sm font-semibold text-accent underline-offset-4 hover:underline"
              onClick={() => {
                setMode(mode === 'signin' ? 'reset' : 'signin')
                setMessage(null)
                setUnconfirmed(false)
              }}
            >
              {mode === 'signin' ? 'Esqueci a senha' : 'Voltar para entrar'}
            </button>
          ) : null}
        </form>
      )}
    </AuthFrame>
  )
}
