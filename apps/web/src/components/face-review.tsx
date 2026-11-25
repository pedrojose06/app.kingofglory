'use client'

// Revisão dos rostos de uma foto do treino (a tela em si é de @kog/face-kit). Aqui só o que é do app do professor:
// as respostas e as presenças vão pela fila offline, e o que o app aprendeu já vale para a próxima foto.

import { keys, type StoredReference } from '@kog/core'
import { FaceReview as SharedFaceReview, type FaceReviewProps, type FaceReviewSave } from '@kog/face-kit'
import { useQueryClient } from '@tanstack/react-query'
import { outbox } from '@/lib/outbox'
import { toast } from '@/lib/toast'

export type { FaceReviewTarget, FaceReviewWalkIn } from '@kog/face-kit'

export function FaceReview(props: Omit<FaceReviewProps, 'onSave'>) {
  const queryClient = useQueryClient()

  function save({ target, items, added, toMark }: FaceReviewSave) {
    // A fila é em ordem: a foto sobe antes das decisões, e as presenças vão pelo mesmo caminho da chamada.
    outbox.add({ type: 'face.decisions', classId: target.classId, gymId: target.gymId, items })
    for (const studentId of toMark) {
      outbox.add({
        type: 'attendance.mark',
        mark: { class_id: target.classId, student_id: studentId, status: 'present', source: 'face', marked_at: new Date().toISOString() },
      })
    }
    // O que acabou de aprender já vale para a próxima foto, mesmo offline.
    if (added.length > 0) {
      queryClient.setQueryData<StoredReference[]>(keys.faceReferences(target.gymId), (old) => [...(old ?? []), ...added])
    }
    const n = items.filter((i) => i.student_id).length
    toast(n > 0 ? `${n} ${n === 1 ? 'presença marcada' : 'presenças marcadas'} pelo rosto` : 'Respostas salvas')
  }

  return <SharedFaceReview {...props} onSave={save} />
}
