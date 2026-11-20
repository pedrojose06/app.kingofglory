import type { GymInput, ScheduleInput } from '../schemas'
import type { ClassSchedule, Db, Gym, Profile } from '../types'
import { unwrap } from './util'

export async function getProfile(db: Db, userId: string): Promise<Profile | null> {
  return unwrap(await db.from('profiles').select('*').eq('id', userId).maybeSingle())
}

export async function updateProfileName(db: Db, userId: string, name: string): Promise<void> {
  unwrap(await db.from('profiles').update({ name }).eq('id', userId))
}

export async function listGyms(db: Db): Promise<Gym[]> {
  return unwrap(await db.from('gyms').select('*').order('name'))
}

export async function createGym(db: Db, input: GymInput): Promise<Gym> {
  return unwrap(await db.from('gyms').insert({ name: input.name, address: input.address ?? null }).select().single())
}

export async function updateGym(db: Db, id: string, input: GymInput): Promise<void> {
  unwrap(await db.from('gyms').update({ name: input.name, address: input.address ?? null }).eq('id', id))
}

/** Desde quando o professor dá aula em cada academia: id da academia → data (ou null se não informada). */
export async function listMyGymStarts(db: Db, userId: string): Promise<Record<string, string | null>> {
  const rows = unwrap(await db.from('gym_instructors').select('gym_id, started_on').eq('profile_id', userId))
  return Object.fromEntries(rows.map((r) => [r.gym_id, r.started_on]))
}

/** Corrige a data em que o próprio professor começou a dar aula na academia. Não mexe na grade nem nas aulas. */
export async function setMyGymStart(db: Db, gymId: string, startedOn: string | null): Promise<void> {
  unwrap(await db.rpc('set_my_gym_start', { p_gym_id: gymId, p_started_on: startedOn }))
}

export async function listSchedules(db: Db): Promise<ClassSchedule[]> {
  return unwrap(
    await db.from('class_schedules').select('*').eq('active', true).order('weekday').order('start_time'),
  )
}

export async function createSchedule(db: Db, input: ScheduleInput): Promise<ClassSchedule> {
  return unwrap(await db.from('class_schedules').insert(input).select().single())
}

/**
 * Muda horário e nome de um horário da grade, mantendo o histórico ligado a ele.
 * Aulas ainda não dadas (a partir de hoje) acompanham a mudança; as passadas guardam o horário em que aconteceram.
 */
export async function updateSchedule(
  db: Db,
  id: string,
  input: { start_time: string; title: string },
  today: string,
): Promise<void> {
  unwrap(await db.from('class_schedules').update(input).eq('id', id))
  unwrap(
    await db.from('classes').update(input).eq('schedule_id', id).eq('status', 'scheduled').gte('date', today),
  )
}

/**
 * Corrige a data de início do horário. Mais cedo: as aulas desde a nova data passam a ser geradas (entram em
 * Pendências). Mais tarde: as aulas vazias (sem chamada, presença, foto ou plano) antes da nova data são removidas.
 * Devolve quantas aulas foram removidas.
 */
export async function setScheduleStart(db: Db, id: string, startsOn: string): Promise<number> {
  return unwrap(await db.rpc('set_schedule_start', { p_schedule_id: id, p_starts_on: startsOn })) ?? 0
}

/** Encerra o horário: as aulas já dadas (e suas presenças) continuam existindo. */
export async function endSchedule(db: Db, id: string, today: string): Promise<void> {
  unwrap(await db.from('class_schedules').update({ active: false, ends_on: today }).eq('id', id))
  // Aulas futuras já criadas antes (para adiantar o plano) deixam de acontecer.
  unwrap(await db.from('classes').update({ status: 'cancelled' }).eq('schedule_id', id).eq('status', 'scheduled').gt('date', today))
}
