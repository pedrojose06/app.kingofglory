'use client'

// Foto do aluno na ficha. Além de identificar o aluno, é o primeiro rosto de referência do reconhecimento facial: com ela
// o app já sugere o nome certo na primeira foto da turma. O rosto é achado neste aparelho e só o vetor vai para o banco.

import { saveStudentPhoto, setStudentPhoto, signStudentPhotoUrls, type Student } from '@kog/core'
import { analyzePhoto, type FaceProgress } from '@kog/face-kit'
import { Button } from '@kog/ui'
import { toast, toastError } from '@kog/web-kit'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Camera, ImagePlus, Trash2, UserRound } from 'lucide-react'
import { useRef, useState, type ChangeEvent } from 'react'
import { useAcademy } from '@/lib/academy'
import { keys } from '@/lib/queries'
import { db } from '@/lib/supabase'

/** Vetor do rosto da foto do aluno: o maior rosto (pode ter alguém atrás). null se não achou rosto. */
export async function faceVectorOf(photo: Blob, onProgress?: (p: FaceProgress) => void): Promise<number[] | null> {
  // Folga em volta: numa foto de rosto ele ocupa quase tudo e o detector acha melhor com margem.
  const { faces } = await analyzePhoto(photo, onProgress, { pad: 1.5 })
  const face = [...faces].sort((a, b) => b.box.w * b.box.h - a.box.w * a.box.h)[0]
  return face ? face.embedding : null
}

/** Recalcula o rosto de referência a partir da foto já salva (ex.: aluno voltou ao reconhecimento). Nunca lança. */
export async function refreshPhotoReference(student: Pick<Student, 'id' | 'photo_path'>): Promise<boolean> {
  if (!student.photo_path) return false
  try {
    const url = (await signStudentPhotoUrls(db(), [student.photo_path], 300))[student.photo_path]
    if (!url) return false
    const res = await fetch(url)
    if (!res.ok) return false
    const vector = await faceVectorOf(await res.blob())
    if (!vector) return false
    await setStudentPhoto(db(), student.id, student.photo_path, vector)
    return true
  } catch {
    return false
  }
}

export function useStudentPhotoUrl(path: string | null | undefined) {
  const { academy } = useAcademy()
  return useQuery({
    queryKey: ['academia', academy.gym_id, 'foto-aluno', path ?? ''],
    queryFn: async () => (await signStudentPhotoUrls(db(), [path!]))[path!] ?? null,
    enabled: Boolean(path),
    staleTime: 30 * 60_000,
    gcTime: 50 * 60_000, // links assinados valem 1h
  })
}

/** Foto redonda (ou o ícone, sem foto). */
export function AvatarImage({ url, name, className = 'size-16' }: { url: string | null | undefined; name: string; className?: string }) {
  return (
    <span className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-line bg-surface-2 text-faint ${className}`}>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={`Foto de ${name}`} className="size-full object-cover" loading="lazy" />
      ) : (
        <UserRound className="size-1/2" aria-hidden />
      )}
    </span>
  )
}

/** Foto redonda do aluno (ou o ícone, sem foto). */
export function StudentAvatar({ path, name, className }: { path: string | null | undefined; name: string; className?: string }) {
  const url = useStudentPhotoUrl(path)
  return <AvatarImage url={url.data} name={name} className={className} />
}

/** Links das fotos de vários alunos de uma vez (lista de alunos). */
export function useStudentPhotoUrls(paths: readonly string[]) {
  const { academy } = useAcademy()
  const sorted = [...new Set(paths)].sort()
  return useQuery({
    queryKey: ['academia', academy.gym_id, 'fotos-alunos', sorted.join(',')],
    queryFn: () => signStudentPhotoUrls(db(), sorted),
    enabled: sorted.length > 0,
    staleTime: 30 * 60_000,
    gcTime: 50 * 60_000,
  })
}

const progressLabel = (p: FaceProgress | null) =>
  !p ? 'Procurando o rosto…' : p.stage === 'download' ? `Baixando o reconhecimento facial… ${Math.round((p.done / Math.max(p.total, 1)) * 100)}%` : 'Procurando o rosto…'

/** Foto na ficha: mostrar, tirar, enviar e remover (só o administrador muda). */
export function StudentPhoto({ student }: { student: Student }) {
  const { academy, isAdmin } = useAcademy()
  const queryClient = useQueryClient()
  const cameraRef = useRef<HTMLInputElement>(null)
  const galleryRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const optedOut = Boolean(student.face_opt_out_at)

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      setBusy(progressLabel(null))
      // O rosto sai da foto original (mais nítida); o que sobe é a versão reduzida.
      const vector = optedOut ? null : await faceVectorOf(file, (p) => setBusy(progressLabel(p)))
      if (!optedOut && !vector && !window.confirm('Não achei um rosto nesta foto. Salvar mesmo assim? Ela não vai ajudar o reconhecimento facial.')) return
      setBusy('Salvando a foto…')
      const { default: compress } = await import('browser-image-compression')
      const small = await compress(file, { maxWidthOrHeight: 800, maxSizeMB: 0.3, fileType: 'image/jpeg', useWebWorker: true })
      await saveStudentPhoto(db(), student, { id: crypto.randomUUID(), file: small }, vector)
      await queryClient.invalidateQueries({ queryKey: keys.all(academy.gym_id) })
      toast(
        vector
          ? 'Foto salva. O rosto já ajuda o reconhecimento nas fotos da turma.'
          : optedOut
            ? 'Foto salva. O aluno está fora do reconhecimento facial.'
            : 'Foto salva, sem rosto para o reconhecimento.',
      )
    } catch (error) {
      toastError(error)
    } finally {
      setBusy(null)
    }
  }

  async function remove() {
    if (!window.confirm('Remover a foto do aluno? O rosto dela deixa de ajudar o reconhecimento.')) return
    try {
      setBusy('Removendo…')
      await setStudentPhoto(db(), student.id, null, null)
      await queryClient.invalidateQueries({ queryKey: keys.all(academy.gym_id) })
      toast('Foto removida.')
    } catch (error) {
      toastError(error)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="flex items-center gap-4">
      <StudentAvatar path={student.photo_path} name={student.name} className="size-20" />
      {isAdmin ? (
        <div className="min-w-0">
          <input ref={cameraRef} type="file" accept="image/*" capture="user" hidden onChange={onFile} />
          <input ref={galleryRef} type="file" accept="image/*" hidden onChange={onFile} />
          {busy ? (
            <p className="text-sm text-dim">{busy}</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="ghost" onPress={() => cameraRef.current?.click()}>
                <Camera className="size-4" /> Tirar foto
              </Button>
              <Button size="sm" variant="ghost" onPress={() => galleryRef.current?.click()}>
                <ImagePlus className="size-4" /> {student.photo_path ? 'Trocar foto' : 'Enviar foto'}
              </Button>
              {student.photo_path ? (
                <Button size="sm" variant="plain" onPress={remove}>
                  <Trash2 className="size-4" /> Remover
                </Button>
              ) : null}
            </div>
          )}
          <p className="mt-1.5 text-xs text-dim">
            {student.photo_path ? 'A foto também é o rosto de referência no reconhecimento facial.' : 'Foto de rosto, de frente: ajuda o reconhecimento facial desde a primeira foto da turma.'}
          </p>
        </div>
      ) : null}
    </div>
  )
}
