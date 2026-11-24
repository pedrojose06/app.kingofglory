'use client'

// Presença avulsa pelo rosto. O aluno pode ser de qualquer academia em que o professor dá aula, então a foto é
// comparada com as referências de todas elas juntas. A foto não sobe nem fica guardada (a avulsa não tem aula para
// prender a foto): o reconhecimento roda no celular e os confirmados só são marcados na lista da avulsa.

import { keys, type AttendanceStatus, type Gym, type StoredReference, type Student } from '@kog/core'
import { Button } from '@kog/ui'
import { useQueryClient } from '@tanstack/react-query'
import { Images, ScanFace } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { FaceReview, type FaceReviewWalkIn } from '@/components/face-review'
import { analyzePhoto, faceModelsCached, type AnalyzedPhoto, type FaceProgress } from '@/lib/face/engine'
import { bootstrapSignupReferences } from '@/lib/face/signup-refs'
import { useOnline } from '@/lib/outbox'
import { useFaceReferencesOfGyms, useProfile } from '@/lib/queries'
import { toast } from '@/lib/toast'

interface Props {
  gyms: readonly Gym[]
  /** Alunos de todas as academias do professor. */
  students: readonly Student[]
  /** Quem já está escolhido na lista da avulsa. */
  selected: ReadonlySet<string>
  onConfirm: (studentIds: string[]) => void
}

interface Review {
  target: FaceReviewWalkIn
  progress: FaceProgress | null
  result: AnalyzedPhoto | null
  error: string | null
}

export function WalkInFace({ gyms, students, selected, onConfirm }: Props) {
  const online = useOnline()
  const queryClient = useQueryClient()
  const profile = useProfile()
  const cameraRef = useRef<HTMLInputElement>(null)
  const galleryRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [queue, setQueue] = useState<File[]>([])
  const [review, setReview] = useState<Review | null>(null)
  // Sempre a versão atual (o valor 1×/2×/3× pode mudar enquanto a revisão está aberta).
  const confirmRef = useRef(onConfirm)
  useEffect(() => {
    confirmRef.current = onConfirm
  }, [onConfirm])

  // Só entra no reconhecimento quem autorizou o uso de imagem (o banco também garante).
  const faceStudents = useMemo(() => students.filter((s) => s.active && s.image_consent_at), [students])
  const gymIds = useMemo(() => [...new Set(faceStudents.map((s) => s.gym_id))], [faceStudents])
  const refs = useFaceReferencesOfGyms(gymIds, faceStudents.length > 0)

  const gymName = useMemo(() => new Map(gyms.map((g) => [g.id, g.name])), [gyms])
  const studentGym = useMemo(() => new Map(faceStudents.map((s) => [s.id, s.gym_id])), [faceStudents])
  const detailOf = gyms.length > 1 ? (id: string) => gymName.get(studentGym.get(id) ?? '') : undefined
  // "Já marcado" na revisão = já escolhido na lista da avulsa.
  const statusOf = useMemo(() => new Map<string, AttendanceStatus>([...selected].map((id) => [id, 'present'])), [selected])

  // Analisa a próxima foto quando a revisão anterior fecha.
  useEffect(() => {
    if (review || queue.length === 0) return
    const [file, ...rest] = queue
    if (!file) return
    setQueue(rest)
    const target: FaceReviewWalkIn = { walkIn: true, onApply: (ids) => confirmRef.current(ids) }
    setReview({ target, progress: null, result: null, error: null })
    const onProgress = (progress: FaceProgress) => setReview((r) => (r && r.target === target ? { ...r, progress } : r))
    // A foto do cadastro de quem ainda não tem referência vira a primeira (precisa de internet), academia por academia.
    const signup = async () => {
      if (!navigator.onLine) return
      for (const gymId of gymIds) {
        const added = await bootstrapSignupReferences(gymId, onProgress)
        if (added.length > 0) {
          queryClient.setQueryData<StoredReference[]>(keys.faceReferences(gymId), (old) => [...(old ?? []), ...added])
        }
      }
    }
    signup()
      .then(() => analyzePhoto(file, onProgress))
      .then((result) => setReview((r) => (r && r.target === target ? { ...r, result } : r)))
      .catch((error: unknown) =>
        setReview((r) => (r && r.target === target ? { ...r, error: (error as Error)?.message || 'Erro desconhecido' } : r)),
      )
  }, [review, queue, gymIds, queryClient])

  async function onFiles(e: ChangeEvent<HTMLInputElement>) {
    const files = [...(e.target.files ?? [])]
    e.target.value = ''
    if (files.length === 0) return
    if (faceStudents.length === 0) {
      return toast('Para presença pelo rosto, marque "Autorizou uso de imagem" nos alunos.')
    }
    setBusy(true)
    try {
      if (online || (await faceModelsCached())) setQueue((q) => [...q, ...files])
      else toast('O reconhecimento facial precisa de internet na primeira vez.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-4">
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={onFiles} />
      <input ref={galleryRef} type="file" accept="image/*" multiple hidden onChange={onFiles} />
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <Button variant="ghost" onPress={() => cameraRef.current?.click()} loading={busy}>
          <ScanFace className="size-4" /> Reconhecer pela foto
        </Button>
        <Button variant="ghost" onPress={() => galleryRef.current?.click()} disabled={busy} aria-label="Escolher foto da galeria">
          <Images className="size-4" />
        </Button>
      </div>
      <p className="mt-1 text-xs text-dim">
        Reconhece alunos de todas as suas academias. A foto não é guardada; você confirma cada rosto antes de marcar.
      </p>

      <FaceReview
        target={review?.target ?? null}
        progress={review?.progress ?? null}
        result={review?.result ?? null}
        error={review?.error ?? null}
        students={faceStudents}
        refs={refs.data}
        statusOf={statusOf}
        autoApproveMin={profile.data?.face_auto_approve_min}
        detailOf={detailOf}
        onClose={() => setReview(null)}
      />
    </div>
  )
}
