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
export type AttendanceReminder = Row<'attendance_reminders'>
export type LessonPlanReminder = Row<'lesson_plan_reminders'>
export type StudentClassReminder = Row<'student_class_reminders'>
export type GuardianConsent = Row<'student_guardian_consents'>
/** Linha de student_progress. O Postgres reporta colunas de view como anuláveis; aqui só as que de fato podem ser nulas. */
export interface StudentProgress {
  student_id: string
  gym_id: string
  current_rank_id: string | null
  last_graduated_at: string | null
  attendance_since: number
  attendance_total: number
  last_attendance_on: string | null
  /** Aulas do período (presenças + faltas) desde a última graduação. */
  classes_since: number
}

export type AttendanceStatus = Enum<'attendance_status'>
export type AttendanceSource = Enum<'attendance_source'>
export type ClassStatus = Enum<'class_status'>

/** Presença e atraso contam para graduação; falta (justificada ou não) não conta. */
export const COUNTED_STATUSES: readonly AttendanceStatus[] = ['present', 'late']
export const isCounted = (s: AttendanceStatus) => s === 'present' || s === 'late'

/** Período da presença avulsa: permite mais de uma avulsa no mesmo dia e local. '' = sem período. */
export const WALK_IN_PERIODS = ['manha', 'tarde', 'noite'] as const
export type WalkInPeriod = (typeof WALK_IN_PERIODS)[number]
export const PERIOD_LABEL: Record<WalkInPeriod, string> = { manha: 'Manhã', tarde: 'Tarde', noite: 'Noite' }

/** Local da avulsa com o período, ex.: "Matriz · manhã". */
export function walkInLabel(a: { location_label: string | null; walk_in_period?: string | null }): string {
  const period = PERIOD_LABEL[a.walk_in_period as WalkInPeriod]
  return [a.location_label ?? 'Outro local', period?.toLowerCase()].filter(Boolean).join(' · ')
}

export const STATUS_LABEL: Record<AttendanceStatus, string> = {
  present: 'Presente',
  absent: 'Falta',
  late: 'Atraso',
  justified: 'Justificada',
}
