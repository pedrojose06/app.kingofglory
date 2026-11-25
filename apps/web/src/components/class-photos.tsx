'use client'

import { deleteClassPhoto, keys, overlayAttendance, signPhotoUrls, type ClassPhoto, type ClassRow, type StoredReference } from '@kog/core'
import { Button, EmptyState, Sheet, Spinner } from '@kog/ui'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Camera, Images } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { FaceReview, type FaceReviewTarget } from '@/components/face-review'
import { analyzePhoto, faceModelsCached, type AnalyzedPhoto, type FaceProgress } from '@kog/face-kit'
import { bootstrapSignupReferences } from '@/lib/face/signup-refs'
import { outbox, useOnline, useOutbox } from '@/lib/outbox'
import { useClassAttendance, useClassPhotos, useFaceReferences, useProfile, useSave, useStudents } from '@/lib/queries'
import { db } from '@/lib/supabase'
import { toast, toastError } from '@/lib/toast'

/** Miniatura de uma foto ainda na fila (lida do IndexedDB). */
function PendingThumb({ blobKey, failed }: { blobKey: string; failed: boolean }) {
  const [url, setUrl] = useState<string>()
  useEffect(() => {
    let objectUrl: string | undefined
    void outbox.getBlob(blobKey).then((blob) => {
      if (!blob) return
      objectUrl = URL.createObjectURL(blob)
      setUrl(objectUrl)
    })
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [blobKey])
  return (
    <div className="relative aspect-square overflow-hidden rounded border border-line bg-surface-2">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {url ? <img src={url} alt="Foto aguardando envio" className="size-full object-cover opacity-60" /> : null}
      <span className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1.5 bg-black/60 py-1 text-[11px] font-bold text-white">
        {failed ? 'Erro no envio' : (<><Spinner className="size-3" /> Na fila</>)}
      </span>
    </div>
  )
}

export function ClassPhotos({ klass }: { klass: ClassRow }) {
  const photos = useClassPhotos(klass.id)
  const items = useOutbox()
  const cameraRef = useRef<HTMLInputElement>(null)
  const galleryRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState<ClassPhoto | null>(null)

  const paths = (photos.data ?? []).map((p) => p.storage_path)
  const urls = useQuery({
    queryKey: [...keys.classPhotos(klass.id), 'urls', paths.join(',')],
    queryFn: () => signPhotoUrls(db(), paths),
    enabled: paths.length > 0,
    staleTime: 30 * 60_000,
    gcTime: 50 * 60_000, // URLs assinadas valem 1h
  })

  const pending = items.flatMap((i) => (i.op.type === 'photo.upload' && i.op.meta.class_id === klass.id ? [{ id: i.id, blobKey: i.op.blobKey, failed: !!i.error }] : []))
  const remove = useSave((photo: ClassPhoto) => deleteClassPhoto(db(), photo), [keys.classPhotos(klass.id)], () => setOpen(null))

  // ── Presença pelo rosto ──
  const online = useOnline()
  const queryClient = useQueryClient()
  const students = useStudents()
  const profile = useProfile()
  const attendance = useClassAttendance(klass.id)
  const statusOf = useMemo(() => overlayAttendance(attendance.data ?? [], items, klass.id), [attendance.data, items, klass.id])
  // Só entra no reconhecimento quem autorizou o uso de imagem (o banco também garante).
  const faceStudents = useMemo(
    () => (students.data ?? []).filter((s) => s.gym_id === klass.gym_id && s.active && s.image_consent_at),
    [students.data, klass.gym_id],
  )
  const refs = useFaceReferences(klass.gym_id, faceStudents.length > 0)
  const [faceQueue, setFaceQueue] = useState<{ photoId: string; file: File }[]>([])
  const [review, setReview] = useState<{ target: FaceReviewTarget; progress: FaceProgress | null; result: AnalyzedPhoto | null; error: string | null } | null>(null)

  // Analisa a próxima foto da fila quando a revisão anterior fecha.
  useEffect(() => {
    if (review || faceQueue.length === 0) return
    const [next, ...rest] = faceQueue
    if (!next) return
    setFaceQueue(rest)
    const target = { photoId: next.photoId, classId: klass.id, gymId: klass.gym_id }
    setReview({ target, progress: null, result: null, error: null })
    const onProgress = (progress: FaceProgress) => setReview((r) => (r && r.target === target ? { ...r, progress } : r))
    // Antes da foto da turma: a foto do cadastro de quem ainda não tem referência vira a primeira (precisa de internet).
    const signup = navigator.onLine ? bootstrapSignupReferences(klass.gym_id, onProgress) : Promise.resolve([])
    signup
      .then((added) => {
        if (added.length > 0) {
          queryClient.setQueryData<StoredReference[]>(keys.faceReferences(klass.gym_id), (old) => [...(old ?? []), ...added])
        }
        return analyzePhoto(next.file, onProgress)
      })
      .then((result) => setReview((r) => (r && r.target === target ? { ...r, result } : r)))
      .catch((error: unknown) =>
        setReview((r) => (r && r.target === target ? { ...r, error: (error as Error)?.message || 'Erro desconhecido' } : r)),
      )
  }, [review, faceQueue, klass.id, klass.gym_id, queryClient])

  async function onFiles(e: ChangeEvent<HTMLInputElement>) {
    const files = [...(e.target.files ?? [])]
    e.target.value = ''
    if (files.length === 0) return
    setBusy(true)
    try {
      const { default: compress } = await import('browser-image-compression')
      const queued: { photoId: string; file: File }[] = []
      for (const file of files) {
        // ~1600px e até ~500 KB: nítido para ver a turma e leve para o 4G da academia.
        const small = await compress(file, { maxWidthOrHeight: 1600, maxSizeMB: 0.5, fileType: 'image/jpeg', useWebWorker: true })
        const photoId = crypto.randomUUID()
        await outbox.addPhoto({ id: photoId, gym_id: klass.gym_id, class_id: klass.id, taken_at: new Date().toISOString() }, small)
        queued.push({ photoId, file })
      }
      // Reconhecimento: no próprio celular, com a foto original (mais nítida que a comprimida enviada).
      if (faceStudents.length === 0) {
        toast('Foto salva. Para presença pelo rosto, marque "Autorizou uso de imagem" nos alunos.')
      } else if (online || (await faceModelsCached())) {
        setFaceQueue((q) => [...q, ...queued])
      } else {
        toast('Foto salva. O reconhecimento facial precisa de internet na primeira vez.')
      }
    } catch (error) {
      toastError(error)
    } finally {
      setBusy(false)
    }
  }

  const empty = (photos.data?.length ?? 0) === 0 && pending.length === 0

  return (
    <div>
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={onFiles} />
      <input ref={galleryRef} type="file" accept="image/*" multiple hidden onChange={onFiles} />
      <div className="mb-4 grid grid-cols-2 gap-2">
        <Button onPress={() => cameraRef.current?.click()} loading={busy}><Camera className="size-4" /> Foto do treino</Button>
        <Button variant="ghost" onPress={() => galleryRef.current?.click()} disabled={busy}><Images className="size-4" /> Galeria</Button>
      </div>

      {empty ? (
        <EmptyState title="Nenhuma foto nesta aula">Tire a foto da turma no fim do treino.</EmptyState>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {(photos.data ?? []).map((p) => (
            <button key={p.id} type="button" onClick={() => setOpen(p)} className="aspect-square overflow-hidden rounded border border-line bg-surface-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {urls.data?.[p.storage_path] ? <img src={urls.data[p.storage_path]} alt="Foto do treino" loading="lazy" className="size-full object-cover" /> : null}
            </button>
          ))}
          {pending.map((p) => <PendingThumb key={p.id} blobKey={p.blobKey} failed={p.failed} />)}
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
        autoApproveMin={profile.data?.face_auto_approve_min}
        onClose={() => setReview(null)}
      />

      <Sheet open={!!open} onClose={() => setOpen(null)} title="Foto do treino">
        {open && urls.data?.[open.storage_path] ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={urls.data[open.storage_path]} alt="Foto do treino" className="w-full rounded" />
        ) : null}
        <Button variant="danger" block className="mt-3" loading={remove.isPending} onPress={() => open && window.confirm('Apagar esta foto?') && remove.mutate(open)}>
          Apagar foto
        </Button>
      </Sheet>
    </div>
  )
}
