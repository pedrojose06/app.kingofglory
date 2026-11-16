import { isCounted, type Attendance } from '../types'

export interface AttendanceStats {
  total: number
  absences: number
  byMonth: { month: string; count: number }[]
  byLocation: { location: string; count: number }[]
}

/** Totais de presença de um aluno. `gymName` rotula as presenças em aula normal. */
export function attendanceStats(
  rows: readonly Pick<Attendance, 'status' | 'date' | 'class_id' | 'location_label'>[],
  gymName: string,
): AttendanceStats {
  const months = new Map<string, number>()
  const locations = new Map<string, number>()
  let total = 0
  let absences = 0
  for (const r of rows) {
    if (!isCounted(r.status)) {
      absences += 1
      continue
    }
    total += 1
    const month = r.date.slice(0, 7)
    months.set(month, (months.get(month) ?? 0) + 1)
    const location = r.class_id ? gymName : (r.location_label ?? 'Outro local')
    locations.set(location, (locations.get(location) ?? 0) + 1)
  }
  return {
    total,
    absences,
    byMonth: [...months].map(([month, count]) => ({ month, count })).sort((a, b) => b.month.localeCompare(a.month)),
    byLocation: [...locations].map(([location, count]) => ({ location, count })).sort((a, b) => b.count - a.count),
  }
}
