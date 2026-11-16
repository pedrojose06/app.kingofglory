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
  /** Quantas presenças vale (ex.: aulão = 2). Ausente em dados antigos do cache. */
  credits?: number
}

export interface StudentPortal {
  student: PortalStudent
  gym_name: string
  progress: StudentProgress | null
  graduations: { rank_id: string; graduated_at: string }[]
  /** Graus da trilha do aluno. */
  ranks: Rank[]
  attendance: PortalAttendance[]
}

export interface StudentAccess {
  token: string
  created_at: string
  last_seen_at: string | null
}

/** Dados da área do aluno; null se o link não existe ou foi revogado. Funciona sem login. */
export async function getStudentPortal(db: Db, token: string): Promise<StudentPortal | null> {
  const data = unwrap(await db.rpc('student_portal', { p_token: token }))
  return (data ?? null) as unknown as StudentPortal | null
}

export async function getStudentAccess(db: Db, studentId: string): Promise<StudentAccess | null> {
  return unwrap(
    await db.from('student_access').select('token, created_at, last_seen_at').eq('student_id', studentId).maybeSingle(),
  )
}

/** Gera o link do aluno ou troca o atual (o antigo para de funcionar). Devolve o token novo. */
export async function rotateStudentAccess(db: Db, studentId: string): Promise<string> {
  return unwrap(await db.rpc('rotate_student_access', { p_student_id: studentId }))
}

export async function revokeStudentAccess(db: Db, studentId: string): Promise<void> {
  unwrap(await db.from('student_access').delete().eq('student_id', studentId))
}

export const STUDENT_PORTAL_PATH = '/minhas-presencas'

/** Link que o aluno recebe. O token vai no fragmento (#), que não é enviado ao servidor nem fica em logs. */
export function studentPortalUrl(origin: string, token: string): string {
  return `${origin}${STUDENT_PORTAL_PATH}#${token}`
}
