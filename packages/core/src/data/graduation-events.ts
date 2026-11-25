// Graduações (cerimônias) da equipe: data, fotos e o avanço de grau de quem foi reconhecido pelo rosto.
// A academia com gestão cadastra a graduação e as fotos; o rosto é lido no navegador e só o vetor vai para o banco, que
// compara com as referências de todas as academias (incluindo as parceiras). O professor responsável pelo aluno recebe
// um push e aprova ou não o avanço; o admin da academia também pode aprovar direto.

import type { Json } from '../database.types'
import type { RankTrack } from '../domain/graduation'
import type { Db, Row } from '../types'
import { chunk, unwrap } from './util'

export const GRADUATION_PHOTO_BUCKET = 'graduation-photos'

export type GraduationEvent = Row<'graduation_events'>
export type GraduationEventPhoto = Row<'graduation_event_photos'>
export type GraduationCandidateStatus = 'pending' | 'approved' | 'rejected'

export const CANDIDATE_STATUS_LABEL: Record<GraduationCandidateStatus, string> = {
  pending: 'Aguardando aprovação',
  approved: 'Aprovado',
  rejected: 'Não aprovado',
}

export interface FaceBox {
  x: number
  y: number
  w: number
  h: number
}

/** Aluno parecido com um rosto da foto (de qualquer academia da equipe). */
export interface GraduationMatch {
  student_id: string
  name: string
  gym_id: string
  gym_name: string
  /** Cosseno médio das melhores referências (SFace). */
  cosine: number
  current_rank_id: string | null
  next_rank_id: string | null
}

/** Candidato na visão da academia (com nome e academia do aluno, que a equipe não lê pela RLS). */
export interface EventCandidate {
  id: string
  student_id: string
  student_name: string
  gym_id: string
  gym_name: string
  /** A academia do aluno tem professor no app (é dele a aprovação se a academia pular). */
  has_instructor: boolean
  from_rank_id: string | null
  to_rank_id: string
  source: 'face' | 'manual'
  photo_id: string | null
  storage_path: string | null
  bbox: FaceBox | null
  score: number | null
  status: GraduationCandidateStatus
  decided_via: 'academia' | 'professor' | null
  decided_at: string | null
  created_at: string
}

/** Candidato na visão do professor (alunos das academias em que ele dá aula). */
export interface MyGraduationCandidate {
  id: string
  event_id: string
  held_on: string
  host_gym_name: string
  student_id: string
  student_name: string
  gym_id: string
  from_rank_id: string | null
  to_rank_id: string
  source: 'face' | 'manual'
  storage_path: string | null
  bbox: FaceBox | null
  score: number | null
  status: GraduationCandidateStatus
  decided_via: 'academia' | 'professor' | null
  decided_at: string | null
  created_at: string
}

export const graduationPhotoPath = (gymId: string, eventId: string, photoId: string) => `${gymId}/${eventId}/${photoId}.jpg`

// ── graduações ──────────────────────────────────────────────────────────────

export async function listGraduationEvents(db: Db, gymId: string): Promise<GraduationEvent[]> {
  return unwrap(await db.from('graduation_events').select('*').eq('gym_id', gymId).order('held_on', { ascending: false }))
}

export async function getGraduationEvent(db: Db, id: string): Promise<GraduationEvent | null> {
  return unwrap(await db.from('graduation_events').select('*').eq('id', id).maybeSingle())
}

export interface GraduationEventInput {
  gym_id: string
  held_on: string
  track: RankTrack
  title: string | null
  notes: string | null
}

export async function saveGraduationEvent(db: Db, input: GraduationEventInput & { id?: string }): Promise<GraduationEvent> {
  const values = {
    gym_id: input.gym_id,
    held_on: input.held_on,
    track: input.track,
    title: input.title?.trim() || null,
    notes: input.notes?.trim() || null,
  }
  if (input.id) return unwrap(await db.from('graduation_events').update(values).eq('id', input.id).select().single())
  return unwrap(await db.from('graduation_events').insert(values).select().single())
}

/** Apaga a graduação (fotos e candidatos juntos). As graduações já aprovadas continuam na ficha dos alunos. */
export async function deleteGraduationEvent(db: Db, event: GraduationEvent): Promise<void> {
  const photos = await listGraduationPhotos(db, event.id)
  unwrap(await db.from('graduation_events').delete().eq('id', event.id))
  if (photos.length > 0) await db.storage.from(GRADUATION_PHOTO_BUCKET).remove(photos.map((p) => p.storage_path))
}

// ── fotos ───────────────────────────────────────────────────────────────────

