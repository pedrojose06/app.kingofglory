'use client'

import { ACADEMY_ROLE_LABEL, acceptAcademyInvite, academyInviteInfo, authErrorMessage, normalizeEmail, passwordIssue } from '@kog/core'
import { Button, Field, Input } from '@kog/ui'
import { useAuth } from '@kog/web-kit'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { AuthFrame, ErrorState, FormMessage, Loading } from '@/components/states'
import { db } from '@/lib/supabase'

const TOKEN_KEY = 'kog-academia-convite'
const SELECTED_KEY = 'kog-academia-selecionada'
type Message = { text: string; error: boolean } | null

/**
 * O token chega no `#` do link. Fica guardado neste navegador porque o link de confirmação do e-mail volta para
 * /convite sem ele (o `#` passa a ter a sessão do Supabase).
 */
function readToken(): string {
  const hash = window.location.hash.slice(1)
  try {
    if (/^[0-9a-f]{48}$/.test(hash)) {
      localStorage.setItem(TOKEN_KEY, hash)
      return hash
    }
    return localStorage.getItem(TOKEN_KEY) ?? ''
  } catch {
    return /^[0-9a-f]{48}$/.test(hash) ? hash : ''
  }
}

export default function InvitePage() {
  const [token, setToken] = useState<string | null>(null)
  useEffect(() => setToken(readToken()), [])

  if (token === null) return <AuthFrame title="Convite"><Loading /></AuthFrame>
  if (!token) {
    return (
      <AuthFrame title="Convite">
        <p className="text-sm text-soft">Abra o link do convite que a academia enviou para você. Ele leva você direto para criar a conta.</p>
      </AuthFrame>
    )
  }
  return <Invite token={token} />
}

function Invite({ token }: { token: string }) {
  const { session, ready } = useAuth()
  const info = useQuery({ queryKey: ['convite', token], queryFn: () => academyInviteInfo(db(), token) })

  if (!ready || info.isPending) return <AuthFrame title="Convite"><Loading /></AuthFrame>
  if (info.isError) return <AuthFrame title="Convite"><ErrorState error={info.error} onRetry={() => info.refetch()} /></AuthFrame>

  const invite = info.data
  if (!invite) {
    return (
      <AuthFrame title="Convite">
        <p className="text-sm text-soft">Este link de convite não é válido. Peça um novo ao administrador da academia.</p>
      </AuthFrame>
    )
  }

  const blocked =
    invite.status === 'cancelado'
      ? 'Este convite foi cancelado. Peça um novo ao administrador da academia.'
      : invite.status === 'vencido'
        ? 'Este convite venceu. Peça um novo ao administrador da academia.'
        : null

  return (
    <AuthFrame title="Convite">
      <p className="text-sm text-soft">
        Você foi convidado para a <strong className="text-text">{invite.academy}</strong> como{' '}
        <strong className="text-text">{ACADEMY_ROLE_LABEL[invite.role]}</strong>.
      </p>
      <p className="mt-1 text-sm text-dim">Convite para {invite.email}</p>
      <div className="mt-5">
        {blocked ? (
          <FormMessage message={{ text: blocked, error: true }} />
        ) : session ? (
          <AcceptWithSession token={token} inviteEmail={invite.email} accepted={invite.status === 'aceito'} />
        ) : invite.status === 'aceito' ? (
          <SignInForm email={invite.email} intro="Este convite já foi aceito. Entre com a sua senha." />
        ) : (
          <CreateAccount email={invite.email} />
        )}
      </div>
    </AuthFrame>
  )
}

/** Logado: aceita na hora se a conta for a do e-mail convidado. */
function AcceptWithSession({ token, inviteEmail, accepted }: { token: string; inviteEmail: string; accepted: boolean }) {
  const { session } = useAuth()
  const router = useRouter()
  const queryClient = useQueryClient()
  const [error, setError] = useState<unknown>(null)
  const started = useRef(false)
  const email = normalizeEmail(session?.user.email ?? '')
  const matches = email === inviteEmail

  useEffect(() => {
    if (!matches || started.current) return
    started.current = true
    acceptAcademyInvite(db(), token)
      .then(async (gymId) => {
        try {
          localStorage.removeItem(TOKEN_KEY)
          localStorage.setItem(SELECTED_KEY, gymId)
        } catch {}
        await queryClient.invalidateQueries({ queryKey: ['academia'] })
        router.replace('/')
      })
      .catch((e) => {
        started.current = false
        setError(e)
      })
  }, [matches, token, queryClient, router])

  if (!matches) {
    return (
      <div className="space-y-4">
        <FormMessage
          message={{ text: `Você está conectado como ${email}. Este convite é para ${inviteEmail}: saia e entre com a conta desse e-mail.`, error: true }}
        />
        <Button variant="ghost" block onPress={() => void db().auth.signOut()}>
          Sair
        </Button>
      </div>
    )
  }
  if (error) return <ErrorState title="Não foi possível aceitar o convite" error={error} onRetry={() => setError(null)} />
  return <Loading label={accepted ? 'Abrindo a academia…' : 'Aceitando o convite…'} />
}

