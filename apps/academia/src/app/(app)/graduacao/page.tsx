'use client'

import {
  CANDIDATE_STATUS_LABEL, decideGraduationCandidate, deleteGraduationEvent, dismissGraduationCandidate, formatConfidence, formatDateBR,
  proposeGraduationCandidates, searchGraduationStudents, signGraduationPhotoUrls, TRACK_LABEL,
  type EventCandidate, type GraduationEvent, type Rank, type RankTrack,
} from '@kog/core'
import { FaceThumb } from '@kog/face-kit'
import { Badge, Button, Card, EmptyState, Input } from '@kog/ui'
import { toast, toastError } from '@kog/web-kit'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Check, Pencil, Trash2, UserPlus, X } from 'lucide-react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useMemo, useState } from 'react'
import { GraduationEventDialog } from '@/components/graduation-event-dialog'
import { GraduationPhotos, RankChange } from '@/components/graduation-photos'
import { Dialog } from '@/components/kit'
import { ErrorState, Loading } from '@/components/states'
import { useAcademy } from '@/lib/academy'
import { keys, useGraduationCandidates, useGraduationEvent, useRanks } from '@/lib/queries'
import { db } from '@/lib/supabase'

export default function GraduationEventPage() {
  return (
    <Suspense fallback={<Loading />}>
      <GraduationEventRoute />
    </Suspense>
  )
}

function BackLink() {
  return (
    <Link href="/graduacoes" className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent hover:underline">
      <ArrowLeft className="size-4" /> Graduações
    </Link>
  )
}

function GraduationEventRoute() {
  const id = useSearchParams().get('id') ?? ''
  const { isStaff } = useAcademy()
  const event = useGraduationEvent(id)
  if (!isStaff) return <EmptyState title="Sem acesso." action={<BackLink />}>As graduações são da equipe da academia.</EmptyState>
  if (!id) return <EmptyState title="Graduação não informada." action={<BackLink />} />
  if (event.isPending) return <Loading />
  if (event.isError) return <ErrorState error={event.error} onRetry={() => event.refetch()} />
  if (!event.data) return <EmptyState title="Graduação não encontrada." action={<BackLink />} />
  return <GraduationEventView event={event.data} />
}

function GraduationEventView({ event }: { event: GraduationEvent }) {
  const { academy, isAdmin } = useAcademy()
  const queryClient = useQueryClient()
  const router = useRouter()
  const [editing, setEditing] = useState(false)

  const remove = useMutation({
    mutationFn: () => deleteGraduationEvent(db(), event),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: keys.graduationEvents(academy.gym_id) })
      router.push('/graduacoes')
    },
    onError: toastError,
  })

  return (
    <>
      <BackLink />
      <div className="mb-6 mt-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="kicker">{event.title || 'Graduação'} · {TRACK_LABEL[event.track as RankTrack]}</p>
          <h1 className="mt-1 font-display text-3xl uppercase leading-none tracking-[0.02em] text-text">{formatDateBR(event.held_on)}</h1>
          {event.notes ? <p className="mt-2 max-w-2xl text-sm text-soft">{event.notes}</p> : null}
        </div>
        {isAdmin ? (
          <div className="flex gap-2">
            <Button variant="ghost" onPress={() => setEditing(true)}><Pencil className="size-4" /> Editar</Button>
            <Button
              variant="ghost"
              loading={remove.isPending}
              onPress={() =>
                window.confirm('Apagar esta graduação, com as fotos e a lista de alunos? As graduações já aprovadas continuam na ficha dos alunos.') &&
                remove.mutate()
              }
            >
              <Trash2 className="size-4" /> Apagar
            </Button>
          </div>
        ) : null}
      </div>

      <section className="mb-8">
        <h2 className="kicker mb-3">Fotos da graduação</h2>
        <GraduationPhotos event={event} />
      </section>

      <section>
        <Candidates event={event} />
      </section>

      {editing ? <GraduationEventDialog event={event} onClose={() => setEditing(false)} /> : null}
    </>
  )
}

// ── alunos da graduação ─────────────────────────────────────────────────────

