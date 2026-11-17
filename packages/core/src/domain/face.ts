// Reconhecimento facial: tudo puro (sem DOM, sem rede, sem runtime de ML).
// O app roda os modelos (YuNet para detectar, SFace para o vetor do rosto) e usa estas funções para
// preparar as entradas, decodificar as saídas, comparar vetores e decidir o que sugerir ao professor.
// Nada aqui decide presença sozinho: a sugestão sempre passa pela confirmação do professor.

/** Identifica o modelo dos vetores salvos; vetores de modelos diferentes não se comparam. */
export const FACE_MODEL = 'sface-2021dec'
export const EMBEDDING_DIM = 128
/** Lado da entrada do YuNet (o ONNX tem forma fixa 640×640). */
export const DETECT_SIZE = 640
/** Lado do rosto alinhado que o SFace recebe. */
export const ALIGNED_SIZE = 112
/** Referências guardadas por aluno (o banco poda as mais antigas). */
export const MAX_REFS_PER_STUDENT = 20

export interface Point {
  x: number
  y: number
}
export interface Box {
  x: number
  y: number
  w: number
  h: number
}
export interface Detection {
  box: Box
  /** 5 pontos: olho e canto da boca à esquerda e à direita (na imagem) e ponta do nariz. */
  landmarks: Point[]
  score: number
}
/** Pixels RGBA (como ImageData). */
export interface RgbaImage {
  data: Uint8ClampedArray | Uint8Array
  width: number
  height: number
}

// ── Detecção ────────────────────────────────────────────────────────────────────

/** Região da foto (em pixels da foto) que vai, redimensionada, para um quadro DETECT_SIZE × DETECT_SIZE. */
export interface Region extends Box {
  /** DETECT_SIZE / max(w, h): quanto a região é ampliada/reduzida para caber no quadro. */
  scale: number
}

/**
 * Regiões em que o detector roda. Uma passada com a foto inteira (rostos grandes) e, em foto grande,
 * blocos sobrepostos em resolução maior para achar rostos pequenos do fundo da turma.
 */
export function planDetectionRegions(width: number, height: number, overlap = 0.25): Region[] {
  const long = Math.max(width, height)
  const regions: Region[] = [{ x: 0, y: 0, w: long, h: long, scale: DETECT_SIZE / long }]
  if (long <= DETECT_SIZE * 1.25) return regions
  // Bloco com ~1/3 do lado maior, nunca menor que o quadro (não amplia a foto).
  const side = Math.max(DETECT_SIZE, Math.round(long / 3))
  const step = Math.round(side * (1 - overlap))
  const starts = (total: number) => {
    if (total <= side) return [0]
    const out: number[] = []
    for (let s = 0; s + side < total; s += step) out.push(s)
    out.push(total - side)
    return [...new Set(out)]
  }
  for (const y of starts(height)) {
    for (const x of starts(width)) {
      regions.push({ x, y, w: Math.min(side, width - x), h: Math.min(side, height - y), scale: DETECT_SIZE / side })
    }
  }
  return regions
}

/**
 * Recorta e redimensiona (bilinear) uma região da foto para um quadro quadrado `size`, completando com preto.
 * Devolve RGBA. Usado para montar a entrada do detector.
 */
export function resampleRegion(img: RgbaImage, region: Region, size = DETECT_SIZE): Uint8ClampedArray {
  const out = new Uint8ClampedArray(size * size * 4)
  const inv = 1 / region.scale
  const outW = Math.min(size, Math.ceil(region.w * region.scale))
  const outH = Math.min(size, Math.ceil(region.h * region.scale))
  for (let v = 0; v < outH; v++) {
    const sy = region.y + (v + 0.5) * inv - 0.5
    for (let u = 0; u < outW; u++) {
      const sx = region.x + (u + 0.5) * inv - 0.5
      sampleBilinear(img, sx, sy, out, (v * size + u) * 4)
    }
  }
  for (let i = 3; i < out.length; i += 4) out[i] = 255
  return out
}