function CreateAccount({ email }: { email: string }) {
  const [mode, setMode] = useState<'signup' | 'signin'>('signup')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<Message>(null)
  const [sent, setSent] = useState(false)

  if (mode === 'signin') {
    return (
      <div className="space-y-3">
        <SignInForm email={email} intro="Entre com a senha da sua conta para aceitar o convite." />
        <button type="button" className="block w-full text-center text-sm font-semibold text-accent hover:underline" onClick={() => setMode('signup')}>
          Ainda não tenho conta
        </button>
      </div>
    )
  }

  if (sent) {
    return (
      <div className="space-y-4">
        <FormMessage message={{ text: `Conta criada. Enviamos um link de confirmação para ${email}.`, error: false }} />
        <p className="text-sm text-soft">
          Abra o e-mail e toque em <strong>Confirmar e-mail</strong>. O link traz você de volta para cá e o convite é aceito na hora.
          Não chegou? Veja a caixa de spam.
        </p>
        <FormMessage message={message} />
        <Button
          variant="ghost"
          block
          loading={busy}
          onPress={async () => {
            setBusy(true)
            const { error } = await db().auth.resend({ type: 'signup', email, options: { emailRedirectTo: `${window.location.origin}/convite` } })
            setMessage(error ? { text: authErrorMessage(error), error: true } : { text: 'Link reenviado.', error: false })
            setBusy(false)
          }}
        >
          Reenviar e-mail
        </Button>
      </div>
    )
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setMessage(null)
    const issue = name.trim().length < 3 ? 'Informe o seu nome completo.' : passwordIssue(password, confirm)
    if (issue) return setMessage({ text: issue, error: true })
    setBusy(true)
    try {
      const { data, error } = await db().auth.signUp({
        email,
        password,
        options: { data: { name: name.trim() }, emailRedirectTo: `${window.location.origin}/convite` },
      })
      if (error) throw error
      // E-mail que já tem conta: o Supabase não acusa erro e devolve um usuário sem identidades.
      if (data.user && data.user.identities?.length === 0) {
        setMode('signin')
        return
      }
      if (!data.session) setSent(true)
    } catch (error) {
      setMessage({ text: authErrorMessage(error), error: true })
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Seu nome completo">
        <Input autoComplete="name" required value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="E-mail (é o seu login)" hint="O convite vale só para este e-mail.">
        <Input type="email" value={email} readOnly className="bg-surface-2 text-soft" />
      </Field>
      <Field label="Crie uma senha" hint="Pelo menos 8 caracteres.">
        <Input type="password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
      </Field>
      <Field label="Repita a senha">
        <Input type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      </Field>
      <FormMessage message={message} />
      <Button type="submit" block size="lg" loading={busy}>
        Criar conta
      </Button>
      <button type="button" className="block w-full text-center text-sm font-semibold text-accent hover:underline" onClick={() => setMode('signin')}>
        Já tenho conta com este e-mail
      </button>
    </form>
  )
}

function SignInForm({ email, intro }: { email: string; intro: string }) {
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<Message>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setMessage(null)
    const { error } = await db().auth.signInWithPassword({ email, password })
    if (error) setMessage({ text: authErrorMessage(error), error: true })
    setBusy(false)
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <p className="text-sm text-soft">{intro}</p>
      <Field label="E-mail">
        <Input type="email" value={email} readOnly className="bg-surface-2 text-soft" />
      </Field>
      <Field label="Senha">
        <Input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
      </Field>
      <FormMessage message={message} />
      <Button type="submit" block size="lg" loading={busy}>
        Entrar e aceitar
      </Button>
    </form>
  )
}
