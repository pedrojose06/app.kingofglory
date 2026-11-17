import type { Db } from '../types'
import { unwrap } from './util'

/**
 * Cadastro do aluno sem link: escolhe o professor e a academia, cria a conta e espera o professor aprovar
 * (ligando a um aluno já cadastrado ou criando um novo) ou recusar.
 */

export interface DirectoryProfessor {
  id: string
  name: string
  gyms: { id: string; name: string }[]
}

export interface MySignupRequest {
  status: 'pending' | 'approved' | 'rejected'
  gym_name: string
  name: string
  created_at: string
  /** Foto de rosto já enviada. Sem ela o pedido não chega ao professor. */
  has_photo: boolean
}

export interface StudentRequest {
  id: string
  name: string
  phone: string | null
  email: string
  gym_id: string
  photo_path: string
  created_at: string
}

export const STUDENT_SIGNUP_PATH = '/cadastro-aluno'

/** Bucket privado da foto de rosto do cadastro; caminho `{profile_id}/face.jpg`. */
export const FACE_BUCKET = 'student-faces'
export const facePath = (profileId: string) => `${profileId}/face.jpg`

/** Envia a foto de rosto da conta logada e a liga ao pedido de acesso (que já deve existir). */
export async function uploadSignupPhoto(db: Db, profileId: string, file: Blob): Promise<void> {
  const path = facePath(profileId)
  const up = await db.storage.from(FACE_BUCKET).upload(path, file, { contentType: 'image/jpeg', upsert: true })
  if (up.error) throw up.error
  unwrap(await db.rpc('set_signup_photo', { p_path: path }))
}

/** URLs assinadas das fotos de rosto (o professor só consegue as dos pedidos das academias dele). */
export async function signFaceUrls(db: Db, paths: string[], expiresInSeconds = 3600): Promise<Record<string, string>> {
  if (paths.length === 0) return {}
  const { data, error } = await db.storage.from(FACE_BUCKET).createSignedUrls(paths, expiresInSeconds)
  if (error) throw error
  const out: Record<string, string> = {}
  for (const item of data ?? []) if (item.path && item.signedUrl) out[item.path] = item.signedUrl
  return out
}

/** Metadados do signUp que já criam o pedido no banco (funciona mesmo confirmando o e-mail em outro navegador). */
export function studentSignupMetadata(input: { name: string; gymId: string; phone?: string }) {
  return { name: input.name, student_gym_id: input.gymId, student_phone: input.phone ?? '' }
}

/** Professores e academias para o aluno escolher. Funciona sem login. */
export async function getSignupDirectory(db: Db): Promise<DirectoryProfessor[]> {
  const data = unwrap(await db.rpc('signup_directory'))
  return (data ?? []) as unknown as DirectoryProfessor[]
}

export async function requestStudentAccess(db: Db, input: { gymId: string; name: string; phone?: string }): Promise<void> {
  unwrap(await db.rpc('request_student_access', { p_gym_id: input.gymId, p_name: input.name, p_phone: input.phone ?? '' }))
}

export async function getMySignupRequest(db: Db): Promise<MySignupRequest | null> {
  const data = unwrap(await db.rpc('my_signup_request'))
  return (data ?? null) as unknown as MySignupRequest | null
}

/** Pedidos pendentes das academias do professor. */
export async function listStudentRequests(db: Db): Promise<StudentRequest[]> {
  const data = unwrap(await db.rpc('list_student_requests'))
  return (data ?? []) as unknown as StudentRequest[]
}

/** Aprova ligando ao aluno `studentId` (da mesma academia, sem conta) ou, sem ele, criando um aluno novo. */
export async function approveStudentRequest(db: Db, requestId: string, studentId?: string): Promise<string> {
  return unwrap(await db.rpc('approve_student_request', { p_request_id: requestId, ...(studentId ? { p_student_id: studentId } : {}) }))
}

export async function rejectStudentRequest(db: Db, requestId: string): Promise<void> {
  unwrap(await db.rpc('reject_student_request', { p_request_id: requestId }))
}
