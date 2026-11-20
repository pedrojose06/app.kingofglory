import type { AttendanceStatus, Db, Rank, Student, StudentProgress } from '../types'
import { unwrap } from './util'

/**
 * Área do aluno: link secreto por aluno (`student_access.token`). O aluno abre sem login e vê as próprias
 * presenças e a graduação; o professor gera, troca e revoga o link na tela do aluno.
 */

export type PortalStudent = Pick<
  Student,
  | 'id' | 'name' | 'active' | 'track' | 'birth_date' | 'started_on' | 'created_at'
  | 'opening_present' | 'opening_absent' | 'opening_from' | 'opening_until' | 'opening_after_grad'
>

export interface PortalAttendance {
  id: string
  date: string
  status: AttendanceStatus
  class_id: string | null
  /** Título da aula (aula normal) — null em presença avulsa. */
  title: string | null
  start_time: string | null
  /** Local da presença avulsa. */
  location_label: string | null
  /** Período da avulsa (manha/tarde/noite). Ausente em dados antigos do cache. */
  walk_in_period?: string
  /** Quantas presenças vale (ex.: aulão = 2). Ausente em dados antigos do cache. */
  credits?: number
}

export interface StudentPortal {
  student: PortalStudent
  gym_name: string
  /** Data marcada da próxima graduação da academia. Ausente em dados antigos do cache. */
  next_graduation_on?: string | null
  progress: StudentProgress | null
  graduations: { rank_id: string; graduated_at: string }[]
  /** Graus da trilha do aluno. */
  ranks: Rank[]
  attendance: PortalAttendance[]
  /** Só pelo link: validade do link e se o aluno já criou conta. */
  access?: { expires_at: string; has_account: boolean }
}

/** Conta logada de aluno: aluno ligado e aceites. */
export interface MyStudentAccount {
  student_id: string
  name: string
  gym_name: string
  account_consent_at: string | null
  image_consent_at: string | null
  /** Ausentes em dados antigos do cache. */
  birth_date?: string | null
  /** Menor de 18 anos (calculado no banco, dia de São Paulo). */
  minor?: boolean
  /** Termo do responsável (só menor de idade). */
  guardian_consent?: { status: string; uploaded_at: string | null; rejected_reason: string | null } | null
}

/** A conta só acessa a área do aluno com o aceite do próprio aluno e o consentimento de imagem em vigor. */
export const hasAccountConsent = (a: Pick<MyStudentAccount, 'account_consent_at' | 'image_consent_at'>) =>
  !!a.account_consent_at && !!a.image_consent_at

/** Validades oferecidas ao gerar o link do aluno (horas). 24 h é o padrão. */
export const STUDENT_LINK_HOURS = [24, 72, 168] as const
export const DEFAULT_STUDENT_LINK_HOURS = 24

export interface StudentAccess {
  token: string
  created_at: string
  last_seen_at: string | null
  expires_at: string
}

/** Dados da área do aluno; null se o link não existe ou foi revogado. Funciona sem login. */
export async function getStudentPortal(db: Db, token: string): Promise<StudentPortal | null> {
  const data = unwrap(await db.rpc('student_portal', { p_token: token }))
  return (data ?? null) as unknown as StudentPortal | null
}

export async function getStudentAccess(db: Db, studentId: string): Promise<StudentAccess | null> {
  return unwrap(
    await db.from('student_access').select('token, created_at, last_seen_at, expires_at').eq('student_id', studentId).maybeSingle(),
  )
}

/** Gera o link do aluno ou troca o atual (o antigo para de funcionar), válido por `hours`. Devolve o token novo. */
export async function rotateStudentAccess(db: Db, studentId: string, hours: number = DEFAULT_STUDENT_LINK_HOURS): Promise<string> {
  return unwrap(await db.rpc('rotate_student_access', { p_student_id: studentId, p_hours: hours }))
}

/** Liga a conta logada ao aluno do link (o link precisa estar válido). */
export async function claimStudentAccount(db: Db, token: string): Promise<void> {
  unwrap(await db.rpc('claim_student_account', { p_token: token }))
}

/** Aluno ligado à conta logada; null se a conta não é de aluno. */
export async function getMyStudentAccount(db: Db): Promise<MyStudentAccount | null> {
  const data = unwrap(await db.rpc('my_student_account'))
  return (data ?? null) as unknown as MyStudentAccount | null
}

export async function acceptImageConsent(db: Db): Promise<void> {
  unwrap(await db.rpc('accept_image_consent'))
}

/** Área do aluno pela conta (sem link). null sem aceite. */
export async function getMyStudentPortal(db: Db): Promise<StudentPortal | null> {
  const data = unwrap(await db.rpc('my_student_portal'))
  return (data ?? null) as unknown as StudentPortal | null
}

/** Professor desliga a conta do aluno (ele volta a depender do link até criar/ligar uma conta de novo). */
export async function unlinkStudentAccount(db: Db, studentId: string): Promise<void> {
  unwrap(await db.from('students').update({ profile_id: null, account_consent_at: null }).eq('id', studentId))
}

export async function revokeStudentAccess(db: Db, studentId: string): Promise<void> {
  unwrap(await db.from('student_access').delete().eq('student_id', studentId))
}

export const STUDENT_PORTAL_PATH = '/minhas-presencas'

/** Link que o aluno recebe. O token vai no fragmento (#), que não é enviado ao servidor nem fica em logs. */
export function studentPortalUrl(origin: string, token: string): string {
  return `${origin}${STUDENT_PORTAL_PATH}#${token}`
}
