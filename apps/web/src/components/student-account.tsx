'use client'

import { TIME_ZONE } from '@kog/core'
import { Button, Card, Field, Input } from '@kog/ui'
import { ShieldCheck } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { db } from '@/lib/supabase'
import { errorMessage } from '@/lib/toast'

/** 17/11/2026 14:30 no horário de São Paulo. */
export function formatDateTimeBR(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: TIME_ZONE })
}

type AuthMode = 'signin' | 'signup' | 'reset'

function translate(text: string): string {
  if (/invalid login credentials/i.test(text)) return 'E-mail ou senha incorretos.'
  if (/email not confirmed/i.test(text)) return 'Confirme seu e-mail pelo link que enviamos antes de entrar.'
  if (/already registered/i.test(text)) return 'Este e-mail já tem conta. Use "Já tenho conta".'
  return text
}

/**
 * Login/cadastro do aluno. A conta é ligada ao aluno depois, pela página, usando o link do professor:
 * por isso "Criar conta" só aparece com um link válido (`canSignUp`).
 */
export function StudentAuthForm({
  initialMode = 'signin', canSignUp, onCancel, redirectPath = '/minhas-presencas', linkName = 'link do professor',
}: {
  initialMode?: AuthMode
  canSignUp: boolean
  onCancel?: () => void
  /** Para onde o link de confirmação de e-mail volta. */
  redirectPath?: string
  /** Como chamar o link que precisa continuar válido até a confirmação. */
  linkName?: string
}) {
  const [mode, setMode] = useState<AuthMode>(canSignUp ? initialMode : initialMode === 'signup' ? 'signin' : initialMode)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null)

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
        const { data, error } = await auth.signUp({
          email,
          password,
          options: { data: { name }, emailRedirectTo: `${window.location.origin}${redirectPath}` },
        })
        if (error) throw error
        if (!data.session) {
          setMessage({
            text: `Conta criada! Abra o link de confirmação que enviamos ao seu e-mail neste celular, enquanto o ${linkName} ainda vale.`,
            error: false,
          })
        }
      } else {
        const { error } = await auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/login-professor` })
        if (error) throw error
        setMessage({ text: 'Se o e-mail existir, você receberá um link para criar uma nova senha.', error: false })
      }
    } catch (error) {
      setMessage({ text: translate(errorMessage(error)), error: true })
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <p className="font-display text-xl uppercase tracking-[0.02em] text-text">
        {mode === 'signup' ? 'Criar minha conta' : mode === 'reset' ? 'Recuperar senha' : 'Entrar na minha conta'}
      </p>
      {mode === 'signup' ? (
        <Field label="Nome">
          <Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required />
        </Field>
      ) : null}
      <Field label="E-mail">
        <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" inputMode="email" required />
      </Field>
      {mode !== 'reset' ? (
        <Field label="Senha" hint={mode === 'signup' ? 'Mínimo de 8 caracteres.' : undefined}>
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

      <Button type="submit" block loading={busy}>
        {mode === 'signup' ? 'Criar conta' : mode === 'reset' ? 'Enviar link' : 'Entrar'}
      </Button>

      <div className="flex flex-wrap justify-between gap-2 pt-1 text-sm font-medium text-dim">
        {mode === 'signin' ? (
          <>
            <button type="button" onClick={() => setMode('reset')}>Esqueci a senha</button>
            {canSignUp ? <button type="button" onClick={() => setMode('signup')}>Criar conta</button> : null}
          </>
        ) : (
          <button type="button" onClick={() => setMode('signin')}>Já tenho conta</button>
        )}
        {onCancel ? <button type="button" onClick={onCancel}>Cancelar</button> : null}
      </div>
    </form>
  )
}

/** Aceite de uso de imagem no primeiro acesso da conta. Sem aceite, a conta não acessa nada. */
export function ConsentScreen({ name, onAccept, onDecline, busy, error }: { name: string; onAccept: () => void; onDecline: () => void; busy: boolean; error?: string }) {
  const [checked, setChecked] = useState(false)
  const first = name.trim().split(/\s+/)[0]
  return (
    <Card className="p-4">
      <ShieldCheck className="size-8 text-accent" />
      <p className="mt-3 font-display text-2xl uppercase tracking-[0.02em] text-text">Uso de imagem</p>
      <p className="mt-2 text-sm text-soft">
        Oi, {first}! Para usar sua conta no app da King of Glory, precisamos da sua autorização para usar sua imagem, conforme a
        Lei Geral de Proteção de Dados (LGPD).
      </p>
      <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-soft">
        <li>Fotos dos treinos tiradas pelos professores podem mostrar você.</li>
        <li>
          <b>Reconhecimento facial para presença:</b> o celular do professor compara os rostos da foto com uma referência numérica
          do seu rosto (dado biométrico) e sugere quem está no treino. A presença só é marcada depois que o professor confirma.
        </li>
        <li>Guardamos só essa referência numérica, nunca uma cópia extra da foto, e só para registrar presença.</li>
        <li>
          As fotos e referências ficam só no app da equipe. Você pode retirar a autorização quando quiser, falando com seu
          professor: os dados do seu rosto são apagados na hora.
        </li>
      </ul>
      <label className="mt-4 flex items-start gap-3 rounded-lg border border-line p-3">
        <input type="checkbox" className="mt-0.5 size-5 shrink-0 accent-[var(--kog-gold)]" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
        <span className="text-sm text-text">Li e autorizo o uso da minha imagem e o reconhecimento facial para presença, nos termos acima.</span>
      </label>
      {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
      <Button block className="mt-4" disabled={!checked} loading={busy} onPress={onAccept}>Aceitar e continuar</Button>
      <Button variant="plain" block className="mt-1" onPress={onDecline}>Não aceito</Button>
      <p className="mt-2 text-xs text-dim">
        Sem a autorização você não pode usar a conta. Para ver suas presenças, peça um link ao seu professor.
      </p>
    </Card>
  )
}
