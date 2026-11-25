'use client'

import {
  assignGraduationFaces, decideGraduationCandidate, deleteGraduationPhoto, dismissGraduationCandidate, formatConfidence,
  matchGraduationFaces, proposeGraduationCandidates, signGraduationPhotoUrls, uploadGraduationPhoto,
  type GraduationEvent, type GraduationEventPhoto, type GraduationFaceAssignment, type GraduationMatch, type Rank,
} from '@kog/core'
import { analyzePhoto, cropFace, normalizeBox, type FaceProgress } from '@kog/face-kit'
import { Badge, Button, EmptyState, ProgressBar, RankBand } from '@kog/ui'
import { toast, toastError } from '@kog/web-kit'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowRight, Camera, Check, Images, SkipForward, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from 'react'
import { Dialog } from '@/components/kit'
import { ErrorState, Loading } from '@/components/states'
import { useAcademy } from '@/lib/academy'
import { keys, useGraduationPhotos, useRanks } from '@/lib/queries'
import { db } from '@/lib/supabase'

/** Grau atual → próximo grau. */
export function RankChange({ from, to }: { from: Rank | undefined; to: Rank | undefined }) {
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-sm">
      {from ? (
        <span className="inline-flex items-center gap-1.5 text-soft"><RankBand colors={from.colors} className="w-6" />{from.name}</span>
      ) : (
        <span className="text-dim">Sem graduação</span>
      )}
      <ArrowRight className="size-3.5 text-faint" />
      {to ? <span className="inline-flex items-center gap-1.5 font-semibold text-text"><RankBand colors={to.colors} className="w-6" />{to.name}</span> : null}
    </div>
  )
}

/** Resposta sobre um rosto: aprovar já (admin), pular (fica para o professor), não é esta pessoa. */
type FaceAnswer = 'approve' | 'skip' | 'wrong'

interface ReviewFace {
  crop: string
  bbox: { x: number; y: number; w: number; h: number }
  assignment: GraduationFaceAssignment<GraduationMatch>
  /** Quem foi proposto para o rosto (o sugerido ou outro escolhido). */
  chosen: GraduationMatch | null
  candidateId: string | null
  answer: FaceAnswer | null
}

interface Review {
  eventId: string
  photoId: string
  progress: FaceProgress | null
  faces: ReviewFace[] | null
  error: string | null
}

const STAGE_LABEL: Record<FaceProgress['stage'], string> = {
  download: 'Baixando o reconhecimento facial (só na primeira vez)',
  detect: 'Procurando rostos na foto',
  embed: 'Lendo os rostos',
  signup: 'Lendo as fotos',
}

/**
 * Fotos da graduação. Cada foto sobe para o servidor e, neste aparelho, o app acha os rostos e pergunta ao banco quem é
 * cada um entre os alunos de todas as academias. Quem for reconhecido já entra na graduação como pendente (e o
 * professor dele é avisado); aqui o mestre aprova, pula ou diz que não é a pessoa.
 */
