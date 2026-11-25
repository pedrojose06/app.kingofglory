'use client'

// Editor de enquadramento da foto do aluno: arrastar para posicionar, zoom (pinça, roda do mouse ou controle) e recorte
// quadrado. Ao abrir, procura o rosto na foto e já centraliza nele (até a pessoa mexer). Tudo no próprio aparelho.

import { analyzePhoto } from '@kog/face-kit'
import { Button } from '@kog/ui'
import { Minus, Plus } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent } from 'react'
import { Dialog } from '@/components/kit'

/** Lado da foto recortada que vai para o servidor. */
const OUTPUT = 800
/** Maior lado da foto carregada no editor (fotos de celular passam de 4000 px). */
const MAX_SIDE = 2000
const MAX_ZOOM = 5
/** Quanto do quadro o rosto ocupa ao centralizar sozinho. */
const FACE_SHARE = 0.45

interface View {
  /** Centro do recorte, em pixels da foto carregada. */
  cx: number
  cy: number
  zoom: number
}

interface Loaded {
  canvas: HTMLCanvasElement
  url: string
  w: number
  h: number
}

/** Foto na orientação certa (EXIF da câmera), reduzida a MAX_SIDE. */
async function load(file: Blob): Promise<Loaded> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  const k = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * k)
  canvas.height = Math.round(bitmap.height * k)
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92))
  if (!blob) throw new Error('Este navegador não consegue ler a foto')
  return { canvas, url: URL.createObjectURL(blob), w: canvas.width, h: canvas.height }
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))

/** Mantém o recorte dentro da foto. */
function fit(view: View, img: { w: number; h: number }): View {
  const zoom = clamp(view.zoom, 1, MAX_ZOOM)
  const half = Math.min(img.w, img.h) / zoom / 2
  return { zoom, cx: clamp(view.cx, half, img.w - half), cy: clamp(view.cy, half, img.h - half) }
}

/**
 * Rosto achado na foto, em pixels da foto carregada. analyzePhoto usa uma moldura (pad) e outra escala, então a caixa
 * é convertida de volta para a foto. null se não achou.
 */
async function findFace(file: Blob, img: { w: number; h: number }) {
  const pad = 1.5
  const { faces, width, height } = await analyzePhoto(file, undefined, { pad })
  const face = [...faces].sort((a, b) => b.box.w * b.box.h - a.box.w * a.box.h)[0]
  if (!face) return null
  const innerW = width / pad
  const innerH = height / pad
  const k = img.w / innerW
  return {
    x: (face.box.x - (width - innerW) / 2) * k,
    y: (face.box.y - (height - innerH) / 2) * (img.h / innerH),
    w: face.box.w * k,
    h: face.box.h * (img.h / innerH),
  }
}

