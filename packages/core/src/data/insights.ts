import type { AbsenceStreak, ClassTurnout } from '../domain/insights'
import type { Db } from '../types'
import { fetchAll, unwrap } from './util'

/** Faltas seguidas de cada aluno ativo (view student_absence_streaks). */
export async function listAbsenceStreaks(db: Db): Promise<AbsenceStreak[]> {
  const rows = await fetchAll((from, to) =>
    db.from('student_absence_streaks').select('*').order('student_id').range(from, to),
  )
  return rows as AbsenceStreak[]
}

/** Presentes por aula concluída (view class_turnout). */
export async function listClassTurnout(db: Db): Promise<ClassTurnout[]> {
  const rows = await fetchAll((from, to) =>
    db.from('class_turnout').select('class_id, gym_id, date, present').order('date').order('class_id').range(from, to),
  )
  return rows as ClassTurnout[]
}

export async function updateAbsenceThreshold(db: Db, userId: string, threshold: number): Promise<void> {
  unwrap(await db.from('profiles').update({ absence_alert_threshold: threshold }).eq('id', userId))
}