export function GraduationPhotos({ event }: { event: GraduationEvent }) {
  const { academy } = useAcademy()
  const queryClient = useQueryClient()
  const photos = useGraduationPhotos(event.id)
  const cameraRef = useRef<HTMLInputElement>(null)
  const galleryRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState<GraduationEventPhoto | null>(null)
  const [queue, setQueue] = useState<{ photoId: string; file: File }[]>([])
  const [review, setReview] = useState<Review | null>(null)

  const paths = (photos.data ?? []).map((p) => p.storage_path)
  const urls = useQuery({
    queryKey: [...keys.graduationPhotos(academy.gym_id, event.id), 'urls', paths.join(',')],
    queryFn: () => signGraduationPhotoUrls(db(), paths),
    enabled: paths.length > 0,
    staleTime: 30 * 60_000,
    gcTime: 50 * 60_000,
  })

  const refreshCandidates = () => queryClient.invalidateQueries({ queryKey: keys.graduationCandidates(academy.gym_id, event.id) })

  const remove = useMutation({
    mutationFn: (photo: GraduationEventPhoto) => deleteGraduationPhoto(db(), photo),
    onSuccess: async () => {
      setOpen(null)
      await queryClient.invalidateQueries({ queryKey: keys.graduationPhotos(academy.gym_id, event.id) })
      await refreshCandidates()
    },
    onError: toastError,
  })

  // Analisa a próxima foto da fila quando a revisão anterior fecha.
  useEffect(() => {
    if (review || queue.length === 0) return
    const [next, ...rest] = queue
    if (!next) return
    setQueue(rest)
    const photoId = next.photoId
    const update = (patch: Partial<Review>) => setReview((r) => (r && r.photoId === photoId ? { ...r, ...patch } : r))
    setReview({ eventId: event.id, photoId, progress: null, faces: null, error: null })
    ;(async () => {
      const result = await analyzePhoto(next.file, (progress) => update({ progress }))
      if (result.faces.length === 0) return update({ faces: [] })
      const lists = await matchGraduationFaces(db(), event.id, result.faces.map((f) => f.embedding))
      const assignments = assignGraduationFaces(lists)
      const faces: ReviewFace[] = await Promise.all(
        result.faces.map(async (f, i) => ({
          crop: await cropFace(result.canvas, f.box),
          bbox: normalizeBox(f.box, result.width, result.height),
          assignment: assignments[i]!,
          chosen: assignments[i]!.match,
          candidateId: null,
          answer: null,
        })),
      )
      // Reconheceu: já entra na graduação como pendente e o professor do aluno é avisado.
      const matched = faces.filter((f) => f.chosen)
      if (matched.length > 0) {
        const ids = await proposeGraduationCandidates(
          db(),
          event.id,
          matched.map((f) => ({ student_id: f.chosen!.student_id, source: 'face' as const, photo_id: photoId, bbox: f.bbox, score: f.assignment.confidence })),
        )
        matched.forEach((f, i) => (f.candidateId = ids[i] ?? null))
        await refreshCandidates()
      }
      update({ faces })
    })().catch((error: unknown) => update({ error: (error as Error)?.message || 'Erro desconhecido' }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [review, queue, event.id])

  async function onFiles(e: ChangeEvent<HTMLInputElement>) {
    const files = [...(e.target.files ?? [])]
    e.target.value = ''
    if (files.length === 0) return
    setBusy(true)
    try {
      const { default: compress } = await import('browser-image-compression')
      const queued: { photoId: string; file: File }[] = []
      for (const file of files) {
        const small = await compress(file, { maxWidthOrHeight: 1600, maxSizeMB: 0.5, fileType: 'image/jpeg', useWebWorker: true })
        const photoId = crypto.randomUUID()
        await uploadGraduationPhoto(db(), { id: photoId, gym_id: event.gym_id, event_id: event.id }, small)
        queued.push({ photoId, file })
      }
      await queryClient.invalidateQueries({ queryKey: keys.graduationPhotos(academy.gym_id, event.id) })
      setQueue((q) => [...q, ...queued])
    } catch (error) {
      toastError(error)
    } finally {
      setBusy(false)
    }
  }

  if (photos.isPending) return <Loading />
  if (photos.isError) return <ErrorState error={photos.error} onRetry={() => photos.refetch()} />
  const list = photos.data

  return (
    <div>
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={onFiles} />
      <input ref={galleryRef} type="file" accept="image/*" multiple hidden onChange={onFiles} />
      <div className="mb-3 flex flex-wrap gap-2">
        <Button onPress={() => galleryRef.current?.click()} loading={busy}><Images className="size-4" /> Enviar fotos</Button>
        <Button variant="ghost" onPress={() => cameraRef.current?.click()} disabled={busy}><Camera className="size-4" /> Tirar foto</Button>
      </div>
      <p className="mb-4 max-w-2xl text-sm text-dim">
        O reconhecimento roda neste aparelho e compara só os números do rosto com os alunos de todas as academias da equipe. Cada
        aluno reconhecido entra na lista abaixo com o próximo grau, e o professor dele recebe um aviso para aprovar.
      </p>

      {list.length === 0 ? (
        <EmptyState title="Nenhuma foto">Envie as fotos da graduação, com os alunos de frente.</EmptyState>
      ) : (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
          {list.map((p) => (
            <button key={p.id} type="button" onClick={() => setOpen(p)} className="aspect-square overflow-hidden rounded border border-line bg-surface-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {urls.data?.[p.storage_path] ? <img src={urls.data[p.storage_path]} alt="Foto da graduação" loading="lazy" className="size-full object-cover" /> : null}
            </button>
          ))}
        </div>
      )}

      {review ? <GraduationFaceReview review={review} onChange={setReview} onDone={async () => { setReview(null); await refreshCandidates() }} /> : null}

      <Dialog
        open={!!open}
        onClose={() => setOpen(null)}
        title="Foto da graduação"
        wide
        footer={
          open ? (
            <Button
              variant="danger"
              loading={remove.isPending}
              onPress={() => window.confirm('Apagar esta foto? Os alunos reconhecidos nela continuam na lista.') && remove.mutate(open)}
            >
              Apagar foto
            </Button>
          ) : undefined
        }
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {open && urls.data?.[open.storage_path] ? <img src={urls.data[open.storage_path]} alt="Foto da graduação" className="w-full rounded" /> : null}
      </Dialog>
    </div>
  )
}

// ── revisão dos rostos de uma foto ──────────────────────────────────────────

function GraduationFaceReview({ review, onChange, onDone }: { review: Review; onChange: (r: Review) => void; onDone: () => Promise<void> }) {
  const { isAdmin } = useAcademy()
  const ranks = useRanks()
  const rankById = useMemo(() => new Map((ranks.data ?? []).map((r) => [r.id, r])), [ranks.data])
  const [saving, setSaving] = useState(false)
  const [picking, setPicking] = useState<number | null>(null)
  const { faces } = review

  // Recortes em blob: liberar quando a revisão fecha.
  useEffect(() => () => faces?.forEach((f) => URL.revokeObjectURL(f.crop)), [faces])

  const setFace = (i: number, patch: Partial<ReviewFace>) =>
    faces && onChange({ ...review, faces: faces.map((f, j) => (j === i ? { ...f, ...patch } : f)) })

  async function save() {
    if (!faces) return
    setSaving(true)
    try {
      let approved = 0
      let skipped = 0
      for (const f of faces) {
        if (!f.candidateId && !f.chosen) continue
        if (f.answer === 'wrong') {
          if (f.candidateId) await dismissGraduationCandidate(db(), f.candidateId)
          continue
        }
        if (f.answer === 'approve' && f.candidateId) {
          await decideGraduationCandidate(db(), f.candidateId, true)
          approved++
        } else if (f.candidateId) {
          skipped++
        }
      }
      toast(
        [approved > 0 ? `${approved} aprovado${approved === 1 ? '' : 's'}` : null, skipped > 0 ? `${skipped} para o professor aprovar` : null]
          .filter(Boolean)
          .join(' · ') || 'Revisão salva.',
      )
      await onDone()
    } catch (error) {
      toastError(error)
    } finally {
      setSaving(false)
    }
  }

  // Escolher outra pessoa (entre as parecidas) para um rosto: tira a anterior e propõe a escolhida.
  async function choose(i: number, m: GraduationMatch | null) {
    const f = faces?.[i]
    if (!f) return
    setPicking(null)
    try {
      if (f.candidateId) await dismissGraduationCandidate(db(), f.candidateId)
      let candidateId: string | null = null
      if (m) {
        const [id] = await proposeGraduationCandidates(db(), review.eventId, [
          { student_id: m.student_id, source: 'face', photo_id: review.photoId, bbox: f.bbox, score: f.assignment.confidence },
        ])
        candidateId = id ?? null
      }
      setFace(i, { chosen: m, candidateId, answer: null })
    } catch (error) {
      toastError(error)
    }
  }

  const loading = !faces && !review.error
  return (
    <Dialog
      open
      onClose={() => !saving && onDone()}
      title="Rostos da foto"
      wide
      footer={
        faces && faces.length > 0 ? (
          <>
            <Button variant="ghost" onPress={() => onDone()} disabled={saving}>Fechar (pular todos)</Button>
            <Button onPress={save} loading={saving}><Check className="size-4" /> Salvar respostas</Button>
          </>
        ) : (
          <Button variant="ghost" onPress={() => onDone()}>Fechar</Button>
        )
      }
    >
      {review.error ? (
        <ErrorState error={new Error(review.error)} title="Não foi possível ler a foto" />
      ) : loading ? (
        <div className="py-6">
          <p className="mb-3 text-sm text-soft">{review.progress ? STAGE_LABEL[review.progress.stage] : 'Preparando a foto'}…</p>
          {review.progress ? <ProgressBar value={review.progress.done} max={Math.max(1, review.progress.total)} /> : null}
        </div>
      ) : faces!.length === 0 ? (
        <EmptyState title="Nenhum rosto encontrado nesta foto." />
      ) : (
        <>
          <p className="mb-4 text-sm text-dim">
            Quem foi reconhecido já está na lista como “aguardando aprovação” e o professor dele foi avisado.
            {isAdmin ? ' Aprove aqui, pule (fica para o professor) ou diga que não é a pessoa.' : ' Pule (fica para o professor e o administrador) ou diga que não é a pessoa.'}
          </p>
          <ul className="space-y-3">
            {faces!.map((f, i) => {
              const m = f.chosen
              return (
                <li key={i} className="flex gap-3 rounded-lg border border-line p-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={f.crop} alt="Rosto" className="size-20 shrink-0 rounded object-cover" />
                  <div className="min-w-0 flex-1">
                    {m ? (
                      <>
                        <p className="font-bold text-text">
                          {m.name}
                          {f.chosen === f.assignment.match ? <span className="ml-2 text-xs font-normal text-dim">{formatConfidence(f.assignment.confidence)}</span> : null}
                        </p>
                        <p className="text-xs text-dim">{m.gym_name}</p>
                        <RankChange
                          from={m.current_rank_id ? rankById.get(m.current_rank_id) : undefined}
                          to={m.next_rank_id ? rankById.get(m.next_rank_id) : undefined}
                        />
                      </>
                    ) : (
                      <p className="text-sm text-dim">Ninguém parecido o bastante. {f.assignment.alternatives.length > 0 ? 'Escolha abaixo se for um destes.' : 'Inclua pelo nome na lista, se for o caso.'}</p>
                    )}

                    {m && f.answer !== 'wrong' ? (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {isAdmin ? (
                          <AnswerButton active={f.answer === 'approve'} onPress={() => setFace(i, { answer: f.answer === 'approve' ? null : 'approve' })}>
                            <Check className="size-4" /> Aprovar
                          </AnswerButton>
                        ) : null}
                        <AnswerButton active={f.answer === 'skip'} onPress={() => setFace(i, { answer: f.answer === 'skip' ? null : 'skip' })}>
                          <SkipForward className="size-4" /> Pular
                        </AnswerButton>
                        <AnswerButton active={false} onPress={() => setPicking(picking === i ? null : i)}>
                          <X className="size-4" /> Não é esta pessoa
                        </AnswerButton>
                      </div>
                    ) : null}
                    {f.answer === 'wrong' ? <Badge tone="danger" className="mt-2">Sai da graduação ao salvar</Badge> : null}

                    {(picking === i || !m) && f.assignment.alternatives.length + (f.assignment.match && f.chosen !== f.assignment.match ? 1 : 0) > 0 ? (
                      <div className="mt-2 rounded border border-line p-2">
                        <p className="mb-1.5 text-xs font-semibold text-dim">É outra pessoa?</p>
                        <div className="flex flex-wrap gap-1.5">
                          {[f.assignment.match, ...f.assignment.alternatives]
                            .filter((a): a is GraduationMatch => !!a && a.student_id !== m?.student_id)
                            .map((a) => (
                              <Button key={a.student_id} size="sm" variant="ghost" onPress={() => choose(i, a)}>
                                {a.name} <span className="text-xs text-dim">· {a.gym_name}</span>
                              </Button>
                            ))}
                          {m ? (
                            <Button size="sm" variant="plain" onPress={() => { setPicking(null); setFace(i, { answer: 'wrong' }) }}>
                              Nenhum destes
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    ) : picking === i ? (
                      <div className="mt-2">
                        <Button size="sm" variant="plain" onPress={() => { setPicking(null); setFace(i, { answer: 'wrong' }) }}>Confirmar: não é esta pessoa</Button>
                      </div>
                    ) : null}
                  </div>
                </li>
              )
            })}
          </ul>
        </>
      )}
    </Dialog>
  )
}

function AnswerButton({ active, onPress, children }: { active: boolean; onPress: () => void; children: ReactNode }) {
  return (
    <Button size="sm" variant={active ? 'gold' : 'ghost'} onPress={onPress} aria-pressed={active}>
      {children}
    </Button>
  )
}
