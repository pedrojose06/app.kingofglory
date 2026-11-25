import type { Detection } from '@kog/core'

export interface FaceAssets {
  ortBase: string
  detector: string
  embedder: string
  /** Soma aproximada dos dois modelos, para a barra de progresso do primeiro download. */
  totalBytes: number
}

export type WorkerRequest =
  | { id: number; type: 'warmup'; assets: FaceAssets }
  | { id: number; type: 'analyze'; assets: FaceAssets; image: { data: ArrayBuffer; width: number; height: number } }

export interface AnalyzedFace extends Detection {
  /** Vetor do SFace, normalizado. */
  embedding: number[]
}

export type WorkerResponse =
  | { id: number; type: 'progress'; stage: 'download' | 'detect' | 'embed'; done: number; total: number }
  | { id: number; type: 'ready' }
  | { id: number; type: 'result'; faces: AnalyzedFace[] }
  | { id: number; type: 'error'; message: string }
