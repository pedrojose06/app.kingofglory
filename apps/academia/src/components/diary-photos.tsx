'use client'

import {
  type ClassPhoto, type ClassRow, deleteClassPhoto, saveFaceDecisions, signPhotoUrls, type StoredReference, uploadClassPhoto,
} from '@kog/core'
import { type AnalyzedPhoto, analyzePhoto, FaceReview, type FaceProgress, type FaceReviewSave, type FaceReviewTarget } from '@kog/face-kit'
import { Button, EmptyState } from '@kog/ui'
import { toast, toastError } from '@kog/web-kit'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Camera, Images } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { Dialog } from '@/components/kit'
import { useMarkAttendance } from '@/components/diary-roll-call'
import { ErrorState, Loading } from '@/components/states'
import { useAcademy } from '@/lib/academy'
import { keys, useClassAttendance, useClassPhotos, useDiaryStudents, useFaceReferences } from '@/lib/queries'
import { db } from '@/lib/supabase'

interface Review {
  target: FaceReviewTarget
  progress: FaceProgress | null
  result: AnalyzedPhoto | null
  error: string | null
}

/**
 * Fotos da aula e presença pelo rosto. A foto sobe para o servidor (comprimida) e, no próprio computador ou celular,
 * o app procura os rostos e pergunta "Esta pessoa é Fulano?". Nada vira presença sem a resposta de quem faz a chamada.
 */
