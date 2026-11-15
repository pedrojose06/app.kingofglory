import { addDays, weekdayOf } from '../dates'
import type { ClassRow, ClassSchedule } from '../types'

/** Uma aula dos próximos dias: já existe em `classes` (klass) ou ainda só na grade (schedule). */
export interface UpcomingClass {
  key: string
  date: string
  start_time: string | null
  title: string
  gym_id: string
  klass: ClassRow | null
  schedule: ClassSchedule | null
}

/**
 * Aulas de `from` até `from + days - 1`: as da grade (geradas ou não) e as extras já criadas.
 * Aula cancelada fica de fora. Permite abrir o plano de uma aula antes de ela ser gerada.
 */
export function upcomingClasses(
  schedules: readonly ClassSchedule[],
  existing: readonly ClassRow[],
  from: string,
  days: number,
): UpcomingClass[] {
  const to = addDays(from, days - 1)
  const bySlot = new Map(existing.filter((c) => c.schedule_id).map((c) => [`${c.schedule_id}|${c.date}`, c]))
  const out: UpcomingClass[] = []

  for (let i = 0; i < days; i++) {
    const date = addDays(from, i)
    const weekday = weekdayOf(date)
    for (const s of schedules) {
      if (!s.active || s.weekday !== weekday || s.starts_on > date || (s.ends_on !== null && s.ends_on < date)) continue
      const klass = bySlot.get(`${s.id}|${date}`) ?? null
      if (klass?.status === 'cancelled') continue
      out.push({
        key: klass?.id ?? `${s.id}|${date}`,
        date,
        start_time: klass?.start_time ?? s.start_time,
        title: klass?.title ?? s.title,
        gym_id: s.gym_id,
        klass,
        schedule: s,
      })
    }
  }
  for (const c of existing) {
    if (c.schedule_id || c.status === 'cancelled' || c.date < from || c.date > to) continue
    out.push({ key: c.id, date: c.date, start_time: c.start_time, title: c.title, gym_id: c.gym_id, klass: c, schedule: null })
  }

  return out.sort((a, b) => a.date.localeCompare(b.date) || (a.start_time ?? '99').localeCompare(b.start_time ?? '99'))
}

/** O plano tem algum texto (documento do editor Tiptap). Mesma regra do lembrete do plano no banco. */
export function planHasContent(content: unknown): boolean {
  if (!content || typeof content !== 'object') return false
  if (Array.isArray(content)) return content.some(planHasContent)
  const node = content as { type?: unknown; text?: unknown; content?: unknown }
  if (node.type === 'text' && typeof node.text === 'string' && /\S/.test(node.text)) return true
  return planHasContent(node.content)
}