/** Amostra bilinear (borda repetida); ponto fora da foto fica preto. */
function sampleBilinear(img: RgbaImage, x: number, y: number, out: Uint8ClampedArray | Float32Array, o: number) {
  const { data, width, height } = img
  if (x < -0.5 || y < -0.5 || x > width - 0.5 || y > height - 0.5) {
    out[o] = out[o + 1] = out[o + 2] = 0
    return
  }
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  const fx = x - x0
  const fy = y - y0
  const xa = Math.min(width - 1, Math.max(0, x0))
  const xb = Math.min(width - 1, Math.max(0, x0 + 1))
  const ya = Math.min(height - 1, Math.max(0, y0))
  const yb = Math.min(height - 1, Math.max(0, y0 + 1))
  const p00 = (ya * width + xa) * 4, p01 = (ya * width + xb) * 4
  const p10 = (yb * width + xa) * 4, p11 = (yb * width + xb) * 4
  for (let c = 0; c < 3; c++) {
    const top = (data[p00 + c] ?? 0) * (1 - fx) + (data[p01 + c] ?? 0) * fx
    const bottom = (data[p10 + c] ?? 0) * (1 - fx) + (data[p11 + c] ?? 0) * fx
    out[o + c] = top * (1 - fy) + bottom * fy
  }
}

/** Entrada do YuNet: NCHW, BGR, 0–255, a partir de um quadro RGBA DETECT_SIZE × DETECT_SIZE. */
export function toDetectorTensor(rgba: Uint8ClampedArray, size = DETECT_SIZE): Float32Array {
  const plane = size * size
  const t = new Float32Array(3 * plane)
  for (let i = 0; i < plane; i++) {
    t[i] = rgba[i * 4 + 2] ?? 0
    t[plane + i] = rgba[i * 4 + 1] ?? 0
    t[2 * plane + i] = rgba[i * 4] ?? 0
  }
  return t
}

/** Saídas do YuNet por passo (8, 16, 32): cls, obj, bbox (4) e kps (10) por âncora. */
export type DetectorOutputs = Record<string, Float32Array | ArrayLike<number>>

const STRIDES = [8, 16, 32] as const

/** Decodifica as saídas do YuNet 2023mar (coordenadas no quadro DETECT_SIZE). */
export function decodeDetections(outputs: DetectorOutputs, minScore = 0.7, size = DETECT_SIZE): Detection[] {
  const out: Detection[] = []
  for (const s of STRIDES) {
    const cls = outputs[`cls_${s}`]
    const obj = outputs[`obj_${s}`]
    const bbox = outputs[`bbox_${s}`]
    const kps = outputs[`kps_${s}`]
    if (!cls || !obj || !bbox || !kps) continue
    const cols = size / s
    const rows = size / s
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c
        const score = Math.sqrt(clamp01(cls[i] ?? 0) * clamp01(obj[i] ?? 0))
        if (score < minScore) continue
        const cx = (c + (bbox[i * 4] ?? 0)) * s
        const cy = (r + (bbox[i * 4 + 1] ?? 0)) * s
        const w = Math.exp(bbox[i * 4 + 2] ?? 0) * s
        const h = Math.exp(bbox[i * 4 + 3] ?? 0) * s
        const landmarks: Point[] = []
        for (let n = 0; n < 5; n++) {
          landmarks.push({ x: ((kps[i * 10 + 2 * n] ?? 0) + c) * s, y: ((kps[i * 10 + 2 * n + 1] ?? 0) + r) * s })
        }
        out.push({ box: { x: cx - w / 2, y: cy - h / 2, w, h }, landmarks, score })
      }
    }
  }
  return out
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

