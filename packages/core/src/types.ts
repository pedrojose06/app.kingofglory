import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

export type Db = SupabaseClient<Database>

type Public = Database['public']
export type Row<T extends keyof Public['Tables']> = Public['Tables'][T]['Row']
export type Insert<T extends keyof Public['Tables']> = Public['Tables'][T]['Insert']
export type Update<T extends keyof Public['Tables']> = Public['Tables'][T]['Update']
export type Enum<T extends keyof Public['Enums']> = Public['Enums'][T]

export type Profile = Row<'profiles'>
export type Gym = Row<'gyms'>
export type Student = Row<'students'>
export type Rank = Row<'ranks'>
export type Graduation = Row<'student_graduations'>
export type ClassSchedule = Row<'class_schedules'>
export type ClassRow = Row<'classes'>
export type LessonPlan = Row<'lesson_plans'>
export type Attendance = Row<'attendance'>
export type ClassPhoto = Row<'class_photos'>
/** Linha de student_progress. O Postgres reporta colunas de view como anuláveis; aqui só as que de fato podem ser nulas. */
export interface StudentProgress {
  student_id: string
  gym_id: string
  current_rank_id: string | null
  last_graduated_at: string | null
  attendance_since: number
  attendance_total: number
  last_attendance_on: string | null
}

export type AttendanceStatus = Enum<'attendance_status'>
export type AttendanceSource = Enum<'attendance_source'>
export type ClassStatus = Enum<'class_status'>

/** Presença e atraso contam para graduação; falta (justificada ou não) não conta. */
export const COUNTED_STATUSES: readonly AttendanceStatus[] = ['present', 'late']
export const isCounted = (s: AttendanceStatus) => s === 'present' || s === 'late'

export const STATUS_LABEL: Record<AttendanceStatus, string> = {
  present: 'Presente',
  absent: 'Falta',
  late: 'Atraso',
  justified: 'Justificada',
}
