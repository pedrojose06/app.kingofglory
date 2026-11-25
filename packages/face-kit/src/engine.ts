'use client'

// Lado da tela do reconhecimento facial: decodifica a foto, conversa com o worker e recorta os rostos para a revisão.
// Os recortes ficam só em memória (URLs de blob): nada de cópia extra da foto no aparelho ou no banco.

import type { Box } from '@kog/core'
import { ORT_VERSION } from './assets'
import type { AnalyzedFace, FaceAssets, WorkerRequest, WorkerResponse } from './protocol'

export const FACE_ASSETS: FaceAssets = {
  ortBase: `/ort/${ORT_VERSION}/`,
  detector: '/models/yunet-2023mar.onnx',
  embedder: '/models/sface-2021dec-int8.onnx',
  totalBytes: 232_589 + 9_896_933,
}
const ALL_ASSETS = [FACE_ASSETS.detector, FACE_ASSETS.embedder, `${FACE_ASSETS.ortBase}ort-wasm-simd-threaded.wasm`]

/** Lado maior da foto analisada: rostos pequenos do fundo ainda aparecem, sem estourar a memória do celular. */
const MAX_SIDE = 2560

export type FaceProgress = { stage: 'download' | 'detect' | 'embed' | 'signup'; done: number; total: number }

/** Os modelos já estão guardados no aparelho (dá para reconhecer offline)? */
export async function faceModelsCached(): Promise<boolean> {
  if (typeof caches === 'undefined') return false
  const hits = await Promise.all(ALL_ASSETS.map((u) => caches.match(u).catch(() => undefined)))
  return hits.every(Boolean)
}

let worker: Worker | undefined
let seq = 0
const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void; onProgress?: (p: FaceProgress) => void }>()

function getWorker(): Worker {
  if (worker) return worker
  worker = new Worker(new URL('./face.worker.ts', import.meta.url), { type: 'module' })
  worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
    const msg = e.data
    const p = pending.get(msg.id)
    if (!p) return
    if (msg.type === 'progress') return p.onProgress?.({ stage: msg.stage, done: msg.done, total: msg.total })
    pending.delete(msg.id)
    if (msg.type === 'error') p.reject(new Error(msg.message))
    else p.resolve(msg.type === 'result' ? msg.faces : undefined)
  }
  worker.onerror = (e) => {
    for (const p of pending.values()) p.reject(new Error(e.message || 'Falha no reconhecimento facial'))
    pending.clear()
    worker?.terminate()
    worker = undefined
  }
  return worker
}

type NewRequest = WorkerRequest extends infer R ? (R extends WorkerRequest ? Omit<R, 'id'> : never) : never

function call<T>(req: NewRequest, onProgress?: (p: FaceProgress) => void, transfer: Transferable[] = []): Promise<T> {
  const id = ++seq
  return new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve: resolve as (v: unknown) => void, reject, onProgress })
    getWorker().postMessage({ ...req, id }, transfer)
  })
}

/** Baixa e prepara os modelos (opcional: o primeiro analyze faz isso sozinho). */
export const warmUpFaceModels = (onProgress?: (p: FaceProgress) => void) => call<void>({ type: 'warmup', assets: FACE_ASSETS }, onProgress)

export interface AnalyzedPhoto {
  faces: AnalyzedFace[]
  width: number
  height: number
  /** Foto decodificada (para recortar os rostos). */
  canvas: HTMLCanvasElement
}

/**
 * Decodifica a foto (respeitando a orientação da câmera), reduzida a MAX_SIDE. `pad` > 1 centraliza a foto numa
 * moldura preta maior: numa selfie o rosto ocupa a foto toda e o detector acha melhor com folga em volta.
 */
async function decode(file: Blob, pad = 1): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  const k = Math.min(1, MAX_SIDE / (Math.max(bitmap.width, bitmap.height) * pad))
  const w = Math.round(bitmap.width * k)
  const h = Math.round(bitmap.height * k)
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(w * pad)
  canvas.height = Math.round(h * pad)
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('Este navegador não consegue ler a foto')
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(bitmap, Math.round((canvas.width - w) / 2), Math.round((canvas.height - h) / 2), w, h)
  bitmap.close()
  return canvas
}

export async function analyzePhoto(file: Blob, onProgress?: (p: FaceProgress) => void, opts: { pad?: number } = {}): Promise<AnalyzedPhoto> {
  const canvas = await decode(file, opts.pad)
  const { width, height } = canvas
  const pixels = canvas.getContext('2d')!.getImageData(0, 0, width, height)
  const buffer = pixels.data.buffer as ArrayBuffer
  const faces = await call<AnalyzedFace[]>(
    { type: 'analyze', assets: FACE_ASSETS, image: { data: buffer, width, height } },
    onProgress,
    [buffer],
  )
  return { faces, width, height, canvas }
}

/** Caixa normalizada (0..1), o que vai para o banco. */
export const normalizeBox = (box: Box, width: number, height: number) => ({
  x: round4(box.x / width),
  y: round4(box.y / height),
  w: round4(box.w / width),
  h: round4(box.h / height),
})
const round4 = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 10_000) / 10_000

/** Recorte quadrado do rosto com margem, como URL de blob (revogar depois de usar). */
export async function cropFace(canvas: HTMLCanvasElement, box: Box, size = 192): Promise<string> {
  const side = Math.max(box.w, box.h) * 1.6
  const cx = box.x + box.w / 2
  const cy = box.y + box.h / 2
  const out = document.createElement('canvas')
  out.width = out.height = size
  const ctx = out.getContext('2d')!
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, size, size)
  ctx.drawImage(canvas, cx - side / 2, cy - side / 2, side, side, 0, 0, size, size)
  const blob = await new Promise<Blob | null>((r) => out.toBlob(r, 'image/jpeg', 0.85))
  return blob ? URL.createObjectURL(blob) : out.toDataURL('image/jpeg', 0.85)
}
