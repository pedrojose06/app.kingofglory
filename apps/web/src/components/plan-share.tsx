'use client'

import {
  editedAfterReview, formatDateBR, formatStamp, getPlanShare, keys, PLAN_REVIEW_LABEL, planShareText, type PlanShareContext, revokePlanShare, rotatePlanShare, sharedPlanUrl,
} from '@kog/core'
import { Badge, Button, cn, Sheet } from '@kog/ui'
import { useQuery } from '@tanstack/react-query'
import { CheckCircle2, Copy, Link2, MessageCircle, MessageSquareWarning, Send, Share2 } from 'lucide-react'
import { useState } from 'react'
import { useSave } from '@/lib/queries'
import { db } from '@/lib/supabase'
import { toast, toastError } from '@/lib/toast'

const usePlanShare = (classId: string) =>
  useQuery({ queryKey: keys.planShare(classId), queryFn: () => getPlanShare(db(), classId), networkMode: 'online' })


/** Botão "Compartilhar" do plano (como no Notion): gera um link para o mestre ler e aprovar sem login. */
export function PlanShareButton({
  classId, unsynced, planUpdatedAt, context,
}: { classId: string; unsynced: boolean; planUpdatedAt: string | null; context: PlanShareContext }) {
  const [open, setOpen] = useState(false)
  const share = usePlanShare(classId)
  const status = share.data?.review_status

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-9 items-center gap-1 rounded border border-line px-2.5 text-xs font-bold uppercase tracking-[0.1em] text-accent"
      >
        {status === 'approved' ? <CheckCircle2 className="size-4 text-success" /> : <Share2 className="size-4" />} Compartilhar
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Compartilhar plano">
        <ShareSheet classId={classId} unsynced={unsynced} planUpdatedAt={planUpdatedAt} context={context} />
      </Sheet>
    </>
  )
}