export function PhotoCropDialog({ file, onCancel, onConfirm }: { file: File; onCancel: () => void; onConfirm: (photo: Blob) => void }) {
  const [img, setImg] = useState<Loaded | null>(null)
  const [view, setView] = useState<View | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [centering, setCentering] = useState(true)
  const [frame, setFrame] = useState(0)
  const frameRef = useRef<HTMLDivElement>(null)
  const touched = useRef(false)
  const pointers = useRef(new Map<number, { x: number; y: number }>())

  // Carrega a foto e, em seguida, procura o rosto para centralizar.
  useEffect(() => {
    let alive = true
    let url: string | null = null
    load(file)
      .then(async (loaded) => {
        url = loaded.url
        if (!alive) return URL.revokeObjectURL(loaded.url)
        setImg(loaded)
        setView({ cx: loaded.w / 2, cy: loaded.h / 2, zoom: 1 })
        try {
          const face = await findFace(file, loaded)
          if (!alive || !face || touched.current) return
          const side = Math.max(face.w, face.h) / FACE_SHARE
          setView(fit({ cx: face.x + face.w / 2, cy: face.y + face.h / 2, zoom: Math.min(loaded.w, loaded.h) / side }, loaded))
        } catch {
          // sem rosto ou sem o reconhecimento: fica centralizado na foto
        } finally {
          if (alive) setCentering(false)
        }
      })
      .catch((e: unknown) => alive && setError((e as Error)?.message || 'Não foi possível abrir a foto'))
    return () => {
      alive = false
      if (url) URL.revokeObjectURL(url)
    }
  }, [file])

  // Tamanho do quadro na tela (muda com a largura do aparelho).
  useEffect(() => {
    const el = frameRef.current
    if (!el) return
    const observer = new ResizeObserver(() => setFrame(el.clientWidth))
    observer.observe(el)
    setFrame(el.clientWidth)
    return () => observer.disconnect()
  }, [img])

  const scale = img && view && frame ? (frame * view.zoom) / Math.min(img.w, img.h) : 0

  const update = useCallback(
    (fn: (v: View) => View) => {
      if (!img) return
      touched.current = true
      setView((v) => (v ? fit(fn(v), img) : v))
    },
    [img],
  )

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId)
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
  }

  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const prev = pointers.current.get(e.pointerId)
    if (!prev || !scale) return
    const others = [...pointers.current.entries()].filter(([id]) => id !== e.pointerId).map(([, p]) => p)
    const next = { x: e.clientX, y: e.clientY }
    pointers.current.set(e.pointerId, next)
    const other = others[0]
    if (other) {
      // Pinça: a distância entre os dedos muda o zoom.
      const before = Math.hypot(prev.x - other.x, prev.y - other.y)
      const after = Math.hypot(next.x - other.x, next.y - other.y)
      if (before > 0) update((v) => ({ ...v, zoom: v.zoom * (after / before) }))
    } else {
      // Arrastar a foto: o recorte anda para o lado contrário.
      update((v) => ({ ...v, cx: v.cx - (next.x - prev.x) / scale, cy: v.cy - (next.y - prev.y) / scale }))
    }
  }

  function onPointerUp(e: ReactPointerEvent<HTMLDivElement>) {
    pointers.current.delete(e.pointerId)
  }

  function onWheel(e: WheelEvent<HTMLDivElement>) {
    update((v) => ({ ...v, zoom: v.zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1) }))
  }

  async function confirm() {
    if (!img || !view) return
    const side = Math.min(img.w, img.h) / view.zoom
    const out = document.createElement('canvas')
    out.width = out.height = Math.min(OUTPUT, Math.round(side))
    out.getContext('2d')!.drawImage(img.canvas, view.cx - side / 2, view.cy - side / 2, side, side, 0, 0, out.width, out.height)
    const blob = await new Promise<Blob | null>((resolve) => out.toBlob(resolve, 'image/jpeg', 0.88))
    if (blob) onConfirm(blob)
    else setError('Não foi possível recortar a foto')
  }

  return (
    <Dialog
      open
      onClose={onCancel}
      title="Enquadrar a foto"
      footer={
        <>
          <Button variant="plain" onPress={onCancel}>Cancelar</Button>
          <Button disabled={!img} onPress={confirm}>Usar foto</Button>
        </>
      }
    >
      {error ? (
        <p className="text-sm text-danger">{error}</p>
      ) : (
        <div className="mx-auto w-full max-w-80">
          <div
            ref={frameRef}
            className="relative aspect-square w-full touch-none select-none overflow-hidden rounded-lg bg-black"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onWheel={onWheel}
          >
            {img && view && scale ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={img.url}
                alt="Foto do aluno"
                draggable={false}
                className="pointer-events-none absolute top-0 left-0 max-w-none"
                style={{
                  width: img.w * scale,
                  height: img.h * scale,
                  transform: `translate(${frame / 2 - view.cx * scale}px, ${frame / 2 - view.cy * scale}px)`,
                }}
              />
            ) : null}
            {/* Guia: o rosto dentro do círculo. */}
            <div className="pointer-events-none absolute inset-[12%] rounded-full border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
          </div>
          <div className="mt-3 flex items-center gap-3">
            <button type="button" aria-label="Diminuir zoom" className="text-dim" onClick={() => update((v) => ({ ...v, zoom: v.zoom / 1.2 }))}>
              <Minus className="size-4" />
            </button>
            <input
              type="range"
              aria-label="Zoom"
              min={1}
              max={MAX_ZOOM}
              step={0.01}
              value={view?.zoom ?? 1}
              onChange={(e) => update((v) => ({ ...v, zoom: Number(e.target.value) }))}
              className="flex-1 accent-[var(--kog-gold)]"
            />
            <button type="button" aria-label="Aumentar zoom" className="text-dim" onClick={() => update((v) => ({ ...v, zoom: v.zoom * 1.2 }))}>
              <Plus className="size-4" />
            </button>
          </div>
          <p className="mt-2 text-center text-xs text-dim">
            {!img ? 'Abrindo a foto…' : centering && !touched.current ? 'Procurando o rosto para centralizar…' : 'Arraste e use o zoom para deixar o rosto dentro do círculo.'}
          </p>
        </div>
      )}
    </Dialog>
  )
}