/** Leva detecções do quadro de uma região para coordenadas da foto. */
export function toPhotoCoords(dets: readonly Detection[], region: Region): Detection[] {
  const k = 1 / region.scale
  const map = (p: Point): Point => ({ x: region.x + p.x * k, y: region.y + p.y * k })
  return dets.map((d) => ({
    score: d.score,
    box: { x: region.x + d.box.x * k, y: region.y + d.box.y * k, w: d.box.w * k, h: d.box.h * k },
    landmarks: d.landmarks.map(map),
  }))
}

export function iou(a: Box, b: Box): number {
  const inter = intersection(a, b)
  return inter / (a.w * a.h + b.w * b.h - inter || 1)
}

function intersection(a: Box, b: Box): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
  return w > 0 && h > 0 ? w * h : 0
}

/**
 * Supressão de duplicatas: entre caixas que se sobrepõem (IoU alto, ou uma quase toda dentro da outra, como um
 * rosto cortado na borda de um bloco), fica a de maior nota.
 */
export function nonMaxSuppression(dets: readonly Detection[], maxIou = 0.3, maxContain = 0.6): Detection[] {
  const sorted = [...dets].sort((a, b) => b.score - a.score)
  const keep: Detection[] = []
  for (const d of sorted) {
    const dup = keep.some((k) => {
      if (iou(k.box, d.box) > maxIou) return true
      const inter = intersection(k.box, d.box)
      return inter / Math.min(k.box.w * k.box.h, d.box.w * d.box.h) > maxContain
    })
    if (!dup) keep.push(d)
  }
  return keep
}

/** Rostos finais da foto: mínimos de tamanho, sem duplicatas, da esquerda para a direita (ordem de leitura da turma). */
export function finalizeDetections(dets: readonly Detection[], minSide = 24): Detection[] {
  return nonMaxSuppression(dets.filter((d) => Math.min(d.box.w, d.box.h) >= minSide)).sort(
    (a, b) => a.box.x + a.box.w / 2 - (b.box.x + b.box.w / 2),
  )
}

// ── Alinhamento e vetor do rosto ─────────────────────────────────────────────────

/** Posição padrão dos 5 pontos no rosto alinhado 112×112 (mesma do OpenCV/ArcFace). */
export const ALIGNED_LANDMARKS: readonly Point[] = [
  { x: 38.2946, y: 51.6963 },
  { x: 73.5318, y: 51.5014 },
  { x: 56.0252, y: 71.7366 },
  { x: 41.5493, y: 92.3655 },
  { x: 70.7299, y: 92.2041 },
]

/** Transformação de similaridade (rotação + escala + translação): x' = a·x − b·y + tx; y' = b·x + a·y + ty. */
export interface Similarity {
  a: number
  b: number
  tx: number
  ty: number
}

/** Mínimos quadrados da similaridade que leva `src` em `dst` (pontos correspondentes). */
export function estimateSimilarity(src: readonly Point[], dst: readonly Point[]): Similarity {
  const n = Math.min(src.length, dst.length)
  let sx = 0, sy = 0, dx = 0, dy = 0
  for (let i = 0; i < n; i++) {
    sx += src[i]!.x; sy += src[i]!.y; dx += dst[i]!.x; dy += dst[i]!.y
  }
  sx /= n; sy /= n; dx /= n; dy /= n
  let num1 = 0, num2 = 0, den = 0
  for (let i = 0; i < n; i++) {
    const xs = src[i]!.x - sx, ys = src[i]!.y - sy
    const xd = dst[i]!.x - dx, yd = dst[i]!.y - dy
    num1 += xs * xd + ys * yd
    num2 += xs * yd - ys * xd
    den += xs * xs + ys * ys
  }
  const a = den ? num1 / den : 1
  const b = den ? num2 / den : 0
  return { a, b, tx: dx - (a * sx - b * sy), ty: dy - (b * sx + a * sy) }
}

export const applySimilarity = (m: Similarity, p: Point): Point => ({ x: m.a * p.x - m.b * p.y + m.tx, y: m.b * p.x + m.a * p.y + m.ty })