function useCandidateUrls(eventId: string, candidates: readonly EventCandidate[]) {
  const { academy } = useAcademy()
  const paths = [...new Set(candidates.map((c) => c.storage_path).filter((p): p is string => !!p))].sort()
  return useQuery({
    queryKey: [...keys.graduationPhotos(academy.gym_id, eventId), 'urls', paths.join(',')],
    queryFn: () => signGraduationPhotoUrls(db(), paths),
    enabled: paths.length > 0,
    staleTime: 30 * 60_000,
    gcTime: 50 * 60_000,
  })
}

function Candidates({ event }: { event: GraduationEvent }) {
  const { academy, isAdmin } = useAcademy()
  const queryClient = useQueryClient()
  const candidates = useGraduationCandidates(event.id)
  const ranks = useRanks()
  const rankById = useMemo(() => new Map((ranks.data ?? []).map((r) => [r.id, r])), [ranks.data])
  const urls = useCandidateUrls(event.id, candidates.data ?? [])
  const [adding, setAdding] = useState(false)

  const refresh = () => queryClient.invalidateQueries({ queryKey: keys.graduationCandidates(academy.gym_id, event.id) })
  const decide = useMutation({
    mutationFn: ({ id, approve }: { id: string; approve: boolean }) => decideGraduationCandidate(db(), id, approve),
    onSuccess: async (_, { approve }) => {
      await refresh()
      toast(approve ? 'Graduação aprovada: já está na ficha do aluno.' : 'Avanço de grau não aprovado.')
    },
    onError: toastError,
  })
  const dismiss = useMutation({
    mutationFn: (id: string) => dismissGraduationCandidate(db(), id),
    onSuccess: refresh,
    onError: toastError,
  })

  const list = candidates.data ?? []
  const pending = list.filter((c) => c.status === 'pending').length

  return (
    <>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <h2 className="kicker">
          Alunos da graduação{list.length > 0 ? ` · ${list.length}` : ''}
          {pending > 0 ? <span className="ml-2 normal-case tracking-normal text-dim">{pending} aguardando aprovação</span> : null}
        </h2>
        <Button variant="ghost" size="sm" onPress={() => setAdding(true)}><UserPlus className="size-4" /> Incluir aluno</Button>
      </div>

      {candidates.isPending ? (
        <Loading />
      ) : candidates.isError ? (
        <ErrorState error={candidates.error} onRetry={() => candidates.refetch()} />
      ) : list.length === 0 ? (
        <EmptyState title="Nenhum aluno ainda.">
          Envie as fotos da graduação: cada aluno reconhecido aparece aqui com o próximo grau. Quem o rosto não achar, inclua pelo nome.
        </EmptyState>
      ) : (
        <ul className="grid gap-2 lg:grid-cols-2">
          {list.map((c) => {
            const from = c.from_rank_id ? rankById.get(c.from_rank_id) : undefined
            const to = rankById.get(c.to_rank_id)
            const busy = (decide.isPending && decide.variables?.id === c.id) || (dismiss.isPending && dismiss.variables === c.id)
            return (
              <li key={c.id}>
                <Card className="flex gap-3 p-3">
                  <FaceThumb src={c.storage_path ? urls.data?.[c.storage_path] : null} bbox={c.bbox} size={64} alt={c.student_name} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-bold text-text">{c.student_name}</p>
                      <StatusBadge c={c} />
                    </div>
                    <p className="text-xs text-dim">
                      {c.gym_name}
                      {c.source === 'face' && c.score != null ? ` · rosto ${formatConfidence(c.score)}` : c.source === 'manual' ? ' · incluído pelo nome' : ''}
                    </p>
                    <RankChange from={from} to={to} />
                    {c.status === 'pending' && c.has_instructor ? (
                      <p className="mt-1 text-xs text-dim">O professor responsável já foi avisado e também pode aprovar.</p>
                    ) : null}
                    <div className="mt-2 flex flex-wrap gap-2">
                      {isAdmin && c.status !== 'approved' ? (
                        <Button size="sm" loading={busy && decide.isPending} onPress={() => decide.mutate({ id: c.id, approve: true })}>
                          <Check className="size-4" /> Aprovar
                        </Button>
                      ) : null}
                      {isAdmin && c.status !== 'rejected' ? (
                        <Button size="sm" variant="ghost" disabled={busy} onPress={() => decide.mutate({ id: c.id, approve: false })}>
                          <X className="size-4" /> Não aprovar
                        </Button>
                      ) : null}
                      <Button
                        size="sm"
                        variant="plain"
                        disabled={busy}
                        onPress={() =>
                          window.confirm(
                            c.status === 'approved'
                              ? `Tirar ${c.student_name} desta graduação? A graduação aprovada sai da ficha do aluno.`
                              : `Tirar ${c.student_name} desta graduação?`,
                          ) && dismiss.mutate(c.id)
                        }
                      >
                        {c.source === 'face' ? 'Não é esta pessoa' : 'Tirar'}
                      </Button>
                    </div>
                  </div>
                </Card>
              </li>
            )
          })}
        </ul>
      )}

      {adding ? <AddStudentDialog event={event} rankById={rankById} onClose={() => setAdding(false)} /> : null}
    </>
  )
}

