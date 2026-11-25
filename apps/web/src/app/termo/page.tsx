'use client'

import {
  GUARDIAN_TERM, formatDateBR, getGuardianSignInfo, guardianSignFormIssue, signGuardianTerm, type GuardianSignForm, type GuardianSignInfo,
} from '@kog/core'
import { Button, Card, EmptyState, Kicker } from '@kog/ui'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, Clock, Download, FileSignature } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { formatDateTimeBR } from '@/components/student-account'
import { EMPTY_GUARDIAN_SIGN, GuardianSignFields } from '@/components/guardian-sign-fields'
import { Loading } from '@/components/shell'
import { downloadSignedGuardianTerm } from '@/lib/guardian-term'
import { db, isConfigured } from '@/lib/supabase'
import { errorMessage, toastError } from '@/lib/toast'

// Página do responsável (/termo#código), sem login: lê o termo com os dados do aluno, preenche e assina na tela.
// O código vai no # (não chega ao servidor nem aos logs). Quem tem o link pode assinar; o professor confere depois.

const infoKey = (token: string) => ['guardian-sign', token] as const

export default function GuardianSignPage() {
  const [token, setToken] = useState<string | null | undefined>(undefined)
  useEffect(() => {
    const read = () => setToken(window.location.hash.replace(/^#/, '').trim() || null)
    read()
    window.addEventListener('hashchange', read)
    return () => window.removeEventListener('hashchange', read)
  }, [])

  const info = useQuery({
    queryKey: infoKey(token ?? ''),
    queryFn: () => getGuardianSignInfo(db(), token!),
    enabled: !!token && isConfigured,
    networkMode: 'online',
    retry: 1,
  })

  if (token === undefined || (token && info.isPending)) return <Shell><Loading /></Shell>
  if (token && info.isError) {
    return (
      <Shell>
        <EmptyState title="Não foi possível carregar" action={<Button variant="ghost" onPress={() => void info.refetch()}>Tentar de novo</Button>}>
          Confira a conexão com a internet.
        </EmptyState>
      </Shell>
    )
  }
  if (!token || !info.data) {
    return (
      <Shell>
        <EmptyState title="Link inválido ou vencido">
          O link para assinar o termo vale 30 dias. Peça um novo link ao professor ou ao aluno.
        </EmptyState>
      </Shell>
    )
  }
  return (
    <Shell>
      <Sign token={token} info={info.data} />
    </Shell>
  )
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto max-w-md px-4 pt-[calc(env(safe-area-inset-top)+1.5rem)] pb-[calc(env(safe-area-inset-bottom)+2.5rem)]">
      <div className="mb-6 text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/icon-192.png" alt="" width={64} height={64} className="mx-auto rounded-full ring-1 ring-line-strong" />
        <Kicker className="mt-3">King of Glory Academy</Kicker>
        <h1 className="mt-1 font-display text-3xl uppercase tracking-[0.02em] text-accent">Termo do responsável</h1>
      </div>
      {children}
    </main>
  )
}

function DownloadCopy({ token, name }: { token: string; name: string }) {
  const [busy, setBusy] = useState(false)
  return (
    <Button
      variant="ghost"
      block
      loading={busy}
      onPress={async () => {
        setBusy(true)
        try {
          await downloadSignedGuardianTerm({ token }, name)
        } catch (error) {
          toastError(error)
        } finally {
          setBusy(false)
        }
      }}
    >
      <Download className="size-4" /> Baixar cópia do termo (PDF)
    </Button>
  )
}

function Sign({ token, info }: { token: string; info: GuardianSignInfo }) {
  const [resign, setResign] = useState(false)
  const first = info.student_name.trim().split(/\s+/)[0]

  if (!info.minor) {
    return <EmptyState title="Termo não é mais necessário">{first} já é maior de idade.</EmptyState>
  }
  if (info.status === 'enviado') {
    return (
      <Card className="p-4 text-center">
        <CheckCircle2 className="mx-auto size-10 text-success" />
        <p className="mt-3 font-bold text-text">Termo de {first} aprovado pelo professor</p>
        <p className="mt-1 text-sm text-soft">Não precisa fazer mais nada. Para mudar uma autorização, fale com o professor.</p>
        {info.kind === 'esign' ? <div className="mt-4"><DownloadCopy token={token} name={info.student_name} /></div> : null}
      </Card>
    )
  }
  if (info.status === 'em_analise' && info.kind === 'file') {
    return (
      <Card className="p-4 text-center">
        <Clock className="mx-auto size-10 text-accent" />
        <p className="mt-3 font-bold text-text">O termo em papel de {first} já foi enviado</p>
        <p className="mt-1 text-sm text-soft">Ele está com o professor para conferir. Se ele pedir correção, este link volta a servir para assinar.</p>
      </Card>
    )
  }
  if (info.status === 'em_analise' && info.kind === 'esign' && !resign) {
    return (
      <Card className="p-4 text-center">
        <CheckCircle2 className="mx-auto size-10 text-success" />
        <p className="mt-3 font-bold text-text">Termo assinado</p>
        <p className="mt-1 text-sm text-soft">
          Assinado por {info.guardian_name}
          {info.signed_at ? ` em ${formatDateTimeBR(info.signed_at)}` : ''}. Agora o professor confere e aprova.
        </p>
        <div className="mt-4 space-y-2">
          <DownloadCopy token={token} name={info.student_name} />
          <Button variant="plain" block onPress={() => setResign(true)}>Corrigir e assinar de novo</Button>
        </div>
      </Card>
    )
  }
  return <SignForm token={token} info={info} />
}

function SignForm({ token, info }: { token: string; info: GuardianSignInfo }) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState<GuardianSignForm>(EMPTY_GUARDIAN_SIGN)
  const [error, setError] = useState<string | null>(null)
  const [tried, setTried] = useState(false)
  const [busy, setBusy] = useState(false)
  const t = GUARDIAN_TERM

  async function submit() {
    setTried(true)
    const issue = guardianSignFormIssue(form)
    if (issue) return setError(issue)
    setError(null)
    setBusy(true)
    try {
      await signGuardianTerm(db(), token, form)
      await queryClient.invalidateQueries({ queryKey: infoKey(token) })
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      {info.rejected_reason ? (
        <Card className="border-danger p-3 text-sm">
          <p className="font-bold text-danger">O professor pediu para corrigir o termo</p>
          <p className="mt-1 text-text">"{info.rejected_reason}"</p>
        </Card>
      ) : null}

      <Card className="space-y-3 p-4">
        <div className="flex items-start gap-3">
          <FileSignature className="mt-0.5 size-6 shrink-0 text-accent" />
          <div className="min-w-0">
            <p className="font-bold text-text">{t.title}</p>
            <p className="mt-1 text-sm text-soft">{t.intro}</p>
          </div>
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded border border-line p-3 text-sm">
          <dt className="text-dim">Aluno</dt>
          <dd className="min-w-0 font-medium text-text">{info.student_name}</dd>
          <dt className="text-dim">Nascimento</dt>
          <dd className="text-text">{formatDateBR(info.birth_date)}</dd>
          <dt className="text-dim">Academia</dt>
          <dd className="min-w-0 text-text">{info.gym_name}</dd>
        </dl>
      </Card>

      <GuardianSignFields
        form={form}
        onChange={(f) => { setForm(f); setError(null) }}
        tried={tried}
        footer={
          <>
            {error ? <p className="text-sm text-danger" role="alert">{error}</p> : null}
            <Button block loading={busy} onPress={() => void submit()}>Assinar termo</Button>
          </>
        }
      />
    </div>
  )
}
