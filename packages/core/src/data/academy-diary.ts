// Diários de aula do sistema da academia: grade por turma, aulas, chamada, fotos e rostos.
// Chamada, fotos e rostos usam as mesmas funções do app do professor (`attendance`, `photos`, `faces`): o banco libera a
// equipe da academia por policies próprias (migration academy_diary), então aqui só entra o que é novo.

import type { GroupMembership } from '../domain/diary'
import type { ClassRow, ClassSchedule, Db, Student, StudentProgress } from '../types'
import { PHOTO_BUCKET } from './photos'
import { fetchAll, unwrap } from './util'

/** Gera as aulas da grade da academia entre duas datas (idempotente; no máximo 92 dias por vez). */
export async function ensureAcademyClasses(db: Db, gymId: string, from: string, to: string): Promise<number> {
  return unwrap(await db.rpc('ensure_academy_classes', { p_gym_id: gymId, p_from: from, p_to: to }))
}

export async function listAcademyClasses(db: Db, gymId: string, from: string, to: string): Promise<ClassRow[]> {
  return fetchAll((a, b) =>
    db
      .from('classes')
      .select('*')
      .eq('gym_id', gymId)
      .gte('date', from)
      .lte('date', to)
      .order('date')
      .order('start_time', { nullsFirst: false })
      .order('id')
      .range(a, b),
  )
}

export async function getAcademyClass(db: Db, id: string): Promise<ClassRow | null> {
  return unwrap(await db.from('classes').select('*').eq('id', id).maybeSingle())
}

export interface AcademyClassInput {
  gym_id: string
  group_id: string | null
  date: string
  start_time: string | null
  title: string
  /** Quem dá a aula; sem isto vale quem está logado. */
  instructor_id?: string
}

/** Aula avulsa (fora da grade): aulão, reposição, aula extra. */
export async function createAcademyClass(db: Db, input: AcademyClassInput): Promise<ClassRow> {
  return unwrap(
    await db
      .from('classes')
      .insert({
        gym_id: input.gym_id,
        group_id: input.group_id,
        date: input.date,
        start_time: input.start_time || null,
        title: input.title.trim(),
        ...(input.instructor_id ? { instructor_id: input.instructor_id } : {}),
      })
      .select()
      .single(),
  )
}

/**
 * Apaga uma aula avulsa (fora da grade) que não vai acontecer, com a chamada, as fotos e os rostos dela.
 * Aula da grade não se apaga (o banco recusa): nela vale "Não houve aula". Os arquivos das fotos saem do Storage em seguida.
 */
export async function deleteAcademyClass(db: Db, classId: string): Promise<void> {
  const paths = unwrap(await db.rpc('delete_academy_class', { p_class_id: classId })) ?? []
  // A aula já foi apagada; se algum arquivo sobrar no Storage, ele não aparece em lugar nenhum.
  if (paths.length > 0) await db.storage.from(PHOTO_BUCKET).remove(paths)
}

/** Conclui a chamada: quem é da turma (ou todos, sem turma) e não foi marcado vira falta; a aula passa a concluída. */
export async function concludeAcademyClass(db: Db, classId: string): Promise<void> {
  unwrap(await db.rpc('conclude_academy_class', { p_class_id: classId }))
}

/** Alunos ativos da academia, com o que o reconhecimento facial precisa (consentimento de imagem). */
export async function listDiaryStudents(db: Db, gymId: string): Promise<Student[]> {
  return fetchAll((a, b) => db.from('students').select('*').eq('gym_id', gymId).order('name').order('id').range(a, b))
}

/** Quem está (ou esteve) em cada turma, com as datas. */
export async function listGroupMemberships(db: Db, gymId: string): Promise<GroupMembership[]> {
  return fetchAll((a, b) =>
    db.from('class_group_members').select('group_id, student_id, joined_on, left_on').eq('gym_id', gymId).order('student_id').order('group_id').range(a, b),
  )
}

// ── grade ─────────────────────────────────────────────────────────────────────

export async function listAcademySchedules(db: Db, gymId: string): Promise<ClassSchedule[]> {
  return unwrap(await db.from('class_schedules').select('*').eq('gym_id', gymId).order('weekday').order('start_time'))
}

export interface AcademyScheduleInput {
  group_id: string | null
  weekday: number
  start_time: string
  title: string
  starts_on: string
  ends_on: string | null
  instructor_id?: string
}

/** Cria ou atualiza um horário da grade. Só o administrador (RLS). As aulas dele são geradas por `ensureAcademyClasses`. */
export async function saveAcademySchedule(db: Db, gymId: string, id: string | null, input: AcademyScheduleInput): Promise<void> {
  const row = {
    group_id: input.group_id,
    weekday: input.weekday,
    start_time: input.start_time,
    title: input.title.trim(),
    starts_on: input.starts_on,
    ends_on: input.ends_on,
    ...(input.instructor_id ? { instructor_id: input.instructor_id } : {}),
  }
  if (id) unwrap(await db.from('class_schedules').update(row).eq('id', id).eq('gym_id', gymId))
  else unwrap(await db.from('class_schedules').insert({ gym_id: gymId, ...row }))
}

/** Encerra o horário: some da grade e não gera mais aulas (as já geradas continuam). */
export async function setAcademyScheduleActive(db: Db, id: string, active: boolean): Promise<void> {
  unwrap(await db.from('class_schedules').update({ active }).eq('id', id))
}

// ── uso de imagem e reconhecimento facial ─────────────────────────────────────

/**
 * Na academia com gestão o contrato de matrícula já autoriza o reconhecimento facial de todos os alunos; quem pedir para
 * não ser reconhecido fica de fora. Marcar apaga na hora os dados do rosto do aluno (as presenças continuam).
 */
export async function setStudentFaceOptOut(db: Db, studentId: string, optOut: boolean): Promise<void> {
  unwrap(await db.from('students').update({ face_opt_out_at: optOut ? new Date().toISOString() : null }).eq('id', studentId))
}

/** Presenças e treinos desde a última graduação de muay thai (view `student_progress`). */
export async function getStudentProgress(db: Db, studentId: string): Promise<StudentProgress | null> {
  return unwrap(await db.from('student_progress').select('*').eq('student_id', studentId).maybeSingle()) as StudentProgress | null
}

/**
 * Registra (ou retira) a autorização de uso de imagem e reconhecimento facial do aluno. Só o administrador (RLS).
 * Retirar apaga na hora os dados do rosto do aluno (trigger `students_forget_face`); as presenças continuam.
 * Para menor de idade o banco só aceita com o termo do responsável enviado (app do professor).
 */
export async function setStudentImageConsent(db: Db, studentId: string, authorized: boolean): Promise<void> {
  unwrap(await db.from('students').update({ image_consent_at: authorized ? new Date().toISOString() : null }).eq('id', studentId))
}
