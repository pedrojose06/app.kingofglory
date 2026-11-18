'use client'

import { Button, cn } from '@kog/ui'
import { Camera, ImageUp, UserRound } from 'lucide-react'
import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { toastError } from '@/lib/toast'

/** Reduz a foto de rosto: ~800px e até ~200 KB bastam para o professor reconhecer o aluno. */
export async function compressFace(file: File): Promise<Blob> {
  const { default: compress } = await import('browser-image-compression')
  return compress(file, { maxWidthOrHeight: 800, maxSizeMB: 0.2, fileType: 'image/jpeg', useWebWorker: true })
}

// Cadastro com confirmação por e-mail não tem sessão para enviar a foto: ela fica guardada no aparelho e sobe
// sozinha no primeiro acesso (área do aluno). Em outro aparelho o aluno tira de novo lá.
const KEY = 'kog-pending-face'

export async function storePendingFace(blob: Blob | null): Promise<void> {
  try {
    if (!blob) return window.localStorage.removeItem(KEY)
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = () => reject(reader.error)
      reader.readAsDataURL(blob)
    })
    window.localStorage.setItem(KEY, dataUrl)
  } catch {
    // Sem storage: o aluno envia a foto na área do aluno.
  }
}

export async function getPendingFace(): Promise<Blob | null> {
  try {
    const dataUrl = window.localStorage.getItem(KEY)
    return dataUrl ? await (await fetch(dataUrl)).blob() : null
  } catch {
    return null
  }
}

/** Campo da foto de rosto: câmera frontal ou galeria, com prévia. */
export function FacePhotoField({ value, onChange, invalid }: { value: Blob | null; onChange: (blob: Blob | null) => void; invalid?: boolean }) {
  const cameraRef = useRef<HTMLInputElement>(null)
  const galleryRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [url, setUrl] = useState<string>()

  useEffect(() => {
    if (!value) return setUrl(undefined)
    const objectUrl = URL.createObjectURL(value)
    setUrl(objectUrl)
    return () => URL.revokeObjectURL(objectUrl)
  }, [value])

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) return toastError(new Error('Escolha uma imagem.'))
    setBusy(true)
    try {
      onChange(await compressFace(file))
    } catch (error) {
      toastError(error)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex items-center gap-4">
      <input ref={cameraRef} type="file" accept="image/*" capture="user" hidden onChange={onFile} />
      <input ref={galleryRef} type="file" accept="image/*" hidden onChange={onFile} />
      <div className={cn('flex size-24 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 bg-surface-2', invalid ? 'border-danger' : value ? 'border-success' : 'border-line')}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {url ? <img src={url} alt="Sua foto" className="size-full object-cover" /> : <UserRound className="size-10 text-faint" />}
      </div>
      <div className="min-w-0 flex-1 space-y-2">
        <Button block size="sm" loading={busy} onPress={() => cameraRef.current?.click()}>
          <Camera className="size-4" /> {value ? 'Tirar outra' : 'Tirar foto'}
        </Button>
        <Button block size="sm" variant="ghost" disabled={busy} onPress={() => galleryRef.current?.click()}>
          <ImageUp className="size-4" /> Galeria
        </Button>
      </div>
    </div>
  )
}
