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
}

export interface StudentRequest {
  id: string
  name: string
  phone: string | null
  email: string
  gym_id: string
  created_at: string
}

export const STUDENT_SIGNUP_PATH = '/cadastro-aluno'

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
