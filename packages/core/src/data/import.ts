import { type ImportPlan, normalizeName } from '../domain/import'
import type { Db } from '../types'
import { type AttendanceMark, markAttendanceBatch } from './attendance'
import { listClassesRange } from './classes'
import { createStudents, listStudents } from './students'
import { unwrap } from './util'

export interface ImportOutcome {
  studentsCreated: number
  classesCreated: number
  attendanceWritten: number
}

/**
 * Grava um plano de importação numa academia. Pode ser repetido sem duplicar:
 * alunos e aulas são casados por nome/data e as presenças entram por upsert.
 * marked_at fica à meia-noite do dia da aula, então uma marcação manual já existente nunca é sobrescrita.
 */
export async function runImport(db: Db, gymId: string, plan: ImportPlan): Promise<ImportOutcome> {
  if (plan.records.length === 0 || !plan.dateRange) return { studentsCreated: 0, classesCreated: 0, attendanceWritten: 0 }

  const existing = (await listStudents(db)).filter((s) => s.gym_id === gymId)
  const byName = new Map(existing.map((s) => [normalizeName(s.name), s.id]))
  const missing = plan.newStudents.filter((n) => !byName.has(normalizeName(n)))
  for (const s of await createStudents(db, gymId, missing)) byName.set(normalizeName(s.name), s.id)

  const classes = (await listClassesRange(db, gymId, plan.dateRange.from, plan.dateRange.to)).filter(
    (c) => c.status !== 'cancelled',
  )
  const byDate = new Map<string, string>()
  // Mais de uma aula no mesmo dia: usa a primeira (mais cedo).
  for (const c of [...classes].sort((a, b) => (a.start_time ?? '').localeCompare(b.start_time ?? ''))) {
    if (!byDate.has(c.date)) byDate.set(c.date, c.id)
  }
  const missingDates = [...new Set(plan.records.map((r) => r.date))].filter((d) => !byDate.has(d))
  if (missingDates.length > 0) {
    const created = unwrap(
      await db
        .from('classes')
        .insert(missingDates.map((date) => ({ gym_id: gymId, date, title: 'Importado', status: 'done' as const })))
        .select(),
    )
    for (const c of created) byDate.set(c.date, c.id)
  }

  const marks: AttendanceMark[] = []
  for (const r of plan.records) {
    const student_id = byName.get(normalizeName(r.studentName))
    const class_id = byDate.get(r.date)
    if (student_id && class_id) {
      marks.push({ class_id, student_id, status: r.status, source: 'import', marked_at: `${r.date}T00:00:00-03:00` })
    }
  }
  await markAttendanceBatch(db, marks)
  return { studentsCreated: missing.length, classesCreated: missingDates.length, attendanceWritten: marks.length }
}
