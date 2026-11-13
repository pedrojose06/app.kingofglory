import type { GraduationInput, RankRequirementInput, StudentInput } from '../schemas'
import type { Db, Graduation, Rank, Student, StudentProgress } from '../types'
import { fetchAll, unwrap } from './util'

export async function listStudents(db: Db): Promise<Student[]> {
  return fetchAll((from, to) => db.from('students').select('*').order('name').range(from, to))
}

export async function createStudent(db: Db, input: StudentInput): Promise<Student> {
  return unwrap(await db.from('students').insert(input).select().single())
}

export async function createStudents(db: Db, gymId: string, names: string[]): Promise<Student[]> {
  if (names.length === 0) return []
  return unwrap(await db.from('students').insert(names.map((name) => ({ gym_id: gymId, name }))).select())
}

export async function updateStudent(db: Db, id: string, patch: Partial<StudentInput>): Promise<void> {
  unwrap(await db.from('students').update(patch).eq('id', id))
}

export async function setImageConsent(db: Db, id: string, consented: boolean): Promise<void> {
  unwrap(
    await db.from('students').update({ image_consent_at: consented ? new Date().toISOString() : null }).eq('id', id),
  )
}

export async function listRanks(db: Db): Promise<Rank[]> {
  return unwrap(await db.from('ranks').select('*').order('grade'))
}

export async function updateRankRequirements(db: Db, id: string, input: RankRequirementInput): Promise<void> {
  unwrap(await db.from('ranks').update(input).eq('id', id))
}

export async function listProgress(db: Db): Promise<StudentProgress[]> {
  const rows = await fetchAll((from, to) => db.from('student_progress').select('*').order('student_id').range(from, to))
  return rows as StudentProgress[]
}

export async function listGraduations(db: Db, studentId: string): Promise<Graduation[]> {
  return unwrap(
    await db.from('student_graduations').select('*').eq('student_id', studentId).order('graduated_at', { ascending: false }),
  )
}

export async function addGraduation(db: Db, input: GraduationInput): Promise<void> {
  unwrap(
    await db.from('student_graduations').upsert(
      { student_id: input.student_id, rank_id: input.rank_id, graduated_at: input.graduated_at, notes: input.notes ?? null },
      { onConflict: 'student_id,rank_id' },
    ),
  )
}

export async function deleteGraduation(db: Db, id: string): Promise<void> {
  unwrap(await db.from('student_graduations').delete().eq('id', id))
}
