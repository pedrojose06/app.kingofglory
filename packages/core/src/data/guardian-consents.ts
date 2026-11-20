import {
  GUARDIAN_CONSENT_BUCKET, GUARDIAN_CONSENT_URL_SECONDS, guardianConsentFileIssue, guardianConsentMime, guardianConsentPath,
} from '../domain/guardian-consent'
import type { Db, GuardianConsent } from '../types'
import { unwrap } from './util'

/** Termos dos alunos das academias do professor (RLS). Um por aluno menor de idade. */
export async function listGuardianConsents(db: Db): Promise<GuardianConsent[]> {
  return unwrap(await db.from('student_guardian_consents').select('*'))
}

/**
 * Envia o termo assinado: sobe o arquivo no bucket privado e registra no banco (status 'enviado').
 * Um termo novo substitui o anterior, que é apagado do Storage. `fileId` é gerado no cliente (uuid).
 */
export async function uploadGuardianConsent(
  db: Db,
  input: { studentId: string; fileId: string; file: Blob & { type: string; size: number; name?: string } },
): Promise<void> {
  const { studentId, fileId, file } = input
  const issue = guardianConsentFileIssue(file)
  if (issue) throw new Error(issue)
  const mime = guardianConsentMime(file)!
  const path = guardianConsentPath(studentId, fileId, mime)
  const up = await db.storage.from(GUARDIAN_CONSENT_BUCKET).upload(path, file, { contentType: mime, upsert: false })
  if (up.error) throw up.error
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