function ShareSheet({
  classId, unsynced, planUpdatedAt, context,
}: { classId: string; unsynced: boolean; planUpdatedAt: string | null; context: PlanShareContext }) {
  const share = usePlanShare(classId)
  const invalidate = [keys.planShare(classId)] as const
  const rotate = useSave(() => rotatePlanShare(db(), classId), invalidate, () => toast('Link do plano gerado'))
  const revoke = useSave(() => revokePlanShare(db(), classId), invalidate, () => toast('Link desativado'))

  const url = share.data ? sharedPlanUrl(window.location.origin, share.data.token) : ''
  const text = planShareText(context)
  const message = `${text} ${url}`
  const canNativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'

  async function copy() {
    try {
      await navigator.clipboard.writeText(message)
      toast('Mensagem copiada')
    } catch (error) {
      toastError(error)
    }
  }

  async function nativeShare() {
    try {
      await navigator.share({ title: 'Plano de aula', text, url })
    } catch (error) {
      if ((error as Error)?.name !== 'AbortError') toastError(error)
    }
  }

  if (share.isPending) return <p className="text-sm text-dim">Carregando…</p>
  if (share.isError) return <p className="text-sm text-dim">Sem conexão. Compartilhar o plano precisa de internet.</p>

  return (
    <div className="space-y-3">
      {!share.data ? (
        <>
          <p className="text-sm text-soft">
            Gere um link para mandar o plano ao mestre. Ele abre sem senha, lê o plano e pode aprovar ou pedir ajustes.
          </p>
          <Button block loading={rotate.isPending} onPress={() => rotate.mutate()}>
            <Link2 className="size-4" /> Gerar link
          </Button>
        </>
      ) : (
        <>
          <ReviewStatus share={share.data} planUpdatedAt={planUpdatedAt} />
          <div>
            <p className="truncate rounded border border-line bg-surface-2 px-3 py-2 font-mono text-xs text-soft">{url}</p>
            <p className="mt-1.5 text-xs text-dim">
              {share.data.last_seen_at ? `Aberto em ${formatStamp(share.data.last_seen_at)}` : 'Ainda não foi aberto'}
              {' · '}gerado em {formatDateBR(share.data.created_at.slice(0, 10))}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {canNativeShare ? (
              <Button onPress={() => void nativeShare()}>
                <Send className="size-4" /> Enviar
              </Button>
            ) : (
              <a
                href={`https://wa.me/?text=${encodeURIComponent(message)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="bg-gold-gradient inline-flex h-12 items-center justify-center gap-2 rounded px-3 text-sm font-bold uppercase tracking-[0.08em] text-ink shadow-gold"
              >
                <MessageCircle className="size-4" /> WhatsApp
              </a>
            )}
            <Button variant="ghost" onPress={() => void copy()}>
              <Copy className="size-4" /> Copiar
            </Button>
          </div>
          <div className="flex justify-between">
            <Button
              variant="plain"
              size="sm"
              loading={rotate.isPending}
              onPress={() => window.confirm('Gerar um novo link? O link atual para de funcionar e a aprovação é zerada.') && rotate.mutate()}
            >
              Gerar novo link
            </Button>
            <Button
              variant="plain"
              size="sm"
              className="text-danger"
              loading={revoke.isPending}
              onPress={() => window.confirm('Desativar o link? Quem tiver o link perde o acesso ao plano.') && revoke.mutate()}
            >
              Desativar
            </Button>
          </div>
        </>
      )}
      {unsynced ? (
        <p className="rounded bg-warning-tint px-3 py-2 text-xs text-warning">
          Há alterações ainda não enviadas. Quem abrir o link vê a última versão salva no servidor.
        </p>
      ) : null}
      <p className="text-xs text-dim">
        Quem tiver o link vê só este plano (academia, data e horário), sempre na versão mais recente. Alunos e presenças não aparecem.
      </p>
    </div>
  )
}

function ReviewStatus({ share, planUpdatedAt }: { share: NonNullable<ReturnType<typeof usePlanShare>['data']>; planUpdatedAt: string | null }) {
  if (!share.review_status || !share.reviewed_at) {
    return <Badge>Aguardando revisão</Badge>
  }
  return <ReviewCard status={share.review_status} note={share.review_note} reviewer={share.reviewer_name} reviewedAt={share.reviewed_at} planUpdatedAt={planUpdatedAt} />
}

function ReviewCard({
  status, note, reviewer, reviewedAt, planUpdatedAt,
}: { status: 'approved' | 'changes_requested'; note: string | null; reviewer: string | null; reviewedAt: string; planUpdatedAt: string | null }) {
  const approved = status === 'approved'
  const Icon = approved ? CheckCircle2 : MessageSquareWarning
  return (
    <div className={cn('rounded px-3 py-2.5', approved ? 'bg-success-tint' : 'bg-warning-tint')}>
      <p className={cn('flex items-center gap-1.5 text-sm font-bold', approved ? 'text-success' : 'text-warning')}>
        <Icon className="size-4" /> {PLAN_REVIEW_LABEL[status]}
        <span className="font-normal text-dim">
          {reviewer ? ` por ${reviewer}` : ''} · {formatStamp(reviewedAt)}
        </span>
      </p>
      {note ? <p className="mt-1 whitespace-pre-wrap text-sm text-soft">{note}</p> : null}
      {editedAfterReview(planUpdatedAt, reviewedAt) ? (
        <p className="mt-1 text-xs text-dim">O plano foi editado depois desta revisão.</p>
      ) : null}
    </div>
  )
}

/** Revisão do mestre no topo do plano (só aparece depois que ele aprova ou pede ajustes). */
export function PlanReviewBanner({ classId, planUpdatedAt }: { classId: string; planUpdatedAt: string | null }) {
  const share = usePlanShare(classId)
  const s = share.data
  if (!s?.review_status || !s.reviewed_at) return null
  return (
    <div className="mb-3">
      <ReviewCard status={s.review_status} note={s.review_note} reviewer={s.reviewer_name} reviewedAt={s.reviewed_at} planUpdatedAt={planUpdatedAt} />
    </div>
  )
}
