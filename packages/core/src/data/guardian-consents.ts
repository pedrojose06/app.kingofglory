import {
  GUARDIAN_TERM_VERSION, cpfDigits, type GuardianConsentStatus, type GuardianSignForm, type GuardianSignature,
  GUARDIAN_CONSENT_BUCKET, GUARDIAN_CONSENT_TYPES, GUARDIAN_CONSENT_URL_SECONDS, type GuardianConsentMime, guardianConsentFileIssue, guardianConsentMime, guardianConsentPath,
} from '../domain/guardian-consent'
import type { Db, GuardianConsent } from '../types'
import { unwrap } from './util'

/** Colunas da lista (sem a imagem da assinatura, que é grande e só entra no PDF). */
const CONSENT_COLUMNS =
  'id, student_id, file_path, status, uploaded_at, uploaded_by, created_at, updated_at, reviewed_at, reviewed_by, rejected_reason, ' +
  'rejected_at, sign_token, sign_token_expires_at, sign_token_created_by, signed_at, guardian_name, guardian_cpf, guardian_relationship, ' +
  'image_authorized, face_authorized, signed_place, signed_ip, signed_user_agent, term_version, document_sha256'

/** Termos dos alunos das academias do professor (RLS). Um por aluno menor de idade. */
export async function listGuardianConsents(db: Db): Promise<GuardianConsent[]> {
  return unwrap(await db.from('student_guardian_consents').select(CONSENT_COLUMNS)) as unknown as GuardianConsent[]
}

/**
 * Envia o termo assinado: sobe o arquivo no bucket privado e registra no banco (status 'enviado').
 * Um termo novo substitui o anterior, que é apagado do Storage. `fileId` é gerado no cliente (uuid).
 */
type UploadFile = Blob & { type: string; size: number; name?: string }

async function putFile(db: Db, studentId: string, fileId: string, file: UploadFile): Promise<string> {
  const issue = guardianConsentFileIssue(file)
  if (issue) throw new Error(issue)
  const mime = guardianConsentMime(file)!
  const path = guardianConsentPath(studentId, fileId, mime)
  const up = await db.storage.from(GUARDIAN_CONSENT_BUCKET).upload(path, file, { contentType: mime, upsert: false })
  if (up.error) throw up.error
  return path
}

/** Professor envia o termo assinado (já vale como aprovado). */
export async function uploadGuardianConsent(
  db: Db,
  input: { studentId: string; fileId: string; file: UploadFile },
): Promise<void> {
  const { studentId, fileId, file } = input
  const path = await putFile(db, studentId, fileId, file)
  const res = await db.rpc('set_guardian_consent_file', { p_student_id: studentId, p_path: path })
  if (res.error) {
    await db.storage.from(GUARDIAN_CONSENT_BUCKET).remove([path])
    throw res.error
  }
  const previous = res.data as string | null
  if (previous && previous !== path) await db.storage.from(GUARDIAN_CONSENT_BUCKET).remove([previous])
}

/** URL assinada de curta duração para abrir o termo. Só o professor do aluno consegue gerar (policy do Storage). */
export async function guardianConsentUrl(db: Db, path: string, expiresInSeconds = GUARDIAN_CONSENT_URL_SECONDS): Promise<string> {
  const { data, error } = await db.storage.from(GUARDIAN_CONSENT_BUCKET).createSignedUrl(path, expiresInSeconds)
  if (error) throw error
  return data.signedUrl
}

/** Aluno menor (conta logada) envia o termo assinado pelo responsável: fica 'em_analise' até o professor conferir. */
export async function submitMyGuardianConsent(db: Db, input: { studentId: string; fileId: string; file: UploadFile }): Promise<void> {
  const path = await putFile(db, input.studentId, input.fileId, input.file)
  const res = await db.rpc('submit_guardian_consent_file', { p_path: path })
  if (res.error) {
    await db.storage.from(GUARDIAN_CONSENT_BUCKET).remove([path])
    throw res.error
  }
  const previous = res.data as string | null
  // Arquivo anterior ainda não aprovado: não serve mais. Falha ao apagar não impede o envio.
  if (previous && previous !== path) await db.storage.from(GUARDIAN_CONSENT_BUCKET).remove([previous])
}

export type GuardianReview =
  | { approve: true; /** O responsável marcou "Sim" para uso de imagem e reconhecimento facial. */ imageConsent: boolean }
  | { approve: false; /** O que o aluno precisa corrigir (ele vê). */ reason: string }

/** Professor confere o termo enviado pelo aluno. Recusado, o arquivo é apagado e o aluno vê o motivo. */
export async function reviewGuardianConsent(db: Db, studentId: string, review: GuardianReview): Promise<void> {
  const res = await db.rpc('review_guardian_consent', {
    p_student_id: studentId,
    p_approve: review.approve,
    p_image_consent: review.approve ? review.imageConsent : false,
    ...(review.approve ? {} : { p_reason: review.reason }),
  })
  if (res.error) throw res.error
  const rejected = res.data as string | null
  if (rejected) await db.storage.from(GUARDIAN_CONSENT_BUCKET).remove([rejected])
}

/** Caminho do termo anexado no cadastro (o aluno ainda não existe): pasta da conta. */
export const signupTermPath = (profileId: string, name: string, mime: GuardianConsentMime) =>
  `${profileId}/termo-${name}.${GUARDIAN_CONSENT_TYPES[mime]}`

