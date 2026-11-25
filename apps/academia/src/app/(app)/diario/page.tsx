'use client'

import { concludeAcademyClass, formatDayLong, formatTime, setClassStatus, todayISO, type ClassStatus } from '@kog/core'
import { Badge, Button, EmptyState } from '@kog/ui'
import { toast, toastError } from '@kog/web-kit'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Suspense, useState } from 'react'
import { DiaryPhotos } from '@/components/diary-photos'
import { DiaryRollCall } from '@/components/diary-roll-call'
import { GroupTag } from '@/components/kit'
import { ErrorState, Loading } from '@/components/states'
import { useAcademy } from '@/lib/academy'
import { keys, useAcademyClass, useClassGroups } from '@/lib/queries'
import { db } from '@/lib/supabase'

export default function DiaryClassPage() {
  return (
    <Suspense fallback={<Loading />}>
      <DiaryClassRoute />
    </Suspense>
  )
}

function BackLink() {
  return (
    <Link href="/diarios" className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent hover:underline">
      <ArrowLeft className="size-4" /> Diários de aula
    </Link>
  )
}

function DiaryClassRoute() {
  const id = useSearchParams().get('id') ?? ''
  const { isStaff } = useAcademy()
  if (!isStaff) return <EmptyState title="Sem acesso." action={<BackLink />}>Os diários de aula são da equipe da academia.</EmptyState>
  if (!id) return <EmptyState title="Aula não informada." action={<BackLink />} />
  return <DiaryClass id={id} />
}

const TABS = [
  { id: 'chamada', label: 'Chamada' },
  { id: 'fotos', label: 'Fotos e reconhecimento' },
] as const

function DiaryClass({ id }: { id: string }) {
  const { academy } = useAcademy()
  const queryClient = useQueryClient()
  const klass = useAcademyClass(id)
  const groups = useClassGroups()
  const [tab, setTab] = useState<(typeof TABS)[number]['id']>('chamada')
  const today = todayISO()

  const refresh = () => queryClient.invalidateQueries({ queryKey: keys.all(academy.gym_id) })
  const conclude = useMutation({
    mutationFn: () => concludeAcademyClass(db(), id),
    onSuccess: async () => {
      await refresh()
      toast('Chamada concluída. Quem não foi marcado ficou com falta.')
    },
    onError: toastError,
  })
  const setStatus = useMutation({
    mutationFn: (status: ClassStatus) => setClassStatus(db(), id, status),
    onSuccess: refresh,
    onError: toastError,
  })

  if (klass.isPending) return <Loading label="Carregando aula…" />
  if (klass.isError) return <ErrorState error={klass.error} onRetry={() => klass.refetch()} />
  const c = klass.data
  if (!c) return <EmptyState title="Aula não encontrada." action={<BackLink />} />

  const group = c.group_id ? groups.data?.find((g) => g.id === c.group_id) : undefined
  const future = c.date > today && c.status === 'scheduled'
  const cancelled = c.status === 'cancelled'
  const busy = conclude.isPending || setStatus.isPending

  return (
    <>
      <BackLink />
      <div className="mt-3 mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="kicker">
            {formatDayLong(c.date)}
            {c.start_time ? ` · ${formatTime(c.start_time)}` : ''}
          </p>
          <h1 className="mt-1 font-display text-3xl uppercase leading-none text-text">{c.title}</h1>
          <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-dim">
            {group ? <GroupTag name={group.name} color={group.color} /> : <span>Sem turma</span>}
            {c.status === 'done' ? <Badge tone="success">Concluída</Badge> : cancelled ? <Badge>Cancelada</Badge> : null}
          </p>
        </div>
        {!future ? (
          <div className="flex flex-wrap gap-2">
            {cancelled ? (
              <Button variant="ghost" loading={busy} onPress={() => setStatus.mutate('scheduled')}>Reabrir aula</Button>
            ) : c.status === 'done' ? (
              <Button variant="ghost" loading={busy} onPress={() => setStatus.mutate('scheduled')}>Reabrir chamada</Button>
            ) : (
              <>
                <Button
                  variant="plain"
                  disabled={busy}
                  onPress={() => window.confirm('Marcar que não houve aula neste dia?') && setStatus.mutate('cancelled')}
                >
                  Não houve aula
                </Button>
                <Button loading={conclude.isPending} disabled={busy} onPress={() => conclude.mutate()}>Concluir chamada</Button>
              </>
            )}
          </div>
        ) : null}
      </div>

      {future ? (
        <EmptyState
          title="A chamada abre no dia da aula"
          action={
            <Button variant="ghost" loading={busy} onPress={() => window.confirm('Marcar que não vai haver aula neste dia?') && setStatus.mutate('cancelled')}>
              Não vai haver aula
            </Button>
          }
        >
          Você pode voltar aqui no dia para fazer a chamada e enviar a foto da turma.
        </EmptyState>
      ) : cancelled ? (
        <EmptyState title="Não houve aula neste dia">Se a aula aconteceu, reabra para fazer a chamada.</EmptyState>
      ) : (
        <>
          <div role="tablist" className="mb-5 flex gap-1 border-b border-line">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => setTab(t.id)}
                className={`-mb-px border-b-2 px-3 py-2.5 text-sm font-bold ${tab === t.id ? 'border-gold text-accent' : 'border-transparent text-dim hover:text-text'}`}
              >
                {t.label}
              </button>
            ))}
          </div>
          {tab === 'chamada' ? <DiaryRollCall klass={c} canEdit /> : <DiaryPhotos klass={c} canEdit />}
        </>
      )}
    </>
  )
}
