import type { Attendance, AttendanceSource, AttendanceStatus, Db } from '../types'
import { chunk, fetchAll, unwrap } from './util'

export interface AttendanceMark {
  class_id: string
  student_id: string
  status: AttendanceStatus
  /** ISO; em conflito vence a marcação mais recente. */
  marked_at?: string
  source?: AttendanceSource
}

export async function listClassAttendance(db: Db, classId: string): Promise<Attendance[]> {
  return unwrap(await db.from('attendance').select('*').eq('class_id', classId))
}

export async function listStudentAttendance(db: Db, studentId: string): Promise<Attendance[]> {
  return fetchAll((a, b) =>
    db.from('attendance').select('*').eq('student_id', studentId).order('date', { ascending: false }).order('id').range(a, b),
  )
}

export async function markAttendanceBatch(db: Db, marks: readonly AttendanceMark[]): Promise<void> {
  for (const part of chunk(marks, 500)) {
    unwrap(await db.rpc('mark_attendance_batch', { p_items: part as unknown as never }))
  }
}

export async function addWalkIns(
  db: Db,
  input: { student_ids: string[]; date: string; location: string; source?: AttendanceSource },
): Promise<number> {
  return unwrap(
    await db.rpc('add_walk_ins', {
      p_student_ids: input.student_ids,
      p_date: input.date,
      p_location: input.location,
      ...(input.source ? { p_source: input.source } : {}),
    }),
  )
}

export async function listWalkInLocations(db: Db): Promise<string[]> {
  const rows = unwrap(await db.rpc('walk_in_locations'))
  return rows.map((r) => r.location_label)
}

/** Corrige o status de um registro existente (ex.: avulsa lançada errada vira falta). */
export async function setAttendanceStatus(db: Db, id: string, status: AttendanceStatus): Promise<void> {
  unwrap(await db.from('attendance').update({ status, marked_at: new Date().toISOString() }).eq('id', id))
}
