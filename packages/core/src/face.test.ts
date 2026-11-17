import { describe, expect, it } from 'vitest'
import {
  ALIGNED_LANDMARKS, DETECT_SIZE, alignFace, applySimilarity, confidenceFromCosine, cosine, decodeDetections, estimateSimilarity,
  finalizeDetections, formatConfidence, nonMaxSuppression, normalize, parseVector, planDetectionRegions, resampleRegion,
  scoreStudents, shouldAddReference, shouldAutoApprove, suggestForFaces, toDetectorTensor, toPhotoCoords, type Detection,
} from './domain/face'

const det = (x: number, y: number, w: number, h: number, score = 0.9): Detection => ({ box: { x, y, w, h }, landmarks: [], score })
/** Vetor unitário com ângulo `deg` no plano das duas primeiras coordenadas: cosseno entre eles = cos(diferença). */
const vec = (deg: number) => {
  const v = new Array(128).fill(0)
  v[0] = Math.cos((deg * Math.PI) / 180)
  v[1] = Math.sin((deg * Math.PI) / 180)
  return v
}

describe('face: detecção', () => {
  it('foto pequena roda numa passada só; foto grande ganha blocos sobrepostos que cobrem tudo', () => {
    expect(planDetectionRegions(640, 480)).toHaveLength(1)
    const regions = planDetectionRegions(4000, 3000)
    expect(regions[0]).toMatchObject({ x: 0, y: 0, w: 4000, scale: DETECT_SIZE / 4000 })
    const tiles = regions.slice(1)
    expect(tiles.length).toBeGreaterThan(4)
    expect(Math.max(...tiles.map((t) => t.x + t.w))).toBe(4000)
    expect(Math.max(...tiles.map((t) => t.y + t.h))).toBe(3000)
    // Blocos não ampliam a foto (escala ≤ 1).
    expect(tiles.every((t) => t.scale <= 1)).toBe(true)
  })

  it('decodifica a âncora do YuNet e devolve na escala da foto', () => {
    const n8 = (DETECT_SIZE / 8) ** 2
    const outputs: Record<string, Float32Array> = {}
    for (const s of [8, 16, 32]) {
      const n = (DETECT_SIZE / s) ** 2
      outputs[`cls_${s}`] = new Float32Array(n)
      outputs[`obj_${s}`] = new Float32Array(n)
      outputs[`bbox_${s}`] = new Float32Array(n * 4)
      outputs[`kps_${s}`] = new Float32Array(n * 10)
    }
    // Âncora (linha 2, coluna 3) do passo 8: centro (3.5·8, 2.5·8), lado e^0·8·… = 8·e^1.
    const i = 2 * (DETECT_SIZE / 8) + 3
    outputs.cls_8![i] = 0.81
    outputs.obj_8![i] = 1
    outputs.bbox_8!.set([0.5, 0.5, 1, 1], i * 4)
    outputs.kps_8!.set([0, 0, 1, 0, 0.5, 0.5, 0, 1, 1, 1], i * 10)
    const out = decodeDetections(outputs, 0.5)
    expect(out).toHaveLength(1)
    expect(n8).toBe(6400)
    const d = out[0]!
    expect(d.score).toBeCloseTo(0.9)
    const side = Math.E * 8
    expect(d.box.x).toBeCloseTo(28 - side / 2)
    expect(d.box.w).toBeCloseTo(side)
    expect(d.landmarks[1]).toEqual({ x: 32, y: 16 })
    const photo = toPhotoCoords(out, { x: 100, y: 50, w: 1280, h: 1280, scale: 0.5 })[0]!
    expect(photo.box.x).toBeCloseTo(100 + (28 - side / 2) * 2)
    expect(photo.landmarks[1]).toEqual({ x: 164, y: 82 })
    expect(decodeDetections(outputs, 0.95)).toHaveLength(0)
  })

  it('remove duplicatas (sobreposição e rosto cortado dentro de outro) e ordena da esquerda para a direita', () => {
    const kept = nonMaxSuppression([det(0, 0, 100, 100, 0.8), det(5, 5, 100, 100, 0.9), det(10, 10, 40, 100, 0.95), det(300, 0, 50, 50)])
    expect(kept.map((d) => d.score)).toEqual([0.95, 0.9])
    const final = finalizeDetections([det(500, 0, 60, 60), det(10, 0, 60, 60), det(200, 0, 10, 10)])
    expect(final.map((d) => d.box.x)).toEqual([10, 500])
  })

  it('monta o quadro do detector em BGR, com preto fora da foto', () => {
    const img = { width: 2, height: 1, data: new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 255, 255]) }
    const frame = resampleRegion(img, { x: 0, y: 0, w: 2, h: 2, scale: 2 }, 4)
    const t = toDetectorTensor(frame, 4)
    expect(t[0]).toBe(0) // B do pixel vermelho
    expect(t[2 * 16]).toBe(255) // R do pixel vermelho
    expect(t[2 * 16 + 15]).toBe(0) // canto inferior direito: fora da foto
  })
})