/** Rosto alinhado: RGBA ALIGNED_SIZE² a partir da foto e dos 5 pontos do rosto. */
export function alignFace(img: RgbaImage, landmarks: readonly Point[], size = ALIGNED_SIZE): Uint8ClampedArray {
  const m = estimateSimilarity(landmarks, ALIGNED_LANDMARKS)
  const k = 1 / (m.a * m.a + m.b * m.b)
  const out = new Uint8ClampedArray(size * size * 4)
  for (let v = 0; v < size; v++) {
    for (let u = 0; u < size; u++) {
      // Inversa da similaridade: do pixel do rosto alinhado para a foto.
      const px = u - m.tx
      const py = v - m.ty
      const x = k * (m.a * px + m.b * py)
      const y = k * (-m.b * px + m.a * py)
      sampleBilinear(img, x, y, out, (v * size + u) * 4)
      out[(v * size + u) * 4 + 3] = 255
    }
  }
  return out
}

/** Entrada do SFace: NCHW, RGB, 0–255. */
export function toEmbedderTensor(rgba: Uint8ClampedArray, size = ALIGNED_SIZE): Float32Array {
  const plane = size * size
  const t = new Float32Array(3 * plane)
  for (let i = 0; i < plane; i++) {
    t[i] = rgba[i * 4] ?? 0
    t[plane + i] = rgba[i * 4 + 1] ?? 0
    t[2 * plane + i] = rgba[i * 4 + 2] ?? 0
  }
  return t
}

// ── Comparação ──────────────────────────────────────────────────────────────────

export function normalize(v: ArrayLike<number>): number[] {
  let s = 0
  for (let i = 0; i < v.length; i++) s += (v[i] ?? 0) ** 2
  const n = Math.sqrt(s) || 1
  return Array.from(v, (x) => x / n)
}

