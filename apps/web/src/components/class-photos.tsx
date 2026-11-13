'use client'

import { deleteClassPhoto, keys, signPhotoUrls, type ClassPhoto, type ClassRow } from '@kog/core'
import { Button, EmptyState, Sheet, Spinner } from '@kog/ui'
import { useQuery } from '@tanstack/react-query'
import { Camera, Images } from 'lucide-react'
import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { outbox, useOutbox } from '@/lib/outbox'
import { useClassPhotos, useSave } from '@/lib/queries'
import { db } from '@/lib/supabase'
import { toastError } from '@/lib/toast'

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

  async function onFiles(e: ChangeEvent<HTMLInputElement>) {
    const files = [...(e.target.files ?? [])]
    e.target.value = ''
    if (files.length === 0) return
    setBusy(true)
    try {
      const { default: compress } = await import('browser-image-compression')
      for (const file of files) {
        // ~1600px e até ~500 KB: nítido para ver a turma e leve para o 4G da academia.
        const small = await compress(file, { maxWidthOrHeight: 1600, maxSizeMB: 0.5, fileType: 'image/jpeg', useWebWorker: true })
        await outbox.addPhoto({ id: crypto.randomUUID(), gym_id: klass.gym_id, class_id: klass.id, taken_at: new Date().toISOString() }, small)
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