export async function listGraduationPhotos(db: Db, eventId: string): Promise<GraduationEventPhoto[]> {
  return unwrap(await db.from('graduation_event_photos').select('*').eq('event_id', eventId).order('created_at'))
}

export async function uploadGraduationPhoto(db: Db, meta: { id: string; gym_id: string; event_id: string }, file: Blob): Promise<GraduationEventPhoto> {
  const path = graduationPhotoPath(meta.gym_id, meta.event_id, meta.id)
  const up = await db.storage.from(GRADUATION_PHOTO_BUCKET).upload(path, file, { contentType: 'image/jpeg', upsert: true })
  if (up.error) throw up.error
  return unwrap(
    await db.from('graduation_event_photos').upsert({ id: meta.id, event_id: meta.event_id, storage_path: path }, { onConflict: 'id' }).select().single(),
  )
}

export async function deleteGraduationPhoto(db: Db, photo: GraduationEventPhoto): Promise<void> {
  unwrap(await db.from('graduation_event_photos').delete().eq('id', photo.id))
  await db.storage.from(GRADUATION_PHOTO_BUCKET).remove([photo.storage_path])
}

export async function signGraduationPhotoUrls(db: Db, paths: readonly string[], expiresInSeconds = 3600): Promise<Record<string, string>> {
  const unique = [...new Set(paths)]
  if (unique.length === 0) return {}
  const { data, error } = await db.storage.from(GRADUATION_PHOTO_BUCKET).createSignedUrls(unique, expiresInSeconds)
  if (error) throw error
  const out: Record<string, string> = {}
  for (const item of data ?? []) if (item.path && item.signedUrl) out[item.path] = item.signedUrl
  return out
}

// ── reconhecimento e candidatos ─────────────────────────────────────────────

/** Compara os rostos (vetores do SFace) com todas as academias da equipe. Uma lista por rosto, na mesma ordem. */
export async function matchGraduationFaces(db: Db, eventId: string, embeddings: readonly number[][]): Promise<GraduationMatch[][]> {
  const out: GraduationMatch[][] = []
  for (const part of chunk(embeddings, 50)) {
    const res = unwrap(await db.rpc('graduation_face_match', { p_event_id: eventId, p_faces: part as unknown as Json })) as unknown as {
      face_index: number
      matches: GraduationMatch[]
    }[]
    for (const face of res) out.push(face.matches)
  }
  return out
}

/** Busca alunos de todas as academias pelo nome (mínimo 3 letras), para incluir quem o rosto não achou. */
export async function searchGraduationStudents(db: Db, eventId: string, query: string): Promise<Omit<GraduationMatch, 'cosine'>[]> {
  if (query.trim().length < 3) return []
  return unwrap(await db.rpc('graduation_student_search', { p_event_id: eventId, p_query: query }))
}

export interface CandidateProposal {
  student_id: string
  to_rank_id?: string | null
  source: 'face' | 'manual'
  photo_id?: string | null
  bbox?: FaceBox | null
  score?: number | null
}

/** Cria os candidatos (idempotente por aluno). Aluno de academia com professor já gera o push para ele. */
export async function proposeGraduationCandidates(db: Db, eventId: string, items: readonly CandidateProposal[]): Promise<string[]> {
  if (items.length === 0) return []
  const clean = items.map((i) => ({ ...i, to_rank_id: i.to_rank_id || undefined }))
  const rows = unwrap(await db.rpc('propose_graduation_candidates', { p_event_id: eventId, p_items: clean as unknown as Json }))
  return rows.map((r) => r.id)
}

export async function listEventCandidates(db: Db, eventId: string): Promise<EventCandidate[]> {
  return unwrap(await db.rpc('graduation_event_candidates', { p_event_id: eventId })) as unknown as EventCandidate[]
}

/** Aprova (grava a graduação na data do evento) ou não aprova o avanço de grau. Pode ser refeito. */
export async function decideGraduationCandidate(db: Db, id: string, approve: boolean, toRankId?: string | null): Promise<void> {
  unwrap(
    await db.rpc('decide_graduation_candidate', {
      p_candidate_id: id,
      p_approve: approve,
      ...(toRankId ? { p_to_rank_id: toRankId } : {}),
    }),
  )
}

/** "Não é esta pessoa": tira o aluno da graduação. */
export async function dismissGraduationCandidate(db: Db, id: string): Promise<void> {
  unwrap(await db.rpc('dismiss_graduation_candidate', { p_candidate_id: id }))
}

/** Para o professor: alunos dele reconhecidos em graduações (pendentes e os decididos nos últimos 30 dias). */
export async function listMyGraduationCandidates(db: Db): Promise<MyGraduationCandidate[]> {
  return unwrap(await db.rpc('my_graduation_candidates')) as unknown as MyGraduationCandidate[]
}