/** Cosseno entre dois vetores (não precisam estar normalizados). */
export function cosine(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let dot = 0, na = 0, nb = 0
  const n = Math.min(a.length, b.length)
  for (let i = 0; i < n; i++) {
    const x = a[i] ?? 0, y = b[i] ?? 0
    dot += x * y; na += x * x; nb += y * y
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0
}

/** pgvector em texto ("[0.1,0.2]") para números. */
export function parseVector(text: string): number[] {
  const body = text.trim().replace(/^\[/, '').replace(/\]$/, '')
  return body ? body.split(',').map(Number) : []
}

/**
 * Cosseno do SFace para a confiança mostrada ao professor (0–1). Curva monótona calibrada no limiar do
 * SFace (0,363 = mesma pessoa no LFW), que fica em ~55%. Valores abaixo de ~0,2 são outra pessoa.
 */
const CONFIDENCE_CURVE: readonly (readonly [number, number])[] = [
  [0.15, 0],
  [0.25, 0.25],
  [0.363, 0.55],
  [0.45, 0.75],
  [0.55, 0.9],
  [0.7, 0.98],
  [1, 0.995],
]
export function confidenceFromCosine(c: number): number {
  const first = CONFIDENCE_CURVE[0]!
  if (c <= first[0]) return 0
  for (let i = 1; i < CONFIDENCE_CURVE.length; i++) {
    const [x1, y1] = CONFIDENCE_CURVE[i]!
    const [x0, y0] = CONFIDENCE_CURVE[i - 1]!
    if (c <= x1) return y0 + ((c - x0) / (x1 - x0)) * (y1 - y0)
  }
  return CONFIDENCE_CURVE[CONFIDENCE_CURVE.length - 1]![1]
}

/** Abaixo disto o app não sugere ninguém: pergunta "Quem é?". */
export const SUGGEST_MIN_CONFIDENCE = 0.45

export interface FaceReference {
  student_id: string
  vector: ArrayLike<number>
}

export interface StudentScore {
  student_id: string
  cosine: number
  confidence: number
}

/**
 * Nota de cada aluno para um rosto: média dos k cossenos mais altos entre as referências dele
 * (uma referência ruim isolada não derruba e uma coincidência isolada pesa menos quando há várias).
 */
export function scoreStudents(query: ArrayLike<number>, refs: readonly FaceReference[], k = 3): StudentScore[] {
  const byStudent = new Map<string, number[]>()
  for (const r of refs) {
    const list = byStudent.get(r.student_id) ?? []
    list.push(cosine(query, r.vector))
    byStudent.set(r.student_id, list)
  }
  const out: StudentScore[] = []
  for (const [student_id, sims] of byStudent) {
    sims.sort((a, b) => b - a)
    const top = sims.slice(0, k)
    const c = top.reduce((s, x) => s + x, 0) / top.length
    out.push({ student_id, cosine: c, confidence: confidenceFromCosine(c) })
  }
  return out.sort((a, b) => b.cosine - a.cosine)
}

export interface FaceSuggestion {
  /** Aluno sugerido (null = sem sugestão: perguntar "Quem é?"). */
  student_id: string | null
  confidence: number
  /** Outros candidatos, do mais provável ao menos (para "É outro aluno"). */
  alternatives: StudentScore[]
}

/**
 * Sugestões para todos os rostos de uma foto. Cada aluno é sugerido para no máximo um rosto: os pares
 * (rosto, aluno) são atribuídos do mais confiável para o menos.
 */
export function suggestForFaces(
  faces: readonly ArrayLike<number>[],
  refs: readonly FaceReference[],
  opts: { minConfidence?: number; alternatives?: number } = {},
): FaceSuggestion[] {
  const min = opts.minConfidence ?? SUGGEST_MIN_CONFIDENCE
  const ranked = faces.map((f) => scoreStudents(f, refs))
  const pairs: { face: number; s: StudentScore }[] = []
  ranked.forEach((list, face) => list.forEach((s) => s.confidence >= min && pairs.push({ face, s })))
  pairs.sort((a, b) => b.s.cosine - a.s.cosine)
  const chosen = new Map<number, StudentScore>()
  const used = new Set<string>()
  for (const { face, s } of pairs) {
    if (chosen.has(face) || used.has(s.student_id)) continue
    chosen.set(face, s)
    used.add(s.student_id)
  }
  return ranked.map((list, face) => {
    const pick = chosen.get(face)
    return {
      student_id: pick?.student_id ?? null,
      confidence: pick?.confidence ?? list[0]?.confidence ?? 0,
      alternatives: list.filter((s) => s.student_id !== pick?.student_id).slice(0, opts.alternatives ?? 5),
    }
  })
}

// ── Decisões do professor ───────────────────────────────────────────────────────

export type FaceDecisionKind = 'confirmed' | 'corrected' | 'ignored' | 'auto'

/** Acima disto o vetor novo é praticamente igual a uma referência que o aluno já tem: não acrescenta nada. */
export const REDUNDANT_COSINE = 0.9

/**
 * O rosto confirmado vira referência do aluno? Correções sempre viram (é justamente o caso que o app errou);
 * confirmações só se trouxerem algo novo (outro ângulo, luz, expressão).
 */
export function shouldAddReference(
  vector: ArrayLike<number>,
  existing: readonly ArrayLike<number>[],
  decision: FaceDecisionKind,
): boolean {
  if (decision === 'ignored') return false
  if (decision === 'corrected' || existing.length === 0) return true
  return !existing.some((e) => cosine(vector, e) >= REDUNDANT_COSINE)
}

/**
 * Futuro "aprovar automaticamente acima de X%": desligado enquanto o professor não tiver um limite
 * (profiles.face_auto_approve_min = null, sem tela por enquanto).
 */
export function shouldAutoApprove(confidence: number, minConfidence: number | null | undefined): boolean {
  return minConfidence != null && minConfidence >= 0.5 && confidence >= minConfidence
}

/** "87%" */
export const formatConfidence = (c: number) => `${Math.round(c * 100)}%`