function StatusBadge({ c }: { c: Pick<EventCandidate, 'status' | 'decided_via'> }) {
  const tone = c.status === 'approved' ? 'success' : c.status === 'rejected' ? 'danger' : 'warning'
  const via = c.decided_via === 'academia' ? ' pela academia' : c.decided_via === 'professor' ? ' pelo professor' : ''
  return <Badge tone={tone}>{CANDIDATE_STATUS_LABEL[c.status]}{c.status !== 'pending' ? via : ''}</Badge>
}

// ── incluir aluno pelo nome ─────────────────────────────────────────────────

function AddStudentDialog({ event, rankById, onClose }: { event: GraduationEvent; rankById: Map<string, Rank>; onClose: () => void }) {
  const { academy } = useAcademy()
  const queryClient = useQueryClient()
  const [q, setQ] = useState('')
  const term = q.trim()
  const results = useQuery({
    queryKey: ['academia', 'graduacao', event.id, 'busca', term.toLowerCase()],
    queryFn: () => searchGraduationStudents(db(), event.id, term),
    enabled: term.length >= 3,
    staleTime: 60_000,
  })
  const add = useMutation({
    mutationFn: (studentId: string) => proposeGraduationCandidates(db(), event.id, [{ student_id: studentId, source: 'manual' }]),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: keys.graduationCandidates(academy.gym_id, event.id) })
      toast('Aluno incluído na graduação.')
    },
    onError: toastError,
  })

  return (
    <Dialog open onClose={onClose} title="Incluir aluno" footer={<Button variant="ghost" onPress={onClose}>Fechar</Button>}>
      <p className="mb-3 text-sm text-dim">Busca em todas as academias da equipe. O aluno entra com o próximo grau da trilha {TRACK_LABEL[event.track as RankTrack].toLowerCase()}.</p>
      <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nome do aluno (3 letras ou mais)" />
      <div className="mt-3">
        {term.length < 3 ? null : results.isPending ? (
          <Loading label="Buscando…" />
        ) : results.isError ? (
          <ErrorState error={results.error} />
        ) : results.data.length === 0 ? (
          <p className="py-4 text-center text-sm text-dim">Nenhum aluno ativo com esse nome.</p>
        ) : (
          <ul className="divide-y divide-line">
            {results.data.map((s) => (
              <li key={s.student_id} className="flex items-center gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-text">{s.name}</p>
                  <p className="text-xs text-dim">{s.gym_name}</p>
                  <RankChange from={s.current_rank_id ? rankById.get(s.current_rank_id) : undefined} to={s.next_rank_id ? rankById.get(s.next_rank_id) : undefined} />
                </div>
                <Button size="sm" disabled={!s.next_rank_id} loading={add.isPending && add.variables === s.student_id} onPress={() => add.mutate(s.student_id)}>
                  Incluir
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Dialog>
  )
}
