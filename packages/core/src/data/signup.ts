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
  /** Graduação que o aluno declarou no cadastro (null = sem graduação). */
  rank_id: string | null
  rank_name: string | null
  rank_grade: number | null
  rank_track: string | null
  graduated_at: string | null
  /** Data de nascimento informada no cadastro (opcional). */
  birth_date: string | null
  created_at: string
  /** Menor de 18 anos: o professor confere o termo do responsável antes de aprovar. */
  minor?: boolean
  /** Termo que veio no cadastro: assinado na tela, arquivo (papel) ou nenhum. */
  guardian_term?: 'esign' | 'file' | null
  guardian_file_path?: string | null
}

/** Grau para o aluno escolher no cadastro (lista pública, sem login). */
export interface SignupRank {
  id: string
  grade: number
  name: string
  track: string
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

/** Caminho da foto enviada sem login, no cadastro (antes de confirmar o e-mail). */
export const pendingFacePath = (profileId: string, token: string) => `${profileId}/signup-${token}.jpg`

/**
 * Envia a foto de rosto logo após o signUp, sem sessão (e-mail ainda não confirmado). `token` é o código secreto de
 * uso único mandado nos metadados do signUp (`photoToken`); vale por 24 horas.
 */
export async function uploadPendingSignupPhoto(db: Db, profileId: string, token: string, file: Blob): Promise<void> {
  const path = pendingFacePath(profileId, token)
  const up = await db.storage.from(FACE_BUCKET).upload(path, file, { contentType: 'image/jpeg', upsert: false })
  if (up.error) throw up.error
  unwrap(await db.rpc('set_pending_signup_photo', { p_profile_id: profileId, p_token: token }))
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

/**
 * Foto do cadastro de cada aluno com conta (academias do professor), já com URL assinada: id do aluno → URL.
 * A URL vale `expiresInSeconds` (padrão 7 dias, o mesmo tempo do cache offline).
 */
export async function listStudentPhotoUrls(db: Db, expiresInSeconds = 7 * 24 * 3600): Promise<Record<string, string>> {
  const rows = unwrap(await db.rpc('student_face_photos'))
  const urls = await signFaceUrls(db, rows.map((r) => r.photo_path), expiresInSeconds)
  const out: Record<string, string> = {}
  for (const r of rows) {
    const url = urls[r.photo_path]
    if (url) out[r.student_id] = url
  }
  return out
}

/** URL assinada da foto do cadastro da conta logada (aluno aprovado); null sem foto. Vale 7 dias, como o cache offline. */
export async function getMyFacePhotoUrl(db: Db, expiresInSeconds = 7 * 24 * 3600): Promise<string | null> {
  const path = unwrap(await db.rpc('my_face_photo'))
  if (!path) return null
  return (await signFaceUrls(db, [path], expiresInSeconds))[path] ?? null
}

export interface StudentSignupInput {
  gymId: string
  name: string
  phone?: string
  /** Graduação atual; vazio = sem graduação. */
  rankId?: string | null
  /** Data da última graduação (AAAA-MM-DD); obrigatória com rankId. */
  graduatedAt?: string | null
  /** Data de nascimento (AAAA-MM-DD). */
  birthDate?: string | null
  /** Código secreto (32+ hex) para enviar a foto sem login logo após o cadastro. */
  photoToken?: string
  /** Autorizou uso de imagem e reconhecimento facial no cadastro (só vale para maior de idade). */
  imageConsent?: boolean
}

/** Metadados do signUp que já criam o pedido no banco (funciona mesmo confirmando o e-mail em outro navegador). */
export function studentSignupMetadata(input: StudentSignupInput) {
  return {
    name: input.name,
    student_gym_id: input.gymId,
    student_phone: input.phone ?? '',
    student_rank_id: input.rankId ?? '',
    student_graduated_at: input.rankId ? (input.graduatedAt ?? '') : '',
    student_birth_date: input.birthDate ?? '',
    ...(input.photoToken ? { student_photo_token: input.photoToken } : {}),
    ...(input.imageConsent ? { student_image_consent: 'true' } : {}),
  }
}

/** Graus (adulto e infantil) para o aluno escolher. Funciona sem login. */
export async function getSignupRanks(db: Db): Promise<SignupRank[]> {
  const data = unwrap(await db.rpc('signup_ranks'))
  return (data ?? []) as unknown as SignupRank[]
}

/** Professores e academias para o aluno escolher. Funciona sem login. */
export async function getSignupDirectory(db: Db): Promise<DirectoryProfessor[]> {
  const data = unwrap(await db.rpc('signup_directory'))
  return (data ?? []) as unknown as DirectoryProfessor[]
}

export async function requestStudentAccess(db: Db, input: StudentSignupInput): Promise<void> {
  unwrap(
    await db.rpc('request_student_access', {
      p_gym_id: input.gymId,
      p_name: input.name,
      p_phone: input.phone ?? '',
      ...(input.rankId ? { p_rank_id: input.rankId, p_graduated_at: input.graduatedAt ?? undefined } : {}),
      ...(input.birthDate ? { p_birth_date: input.birthDate } : {}),
    }),
  )
}

/** Autorização de uso de imagem dada no cadastro pela conta logada (vai para o aluno quando o professor aprovar). */
export async function setMySignupImageConsent(db: Db): Promise<void> {
  unwrap(await db.rpc('set_my_signup_image_consent'))
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
