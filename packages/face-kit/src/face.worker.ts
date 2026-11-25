// Web Worker do reconhecimento facial: roda os modelos ONNX (onnxruntime-web, WASM) fora da thread da tela.
// Recebe os pixels da foto e devolve os rostos (caixa, 5 pontos, nota) com o vetor de cada um.
// A foto não sai do aparelho.

import {
  DETECT_SIZE, ALIGNED_SIZE, alignFace, decodeDetections, finalizeDetections, normalize, planDetectionRegions, resampleRegion,
  toDetectorTensor, toEmbedderTensor, toPhotoCoords, type Detection, type RgbaImage,
} from '@kog/core'
import * as ort from 'onnxruntime-web/wasm'
import type { WorkerRequest, WorkerResponse } from './protocol'

type Scope = { postMessage(msg: WorkerResponse): void; onmessage: ((e: MessageEvent<WorkerRequest>) => void) | null }
const scope = self as unknown as Scope

let sessions: Promise<{ detector: ort.InferenceSession; embedder: ort.InferenceSession }> | undefined

async function download(url: string, onBytes: (n: number) => void): Promise<Uint8Array> {
  const res = await fetch(url)
  if (!res.ok || !res.body) throw new Error(`Não foi possível baixar ${url} (${res.status})`)
  const reader = res.body.getReader()
  const parts: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    parts.push(value)
    size += value.length
    onBytes(value.length)
  }
  const out = new Uint8Array(size)
  let o = 0
  for (const p of parts) {
    out.set(p, o)
    o += p.length
  }
  return out
}

function load(req: Extract<WorkerRequest, { type: 'analyze' | 'warmup' }>) {
  if (sessions) return sessions
  ort.env.wasm.wasmPaths = req.assets.ortBase
  // Sem cross-origin isolation não há threads; uma thread com SIMD já atende.
  ort.env.wasm.numThreads = 1
  ort.env.logLevel = 'error'
  const total = req.assets.totalBytes
  let loaded = 0
  const progress = (n: number) => {
    loaded += n
    scope.postMessage({ id: req.id, type: 'progress', stage: 'download', done: Math.min(loaded, total), total })
  }
  sessions = (async () => {
    const [det, emb] = await Promise.all([download(req.assets.detector, progress), download(req.assets.embedder, progress)])
    const opts: ort.InferenceSession.SessionOptions = { executionProviders: ['wasm'], graphOptimizationLevel: 'all', logSeverityLevel: 3 }
    const detector = await ort.InferenceSession.create(det, opts)
    const embedder = await ort.InferenceSession.create(emb, opts)
    return { detector, embedder }
  })()
  sessions.catch(() => {
    sessions = undefined
  })
  return sessions
}

async function analyze(req: Extract<WorkerRequest, { type: 'analyze' }>) {
  const { detector, embedder } = await load(req)
  const img: RgbaImage = { data: new Uint8ClampedArray(req.image.data), width: req.image.width, height: req.image.height }
  const regions = planDetectionRegions(img.width, img.height)
  const found: Detection[] = []
  for (const [i, region] of regions.entries()) {
    scope.postMessage({ id: req.id, type: 'progress', stage: 'detect', done: i, total: regions.length })
    const input = new ort.Tensor('float32', toDetectorTensor(resampleRegion(img, region)), [1, 3, DETECT_SIZE, DETECT_SIZE])
    const out = await detector.run({ [detector.inputNames[0]!]: input })
    const raw = Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v.data as Float32Array]))
    found.push(...toPhotoCoords(decodeDetections(raw), region))
  }
  const faces = finalizeDetections(found)
  const result = []
  for (const [i, face] of faces.entries()) {
    scope.postMessage({ id: req.id, type: 'progress', stage: 'embed', done: i, total: faces.length })
    const aligned = alignFace(img, face.landmarks)
    const input = new ort.Tensor('float32', toEmbedderTensor(aligned), [1, 3, ALIGNED_SIZE, ALIGNED_SIZE])
    const out = await embedder.run({ [embedder.inputNames[0]!]: input })
    const vec = out[embedder.outputNames[0]!]!.data as Float32Array
    result.push({ ...face, embedding: normalize(vec) })
  }
  scope.postMessage({ id: req.id, type: 'result', faces: result })
}

scope.onmessage = (e) => {
  const req = e.data
  const run = req.type === 'warmup' ? load(req).then(() => scope.postMessage({ id: req.id, type: 'ready' })) : analyze(req)
  run.catch((error: unknown) => scope.postMessage({ id: req.id, type: 'error', message: (error as Error)?.message ?? String(error) }))
}
