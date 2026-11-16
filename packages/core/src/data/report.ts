import type { ReportAttendance, ReportClass } from '../domain/report'
import type { Db } from '../types'
import { fetchAll } from './util'

export interface ReportData {
  attendance: ReportAttendance[]
  classes: ReportClass[]
  graduations: { student_id: string; graduated_at: string }[]
}

/** Linhas que o relatório precisa entre `from` e `to` (todas as academias; o filtro é feito no cliente). */
export async function getReportData(db: Db, from: string, to: string): Promise<ReportData> {
  const [attendance, classes, graduations] = await Promise.all([
    fetchAll((a, b) =>
      db.from('attendance').select('student_id, gym_id, class_id, date, status, credits').gte('date', from).lte('date', to).order('date').order('id').range(a, b),
    ),
    fetchAll((a, b) => db.from('classes').select('id, gym_id, date, status').gte('date', from).lte('date', to).order('date').order('id').range(a, b)),
    fetchAll((a, b) =>
      db.from('student_graduations').select('student_id, graduated_at').gte('graduated_at', from).lte('graduated_at', to).order('graduated_at').order('id').range(a, b),
    ),
  ])
  return { attendance, classes, graduations }
}
