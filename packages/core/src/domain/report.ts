// Relatório de frequência de um período: números gerais, evolução mensal, ranking de assiduidade,
// alunos que não treinaram e comparativo entre academias. Tudo calculado no cliente a partir das linhas.

import { addDays, parseISODate } from '../dates'
import { isCounted, type Attendance, type ClassRow, type Student } from '../types'

export type ReportAttendance = Pick<Attendance, 'student_id' | 'gym_id' | 'class_id' | 'date' | 'status'> & { credits?: number | null }
export type ReportClass = Pick<ClassRow, 'id' | 'gym_id' | 'date' | 'status'>
export type ReportStudent = Pick<Student, 'id' | 'gym_id' | 'name' | 'active' | 'started_on'>

export interface ReportInput {
  /** Período do relatório (inclusive). */
  from: string
  to: string
  /** Presenças e aulas de pelo menos os 12 meses que terminam no mês de `to` (para a evolução mensal). */
  attendance: readonly ReportAttendance[]
  classes: readonly ReportClass[]
  students: readonly ReportStudent[]
  /** Graduações registradas (qualquer data; o relatório filtra pelo período). */
  graduations: readonly { student_id: string; graduated_at: string }[]
  /** null = todas as academias. */
  gymId: string | null
  today: string
}

export interface StudentRow {
  studentId: string
  gymId: string
  name: string
  /** Presenças somando o valor de cada uma (aulão = 2). */
  presences: number
  absences: number
  /** Presenças ÷ (presenças + faltas) em registros, 0–1; null sem chamada no período. */
  rate: number | null
}

export interface GymRow {
  gymId: string
  classes: number
  presences: number
  /** Média de presentes por aula concluída da academia. */
  perClass: number
  activeStudents: number
  trainedStudents: number
}

export interface MonthRow {
  month: string
  presences: number
  classes: number
}

export interface Report {
  /** Aulas concluídas no período. */
  classes: number
  presences: number
  perClass: number
  rate: number | null
  activeStudents: number
  /** Alunos ativos com ao menos uma presença no período. */
  trainedStudents: number
  newStudents: ReportStudent[]
  graduations: number
  ranking: StudentRow[]
  /** Alunos ativos (já matriculados no período) sem nenhuma presença nele. */
  missing: ReportStudent[]
  byGym: GymRow[]
  monthly: MonthRow[]
}

/** Primeiro e último dia dos `months` meses que terminam em `endMonth` ('YYYY-MM'). */
export function monthRange(endMonth: string, months: number): { from: string; to: string } {
  const start = parseISODate(`${endMonth}-01`)
  start.setUTCMonth(start.getUTCMonth() - (months - 1))
  const next = parseISODate(`${endMonth}-01`)
  next.setUTCMonth(next.getUTCMonth() + 1)
  return { from: start.toISOString().slice(0, 10), to: addDays(next.toISOString().slice(0, 10), -1) }
}

export function shiftMonth(ym: string, delta: number): string {
  const d = parseISODate(`${ym}-01`)
  d.setUTCMonth(d.getUTCMonth() + delta)
  return d.toISOString().slice(0, 7)
}

const credit = (a: ReportAttendance) => a.credits ?? 1