describe('face: alinhamento', () => {
  it('recupera rotação, escala e translação', () => {
    const m = { a: 0.8 * Math.cos(0.3), b: 0.8 * Math.sin(0.3), tx: 12, ty: -7 }
    const src = ALIGNED_LANDMARKS.map((p) => ({ x: p.x * 3 + 40, y: p.y * 2.5 + 10 }))
    const dst = src.map((p) => applySimilarity(m, p))
    const est = estimateSimilarity(src, dst)
    expect(est.a).toBeCloseTo(m.a)
    expect(est.b).toBeCloseTo(m.b)
    expect(est.tx).toBeCloseTo(m.tx)
    expect(est.ty).toBeCloseTo(m.ty)
  })

  it('leva os pontos do rosto para a posição padrão do 112×112', () => {
    // Foto 224×224 com o rosto padrão ampliado 2×: o pixel claro no olho esquerdo vai para o olho do alinhado.
    const W = 224
    const data = new Uint8ClampedArray(W * W * 4)
    const eye = ALIGNED_LANDMARKS[0]!
    for (let y = -3; y <= 3; y++) for (let x = -3; x <= 3; x++) data[((Math.round(eye.y * 2) + y) * W + Math.round(eye.x * 2) + x) * 4] = 255
    const aligned = alignFace({ data, width: W, height: W }, ALIGNED_LANDMARKS.map((p) => ({ x: p.x * 2, y: p.y * 2 })))
    expect(aligned[(Math.round(eye.y) * 112 + Math.round(eye.x)) * 4]).toBeGreaterThan(200)
    expect(aligned[(10 * 112 + 10) * 4]).toBe(0)
  })
})

describe('face: comparação e sugestões', () => {
  it('cosseno, normalização e vetor do pgvector', () => {
    expect(cosine([1, 0], [0, 1])).toBe(0)
    expect(cosine([2, 0], [5, 0])).toBe(1)
    expect(normalize([3, 4])).toEqual([0.6, 0.8])
    expect(parseVector('[0.5,-1,2e-3]')).toEqual([0.5, -1, 0.002])
    expect(parseVector('[]')).toEqual([])
  })

  it('confiança cresce com o cosseno e o limiar do SFace fica perto de 55%', () => {
    expect(confidenceFromCosine(0.1)).toBe(0)
    expect(confidenceFromCosine(0.363)).toBeCloseTo(0.55)
    expect(confidenceFromCosine(0.9)).toBeLessThan(1)
    const xs = [0, 0.2, 0.3, 0.4, 0.5, 0.6, 0.8, 1]
    xs.slice(1).forEach((x, i) => expect(confidenceFromCosine(x)).toBeGreaterThan(confidenceFromCosine(xs[i]!)))
    expect(formatConfidence(0.874)).toBe('87%')
  })

  it('nota do aluno é a média das k melhores referências', () => {
    const refs = [
      { student_id: 'ana', vector: vec(10) },
      { student_id: 'ana', vector: vec(80) },
      { student_id: 'bia', vector: vec(40) },
    ]
    const [first, second] = scoreStudents(vec(0), refs, 1)
    expect(first!.student_id).toBe('ana')
    expect(first!.cosine).toBeCloseTo(Math.cos(Math.PI / 18))
    expect(second!.student_id).toBe('bia')
    const avg = scoreStudents(vec(0), refs, 3).find((s) => s.student_id === 'ana')!
    expect(avg.cosine).toBeCloseTo((Math.cos(Math.PI / 18) + Math.cos((80 * Math.PI) / 180)) / 2)
  })

  it('cada aluno é sugerido para um rosto só; sem referência parecida, pergunta "Quem é?"', () => {
    const refs = [
      { student_id: 'ana', vector: vec(0) },
      { student_id: 'bia', vector: vec(60) },
    ]
    // Rosto 0 parece um pouco a Ana, rosto 1 é muito a Ana; rosto 2 não é ninguém.
    const out = suggestForFaces([vec(30), vec(5), vec(90)], refs)
    expect(out[1]!.student_id).toBe('ana')
    expect(out[0]!.student_id).toBe('bia') // a Ana já ficou com o rosto 1
    expect(out[2]!.student_id).toBeNull()
    expect(out[0]!.alternatives.map((s) => s.student_id)).toEqual(['ana'])
    expect(suggestForFaces([vec(0)], [])).toEqual([{ student_id: null, confidence: 0, alternatives: [] }])
  })

  it('aprende: correção sempre vira referência; confirmação só se trouxer algo novo', () => {
    expect(shouldAddReference(vec(0), [], 'confirmed')).toBe(true)
    expect(shouldAddReference(vec(0), [vec(5)], 'confirmed')).toBe(false) // cos 0,996: repetida
    expect(shouldAddReference(vec(0), [vec(40)], 'confirmed')).toBe(true)
    expect(shouldAddReference(vec(0), [vec(5)], 'corrected')).toBe(true)
    expect(shouldAddReference(vec(0), [], 'ignored')).toBe(false)
  })

  it('aprovação automática fica desligada sem limite configurado', () => {
    expect(shouldAutoApprove(0.99, null)).toBe(false)
    expect(shouldAutoApprove(0.99, undefined)).toBe(false)
    expect(shouldAutoApprove(0.91, 0.9)).toBe(true)
    expect(shouldAutoApprove(0.89, 0.9)).toBe(false)
    expect(shouldAutoApprove(0.99, 0.3)).toBe(false) // limite baixo demais é ignorado
  })
})