export function DiaryPhotos({ klass, canEdit }: { klass: ClassRow; canEdit: boolean }) {
  const { academy } = useAcademy()
  const queryClient = useQueryClient()
  const photos = useClassPhotos(klass.id)
  const students = useDiaryStudents()
  const attendance = useClassAttendance(klass.id)
  const { mark } = useMarkAttendance(klass.id)
  const cameraRef = useRef<HTMLInputElement>(null)
  const galleryRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState<ClassPhoto | null>(null)

  const paths = (photos.data ?? []).map((p) => p.storage_path)
  const urls = useQuery({
    queryKey: [...keys.classPhotos(academy.gym_id, klass.id), 'urls', paths.join(',')],
    queryFn: () => signPhotoUrls(db(), paths),
    enabled: paths.length > 0,
    staleTime: 30 * 60_000,
    gcTime: 50 * 60_000, // URLs assinadas valem 1h
  })
  const remove = useMutation({
    mutationFn: (photo: ClassPhoto) => deleteClassPhoto(db(), photo),
    onSuccess: async () => {
      setOpen(null)
      await queryClient.invalidateQueries({ queryKey: keys.classPhotos(academy.gym_id, klass.id) })
    },
    onError: toastError,
  })

  // ── presença pelo rosto ──
  // Só entra no reconhecimento quem autorizou o uso de imagem (o banco também garante).
  const faceStudents = useMemo(() => (students.data ?? []).filter((s) => s.active && s.image_consent_at), [students.data])
  const refs = useFaceReferences(faceStudents.length > 0)
  const statusOf = useMemo(() => new Map((attendance.data ?? []).map((a) => [a.student_id, a.status])), [attendance.data])
  const [faceQueue, setFaceQueue] = useState<{ photoId: string; file: File }[]>([])
  const [review, setReview] = useState<Review | null>(null)

  // Analisa a próxima foto da fila quando a revisão anterior fecha.
  useEffect(() => {
    if (review || faceQueue.length === 0) return
    const [next, ...rest] = faceQueue
    if (!next) return
    setFaceQueue(rest)
    const target: FaceReviewTarget = { photoId: next.photoId, classId: klass.id, gymId: klass.gym_id }
    setReview({ target, progress: null, result: null, error: null })
    analyzePhoto(next.file, (progress) => setReview((r) => (r && r.target === target ? { ...r, progress } : r)))
      .then((result) => setReview((r) => (r && r.target === target ? { ...r, result } : r)))
      .catch((error: unknown) =>
        setReview((r) => (r && r.target === target ? { ...r, error: (error as Error)?.message || 'Erro desconhecido' } : r)),
      )
  }, [review, faceQueue, klass.id, klass.gym_id])

  const saveFaces = useMutation({
    mutationFn: async ({ items, toMark }: FaceReviewSave) => {
      // A foto já está no servidor (subiu antes da análise): as decisões apontam para ela.
      await saveFaceDecisions(db(), items)
      return { items, toMark }
    },
    onSuccess: ({ items, toMark }, { added }) => {
      if (toMark.length > 0) mark(toMark, 'present', 'face')
      if (added.length > 0) {
        // O que acabou de aprender já vale para a próxima foto.
        queryClient.setQueryData<StoredReference[]>(keys.faceRefs(academy.gym_id), (old) => [...(old ?? []), ...added])
      }
      const n = items.filter((i) => i.student_id).length
      toast(n > 0 ? `${n} ${n === 1 ? 'aluno reconhecido' : 'alunos reconhecidos'}: presença marcada pelo rosto.` : 'Respostas salvas.')
    },
    onError: toastError,
  })

  async function onFiles(e: ChangeEvent<HTMLInputElement>) {
    const files = [...(e.target.files ?? [])]
    e.target.value = ''
    if (files.length === 0) return
    setBusy(true)
    try {
      const { default: compress } = await import('browser-image-compression')
      const queued: { photoId: string; file: File }[] = []
      for (const file of files) {
        // ~1600px e até ~500 KB: nítido para ver a turma e leve para guardar.
        const small = await compress(file, { maxWidthOrHeight: 1600, maxSizeMB: 0.5, fileType: 'image/jpeg', useWebWorker: true })
        const photoId = crypto.randomUUID()
        await uploadClassPhoto(db(), { id: photoId, gym_id: klass.gym_id, class_id: klass.id, taken_at: new Date().toISOString() }, small)
        queued.push({ photoId, file })
      }
      await queryClient.invalidateQueries({ queryKey: keys.classPhotos(academy.gym_id, klass.id) })
      // Reconhecimento: no próprio aparelho, com a foto original (mais nítida que a comprimida enviada).
      if (faceStudents.length === 0) {
        toast('Foto salva. Para a presença pelo rosto, autorize o uso de imagem na ficha dos alunos.')
      } else {
        setFaceQueue((q) => [...q, ...queued])
      }
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
      {canEdit ? (
        <div className="mb-4 flex flex-wrap gap-2">
          <Button onPress={() => galleryRef.current?.click()} loading={busy}><Images className="size-4" /> Enviar foto da turma</Button>
          <Button variant="ghost" onPress={() => cameraRef.current?.click()} disabled={busy}><Camera className="size-4" /> Tirar foto</Button>
        </div>
      ) : null}
      <p className="mb-4 max-w-2xl text-sm text-dim">
        {faceStudents.length > 0
          ? `Ao enviar a foto, o app procura os rostos e sugere quem é cada um (${faceStudents.length} ${faceStudents.length === 1 ? 'aluno autorizou' : 'alunos autorizaram'} o reconhecimento). A presença só é marcada depois da sua confirmação. O reconhecimento roda neste aparelho: a foto não vai para nenhum serviço externo.`
          : 'Para marcar presença pelo rosto, autorize o uso de imagem e o reconhecimento facial na ficha de cada aluno (Cadastros › Alunos).'}
      </p>

      {list.length === 0 ? (
        <EmptyState title="Nenhuma foto nesta aula">Tire a foto da turma no fim do treino, com todos de frente.</EmptyState>
      ) : (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
          {list.map((p) => (
            <button key={p.id} type="button" onClick={() => setOpen(p)} className="aspect-square overflow-hidden rounded border border-line bg-surface-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {urls.data?.[p.storage_path] ? <img src={urls.data[p.storage_path]} alt="Foto do treino" loading="lazy" className="size-full object-cover" /> : null}
            </button>
          ))}
        </div>
      )}

      <FaceReview
        target={review?.target ?? null}
        progress={review?.progress ?? null}
        result={review?.result ?? null}
        error={review?.error ?? null}
        students={faceStudents}
        refs={refs.data ?? []}
        statusOf={statusOf}
        autoApproveMin={null}
        onSave={(save) => saveFaces.mutate(save)}
        onClose={() => setReview(null)}
      />

      <Dialog
        open={!!open}
        onClose={() => setOpen(null)}
        title="Foto do treino"
        wide
        footer={
          canEdit && open ? (
            <Button variant="danger" loading={remove.isPending} onPress={() => window.confirm('Apagar esta foto?') && remove.mutate(open)}>
              Apagar foto
            </Button>
          ) : undefined
        }
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {open && urls.data?.[open.storage_path] ? <img src={urls.data[open.storage_path]} alt="Foto do treino" className="w-full rounded" /> : null}
      </Dialog>
    </div>
  )
}