export function buildReport(input: ReportInput): Report {
  const { from, gymId, today } = input
  const to = input.to < today ? input.to : today
  const inGym = (g: string) => gymId === null || g === gymId

  const students = input.students.filter((s) => inGym(s.gym_id))
  const studentById = new Map(students.map((s) => [s.id, s]))
  // Ativos que já tinham começado até o fim do período.
  const active = students.filter((s) => s.active && s.started_on <= to)

  const doneClasses = input.classes.filter((c) => c.status === 'done' && c.date <= today && inGym(c.gym_id))
  const doneIds = new Set(doneClasses.map((c) => c.id))
  const periodClasses = doneClasses.filter((c) => c.date >= from && c.date <= to)

  // Presenças de alunos do filtro; em aula, só conta aula concluída (aula em aberto ainda pode mudar).
  const attendance = input.attendance.filter(
    (a) => studentById.has(a.student_id) && (a.class_id === null || doneIds.has(a.class_id)),
  )
  const period = attendance.filter((a) => a.date >= from && a.date <= to)

  const perStudent = new Map<string, { presences: number; present: number; absences: number }>()
  let presences = 0
  let countedRecords = 0
  let absentRecords = 0
  for (const a of period) {
    const row = perStudent.get(a.student_id) ?? { presences: 0, present: 0, absences: 0 }
    if (isCounted(a.status)) {
      row.presences += credit(a)
      row.present += 1
      presences += credit(a)
      countedRecords += 1
    } else if (a.status === 'absent') {
      row.absences += 1
      absentRecords += 1
    }
    perStudent.set(a.student_id, row)
  }

  const ranking: StudentRow[] = [...perStudent]
    .filter(([, r]) => r.presences > 0)
    .map(([id, r]) => {
      const s = studentById.get(id)!
      const records = r.present + r.absences
      return { studentId: id, gymId: s.gym_id, name: s.name, presences: r.presences, absences: r.absences, rate: records ? r.present / records : null }
    })
    .sort((a, b) => b.presences - a.presences || (b.rate ?? 0) - (a.rate ?? 0) || a.name.localeCompare(b.name, 'pt-BR'))

  const trained = new Set(ranking.map((r) => r.studentId))
  const missing = active.filter((s) => !trained.has(s.id)).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))

  const classPresences = (ids: Set<string>) =>
    period.filter((a) => a.class_id !== null && ids.has(a.class_id) && isCounted(a.status)).reduce((s, a) => s + credit(a), 0)

  const periodIds = new Set(periodClasses.map((c) => c.id))
  const gymIds = [...new Set([...students.map((s) => s.gym_id), ...periodClasses.map((c) => c.gym_id)])]
  const byGym: GymRow[] = gymIds
    .map((g) => {
      const ids = new Set(periodClasses.filter((c) => c.gym_id === g).map((c) => c.id))
      const gymActive = active.filter((s) => s.gym_id === g)
      return {
        gymId: g,
        classes: ids.size,
        presences: ranking.filter((r) => r.gymId === g).reduce((s, r) => s + r.presences, 0),
        perClass: ids.size ? classPresences(ids) / ids.size : 0,
        activeStudents: gymActive.length,
        trainedStudents: gymActive.filter((s) => trained.has(s.id)).length,
      }
    })
    .sort((a, b) => b.presences - a.presences)

  const endMonth = to.slice(0, 7)
  const monthly: MonthRow[] = Array.from({ length: 12 }, (_, i) => shiftMonth(endMonth, i - 11)).map((month) => ({
    month,
    presences: attendance.filter((a) => a.date.startsWith(month) && a.date <= today && isCounted(a.status)).reduce((s, a) => s + credit(a), 0),
    classes: doneClasses.filter((c) => c.date.startsWith(month)).length,
  }))

  const graduations = input.graduations.filter(
    (g) => studentById.has(g.student_id) && g.graduated_at >= from && g.graduated_at <= to,
  ).length

  // Matrículas registradas antes do app usam a data de início real; só conta como novo quem começou no período.
  const newStudents = students
    .filter((s) => s.started_on >= from && s.started_on <= to)
    .sort((a, b) => b.started_on.localeCompare(a.started_on))

  return {
    classes: periodClasses.length,
    presences,
    perClass: periodIds.size ? classPresences(periodIds) / periodIds.size : 0,
    rate: countedRecords + absentRecords ? countedRecords / (countedRecords + absentRecords) : null,
    activeStudents: active.length,
    trainedStudents: active.filter((s) => trained.has(s.id)).length,
    newStudents,
    graduations,
    ranking,
    missing,
    byGym,
    monthly,
  }
}
