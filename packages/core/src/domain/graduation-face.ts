// Graduação pelo rosto: escolhe quem é cada rosto a partir dos alunos parecidos que o banco devolveu.

import { confidenceFromCosine, SUGGEST_MIN_CONFIDENCE } from './face'

export interface FaceMatchLike {
  student_id: string
  cosine: number
}

export interface GraduationFaceAssignment<M extends FaceMatchLike> {
  /** Aluno sugerido para o rosto (null = ninguém parecido o bastante). */
  match: M | null
  /** Confiança mostrada (0–1), a mesma curva da presença pelo rosto. */
  confidence: number
  /** Os outros parecidos, do mais provável ao menos (para "É outra pessoa"). */
  alternatives: M[]
}

/**
 * Um aluno vai para no máximo um rosto da foto: os pares (rosto, aluno) são atribuídos do mais parecido para o menos,
 * como na presença pelo rosto. Abaixo de `minConfidence` o rosto fica sem sugestão.
 */
export function assignGraduationFaces<M extends FaceMatchLike>(
  lists: readonly (readonly M[])[],
  minConfidence = SUGGEST_MIN_CONFIDENCE,
): GraduationFaceAssignment<M>[] {
  const pairs: { face: number; m: M }[] = []
  lists.forEach((list, face) => list.forEach((m) => confidenceFromCosine(m.cosine) >= minConfidence && pairs.push({ face, m })))
  pairs.sort((a, b) => b.m.cosine - a.m.cosine)
  const chosen = new Map<number, M>()
  const used = new Set<string>()
  for (const { face, m } of pairs) {
    if (chosen.has(face) || used.has(m.student_id)) continue
    chosen.set(face, m)
    used.add(m.student_id)
  }
  return lists.map((list, face) => {
    const match = chosen.get(face) ?? null
    return {
      match,
      confidence: match ? confidenceFromCosine(match.cosine) : 0,
      alternatives: list.filter((m) => m.student_id !== match?.student_id),
    }
  })
}
