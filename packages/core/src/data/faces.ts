import type { Json } from '../database.types'
import { FACE_MODEL, MAX_REFS_PER_STUDENT, parseVector, type FaceDecisionKind } from '../domain/face'
import type { Db, Row } from '../types'
import { chunk, unwrap } from './util'

export type FaceDetectionRow = Row<'face_detections'>

export interface StoredReference {
  id: string
  student_id: string
  vector: number[]
  created_at: string
}

/** Referências dos alunos (com consentimento) de uma academia, só do modelo em uso. Vão para o cache offline. */
export async function listFaceReferences(db: Db, gymId: string): Promise<StoredReference[]> {
  const rows = unwrap(await db.rpc('face_references', { p_gym_id: gymId }))
  return rows
    .filter((r) => r.model === FACE_MODEL)
    .map((r) => ({ id: r.id, student_id: r.student_id, vector: parseVector(r.embedding), created_at: r.created_at }))
}

/** Rostos já decididos nas fotos de uma aula (para não perguntar de novo). */
export async function listPhotoFaces(db: Db, photoIds: readonly string[]): Promise<FaceDetectionRow[]> {
  if (photoIds.length === 0) return []
  return unwrap(await db.from('face_detections').select('*').in('photo_id', [...photoIds]))
}

/** Uma decisão do professor sobre um rosto. Ids gerados no cliente: reenviar não duplica. */
export interface FaceDecisionItem {
  photo_id: string
  face_index: number
  /** Caixa normalizada (0..1) na foto enviada. */
  bbox: { x: number; y: number; w: number; h: number }
  suggested_student_id: string | null
  score: number | null
  student_id: string | null
  decision: FaceDecisionKind
  /** Presente quando o rosto vira referência do aluno. */
  embedding_id?: string
  embedding?: number[]
}

export async function saveFaceDecisions(db: Db, items: readonly FaceDecisionItem[]): Promise<void> {
  for (const part of chunk(items, 50)) {
    unwrap(await db.rpc('save_face_decisions', { p_items: part as unknown as Json, p_max_refs: MAX_REFS_PER_STUDENT }))
  }
}

/** Alunos da academia com consentimento e foto do cadastro que ainda não viraram referência. */
export async function listSignupFacePhotos(db: Db, gymId: string): Promise<{ student_id: string; photo_path: string }[]> {
  return unwrap(await db.rpc('face_signup_photos', { p_gym_id: gymId }))
}

/** Grava a referência calculada da foto do cadastro (uma por aluno; repetir não duplica). */
export async function addSignupFaceReference(db: Db, input: { student_id: string; id: string; embedding: number[] }): Promise<boolean> {
  return unwrap(
    await db.rpc('add_signup_face_reference', { p_student_id: input.student_id, p_id: input.id, p_embedding: input.embedding as unknown as Json }),
  )
}
