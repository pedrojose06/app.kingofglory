'use client'

import {
  editedAfterReview, formatDayLong, formatStamp, formatTime, getSharedPlan, keys, PLAN_REVIEW_LABEL, planHasContent, reviewSharedPlan, type PlanReviewStatus, type SharedPlan,
} from '@kog/core'
import { Button, cn, EmptyState, Field, Input, Kicker, Textarea, Title } from '@kog/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { EditorContent, useEditor } from '@tiptap/react'
import { CheckCircle2, MessageSquareWarning } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { planExtensions } from '@/components/plan-extensions'
import { Loading } from '@/components/shell'
import { db, isConfigured } from '@/lib/supabase'
import { toast, toastError } from '@/lib/toast'

const NAME_KEY = 'kog-reviewer-name'
const readName = () => {
  try {
    return window.localStorage.getItem(NAME_KEY) ?? ''
  } catch {
    return ''
  }
}
const storeName = (name: string) => {
  try {
    window.localStorage.setItem(NAME_KEY, name)
  } catch {
    // Sem storage: só não lembra o nome.
  }
}

/** Plano de aula compartilhado: abre pelo link que o professor envia (/plano#token). Não exige login. */
export default function SharedPlanPage() {
  const [token, setToken] = useState<string | null | undefined>(undefined)

  useEffect(() => {
    const read = () => setToken(window.location.hash.replace(/^#/, '').trim() || null)
    read()
    window.addEventListener('hashchange', read)
    return () => window.removeEventListener('hashchange', read)
  }, [])

  const plan = useQuery({
    queryKey: keys.sharedPlan(token ?? ''),
    queryFn: () => getSharedPlan(db(), token!),
    enabled: !!token && isConfigured,
    refetchOnWindowFocus: true,
  })

  return (
    <main className="mx-auto max-w-xl px-4 pt-[calc(env(safe-area-inset-top)+1.25rem)] pb-[calc(env(safe-area-inset-bottom)+2.5rem)]">
      <Brand />
      {token === undefined || (token && plan.isPending) ? (
        <Loading />
      ) : !token || plan.data === null ? (
        <EmptyState title="Link inválido ou desativado">Peça ao professor um novo link do plano de aula.</EmptyState>
      ) : plan.data ? (
        <PlanView token={token} data={plan.data} />
      ) : (
        <EmptyState title="Não foi possível carregar" action={<Button variant="ghost" onPress={() => void plan.refetch()}>Tentar de novo</Button>}>
          Confira a conexão com a internet.
        </EmptyState>
      )}
    </main>
  )
}

function Brand() {
  return (
    <div className="mb-6 flex items-center gap-3">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/icons/icon-192.png" alt="" width={40} height={40} className="rounded-full ring-1 ring-line-strong" />
      <Kicker>King of Glory Academy</Kicker>
    </div>
  )
}

function PlanView({ token, data }: { token: string; data: SharedPlan }) {
  const c = data.class
  const kicker = `${formatDayLong(c.date)}${c.start_time ? ` · ${formatTime(c.start_time)}` : ''}`

  return (
    <>
      <Kicker>{kicker}</Kicker>
      <Title className="mt-1">{data.gym_name}</Title>
      <p className="mt-1 text-sm text-dim">
        Plano de aula{c.title ? ` · ${c.title}` : ''}{data.instructor_name ? ` · Prof. ${data.instructor_name}` : ''}
        {c.status === 'cancelled' ? ' · aula cancelada' : ''}
      </p>
      {data.updated_at ? <p className="mt-0.5 text-xs text-faint">Atualizado em {formatStamp(data.updated_at)}</p> : null}

      <div className="mt-5 rounded-lg border border-line bg-surface p-4">
        {planHasContent(data.content) ? (
          <ReadOnlyPlan content={data.content as object} />
        ) : (
          <p className="text-sm text-dim">O professor ainda não escreveu este plano.</p>
        )}
      </div>

      <ReviewSection token={token} data={data} />
    </>
  )
}

function ReadOnlyPlan({ content }: { content: object }) {
  const extensions = useMemo(() => planExtensions(), [])
  const editor = useEditor({ extensions, content, editable: false, immediatelyRender: false })
  useEffect(() => {
    if (editor && !editor.isDestroyed) editor.commands.setContent(content, { emitUpdate: false })
  }, [editor, content])
  return (
    <div className="plan-editor plan-view">
      <EditorContent editor={editor} />
    </div>
  )
}

function ReviewSection({ token, data }: { token: string; data: SharedPlan }) {
  const queryClient = useQueryClient()
  const review = data.review
  const [editing, setEditing] = useState(!review)
  const [name, setName] = useState('')
  const [note, setNote] = useState('')

  useEffect(() => setName(readName()), [])

  const submit = useMutation({
    mutationFn: (status: PlanReviewStatus) => reviewSharedPlan(db(), token, { status, note, reviewerName: name }),
    onSuccess: async (ok, status) => {
      if (!ok) return toast('Este link foi desativado pelo professor', 'error')
      if (name.trim()) storeName(name.trim())
      toast(status === 'approved' ? 'Plano aprovado' : 'Pedido de ajustes enviado')
      setEditing(false)
      await queryClient.invalidateQueries({ queryKey: keys.sharedPlan(token) })
    },
    onError: toastError,
  })

  const send = (status: PlanReviewStatus) => {
    if (status === 'changes_requested' && !note.trim()) return toast('Escreva o que precisa ser ajustado', 'error')
    submit.mutate(status)
  }

  return (
    <section className="mt-6">
      <h2 className="mb-3 font-display text-lg uppercase tracking-[0.04em] text-text">Revisão do mestre</h2>

      {review && !editing ? (
        <div className={cn('rounded-lg px-4 py-3', review.status === 'approved' ? 'bg-success-tint' : 'bg-warning-tint')}>
          <p className={cn('flex items-center gap-1.5 font-bold', review.status === 'approved' ? 'text-success' : 'text-warning')}>
            {review.status === 'approved' ? <CheckCircle2 className="size-5" /> : <MessageSquareWarning className="size-5" />}
            {PLAN_REVIEW_LABEL[review.status]}
          </p>
          <p className="mt-0.5 text-xs text-dim">
            {review.reviewer_name ? `${review.reviewer_name} · ` : ''}{formatStamp(review.reviewed_at)}
          </p>
          {review.note ? <p className="mt-2 whitespace-pre-wrap text-sm text-soft">{review.note}</p> : null}
          {editedAfterReview(data.updated_at, review.reviewed_at) ? (
            <p className="mt-2 text-sm font-medium text-warning">O professor alterou o plano depois desta revisão.</p>
          ) : null}
          <Button
            variant="ghost"
            size="sm"
            className="mt-3"
            onPress={() => {
              setNote(review.note ?? '')
              setEditing(true)
            }}
          >
            Revisar de novo
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <Field label="Seu nome">
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} autoCapitalize="words" placeholder="Ex.: Mestre João" />
          </Field>
          <Field label="Comentário" hint="Obrigatório para pedir ajustes">
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} placeholder="O que manter, trocar ou acrescentar" />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="ghost" loading={submit.isPending && submit.variables === 'changes_requested'} disabled={submit.isPending} onPress={() => send('changes_requested')}>
              Pedir ajustes
            </Button>
            <Button loading={submit.isPending && submit.variables === 'approved'} disabled={submit.isPending} onPress={() => send('approved')}>
              Aprovar
            </Button>
          </div>
          {review ? (
            <Button variant="plain" size="sm" onPress={() => setEditing(false)}>Cancelar</Button>
          ) : null}
        </div>
      )}
    </section>
  )
}