/**
 * Termo anexado no cadastro do aluno menor, logo após o signUp, sem sessão. `token` é o mesmo código secreto do
 * cadastro (o da foto); vale uma vez e por 24 horas. Quando o professor aprovar o aluno, vira "Termo para conferir".
 */
export async function uploadPendingSignupTerm(db: Db, profileId: string, token: string, file: UploadFile): Promise<void> {
  const issue = guardianConsentFileIssue(file)
  if (issue) throw new Error(issue)
  const mime = guardianConsentMime(file)!
  const path = signupTermPath(profileId, token, mime)
  const up = await db.storage.from(GUARDIAN_CONSENT_BUCKET).upload(path, file, { contentType: mime, upsert: false })
  if (up.error) throw up.error
  const res = await db.rpc('set_pending_signup_term', { p_profile_id: profileId, p_token: token, p_ext: GUARDIAN_CONSENT_TYPES[mime] })
  if (res.error) throw res.error
}

/** Termo anexado no cadastro pela conta já logada (pedido feito com request_student_access). */
export async function uploadMySignupTerm(db: Db, profileId: string, fileId: string, file: UploadFile): Promise<void> {
  const issue = guardianConsentFileIssue(file)
  if (issue) throw new Error(issue)
  const mime = guardianConsentMime(file)!
  const path = signupTermPath(profileId, fileId, mime)
  const up = await db.storage.from(GUARDIAN_CONSENT_BUCKET).upload(path, file, { contentType: mime, upsert: false })
  if (up.error) throw up.error
  const res = await db.rpc('set_my_signup_term', { p_path: path })
  if (res.error) {
    await db.storage.from(GUARDIAN_CONSENT_BUCKET).remove([path])
    throw res.error
  }
}

// ── Assinatura eletrônica no app ──────────────────────────────────────────────

export interface GuardianSignLink {
  token: string
  expires_at: string
}

/** Link para o responsável assinar (professor do aluno ou a conta do aluno). Reaproveita o link em vigor. */
export async function createGuardianSignLink(db: Db, studentId: string, renew = false): Promise<GuardianSignLink> {
  return unwrap(await db.rpc('create_guardian_sign_link', { p_student_id: studentId, p_renew: renew })) as unknown as GuardianSignLink
}

export interface GuardianSignInfo {
  student_name: string
  birth_date: string
  gym_name: string
  minor: boolean
  status: GuardianConsentStatus
  /** Como o termo atual foi enviado: assinado no app ou arquivo (papel). null = nada enviado. */
  kind: 'esign' | 'file' | null
  signed_at: string | null
  guardian_name: string | null
  rejected_reason: string | null
  expires_at: string
}

/** O que a página do link mostra (sem login). null = link inválido ou vencido. */
export async function getGuardianSignInfo(db: Db, token: string): Promise<GuardianSignInfo | null> {
  return (unwrap(await db.rpc('guardian_sign_info', { p_token: token })) as unknown as GuardianSignInfo | null) ?? null
}

/** Responsável assina pelo link. O banco grava data, IP e navegador e devolve o código de verificação. */
/** Campos da assinatura para as RPCs (nome e CPF normalizados). */
const signArgs = (form: GuardianSignForm) => ({
  p_guardian_name: form.guardianName.trim().replace(/\s+/g, ' '),
  p_guardian_cpf: cpfDigits(form.guardianCpf),
  p_relationship: form.relationship.trim(),
  p_image: form.image === true,
  p_face: form.face === true,
  p_place: form.place.trim(),
  p_signature: form.signature,
  p_term_version: GUARDIAN_TERM_VERSION,
})

/**
 * Responsável assina na tela já no cadastro do aluno menor. Sem sessão: `token` é o código do cadastro (o mesmo da
 * foto, uma vez, até 24 h). Com a conta logada: `token` null. Vira "Termo para conferir" quando o professor aprovar.
 */
export async function signSignupGuardianTerm(db: Db, profileId: string, token: string | null, form: GuardianSignForm): Promise<void> {
  const res = await db.rpc('sign_signup_guardian_term', { p_profile_id: profileId, p_token: token, ...signArgs(form) })
  if (res.error) throw res.error
}

export async function signGuardianTerm(db: Db, token: string, form: GuardianSignForm): Promise<{ signed_at: string; document_sha256: string }> {
  const res = await db.rpc('sign_guardian_term', { p_token: token, ...signArgs(form) })
  return unwrap(res) as unknown as { signed_at: string; document_sha256: string }
}

/** De onde vem o termo assinado no app: link do responsável, aluno (professor ou a conta dele) ou pedido de cadastro. */
export type GuardianSignatureRef = { token: string } | { studentId: string } | { requestId: string }

/** Dados do termo assinado no app (para o PDF). O banco confere quem pode ver. */
export async function getGuardianSignature(db: Db, by: GuardianSignatureRef): Promise<GuardianSignature | null> {
  const res =
    'requestId' in by
      ? await db.rpc('signup_guardian_signature', { p_request_id: by.requestId })
      : await db.rpc('guardian_term_signature', 'token' in by ? { p_token: by.token } : { p_student_id: by.studentId })
  return (unwrap(res) as unknown as GuardianSignature | null) ?? null
}
