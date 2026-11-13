import type { Json } from '../database.types'
import type { ClassRow, ClassStatus, Db, LessonPlan } from '../types'
import { chunk, fetchAll, unwrap } from './util'

/** Gera as aulas da grade até hoje (idempotente). Falha de rede é tolerada por quem chama. */
export async function ensureClasses(db: Db): Promise<number> {
  return unwrap(await db.rpc('ensure_classes'))
}

export async function listClassesByDate(db: Db, date: string): Promise<ClassRow[]> {
  return unwrap(await db.from('classes').select('*').eq('date', date).neq('status', 'cancelled').order('start_time'))
}

/** Aulas passadas com chamada em aberto, da mais antiga para a mais nova. */
export async function listPendingClasses(db: Db, today: string): Promise<ClassRow[]> {
  return unwrap(
    await db.from('classes').select('*').eq('status', 'scheduled').lt('date', today).order('date').order('start_time'),
  )
}

export async function listClassesRange(db: Db, gymId: string | null, from: string, to: string): Promise<ClassRow[]> {
  return fetchAll((a, b) => {
    let q = db.from('classes').select('*').gte('date', from).lte('date', to)
    if (gymId) q = q.eq('gym_id', gymId)
    return q.order('date', { ascending: false }).order('start_time', { ascending: false }).range(a, b)
  })
}

export async function getClass(db: Db, id: string): Promise<ClassRow | null> {
  return unwrap(await db.from('classes').select('*').eq('id', id).maybeSingle())
}

export async function createClass(
  db: Db,
  input: { gym_id: string; date: string; start_time?: string | null; title?: string; status?: ClassStatus },
): Promise<ClassRow> {
  return unwrap(await db.from('classes').insert(input).select().single())
}

export async function setClassStatus(db: Db, id: string, status: ClassStatus): Promise<void> {
  unwrap(await db.from('classes').update({ status }).eq('id', id))
}

export async function concludeClass(db: Db, classId: string): Promise<void> {
  unwrap(await db.rpc('conclude_class', { p_class_id: classId }))
}

/** Presentes (presença + atraso) por aula, para listas. */
export async function countPresentByClass(db: Db, classIds: readonly string[]): Promise<Record<string, number>> {
  const counts: Record<string, number> = {}
  for (const ids of chunk(classIds, 100)) {
    const rows = await fetchAll((a, b) =>
      db.from('attendance').select('class_id').in('class_id', ids).in('status', ['present', 'late']).order('id').range(a, b),
    )
    for (const r of rows) if (r.class_id) counts[r.class_id] = (counts[r.class_id] ?? 0) + 1
  }
  return counts
}

export async function getLessonPlan(db: Db, classId: string): Promise<LessonPlan | null> {
  return unwrap(await db.from('lesson_plans').select('*').eq('class_id', classId).maybeSingle())
}

export async function saveLessonPlan(db: Db, classId: string, content: Json, updatedAt: string): Promise<void> {
  unwrap(
    await db.from('lesson_plans').upsert({ class_id: classId, content, updated_at: updatedAt }, { onConflict: 'class_id' }),
  )
}
