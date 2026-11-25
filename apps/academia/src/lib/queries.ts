'use client'

import {
  countPresentByClass, ensureAcademyClasses, getAcademyClass, getAcademyStudent, getGraduationSchedule, getStudentProgress, listAcademyClasses, listAcademyMembers,
  listAcademySchedules, listAcademyStudents, listBeltRanks, listClassAttendance, listClassGroups, listClassPhotos, listDiaryStudents,
  listFaceReferences, listGroupMemberships, listModalities, listPayers, listPlans, listRanks, listStudentCharges, listStudentContracts,
} from '@kog/core'
import { useQuery } from '@tanstack/react-query'
import { academyKeys, useAcademy } from './academy'
import { db } from './supabase'

/** Chaves do cache do sistema da academia. Tudo começa com ['academia', gymId] para invalidar por academia. */
export const keys = {
  all: (gymId: string) => ['academia', gymId] as const,
  students: (gymId: string) => ['academia', gymId, 'alunos'] as const,
  student: (gymId: string, id: string) => ['academia', gymId, 'aluno', id] as const,
  studentProgress: (gymId: string, id: string) => ['academia', gymId, 'aluno', id, 'progresso'] as const,
  studentContracts: (gymId: string, id: string) => ['academia', gymId, 'aluno', id, 'contratos'] as const,
  studentCharges: (gymId: string, id: string) => ['academia', gymId, 'aluno', id, 'cobrancas'] as const,
  modalities: (gymId: string) => ['academia', gymId, 'modalidades'] as const,
  groups: (gymId: string) => ['academia', gymId, 'turmas'] as const,
  payers: (gymId: string) => ['academia', gymId, 'pagadores'] as const,
  plans: (gymId: string) => ['academia', gymId, 'planos'] as const,
  classes: (gymId: string, from: string, to: string) => ['academia', gymId, 'aulas', from, to] as const,
  classCounts: (gymId: string, ids: readonly string[]) => ['academia', gymId, 'aulas', 'presentes', [...ids].sort().join(',')] as const,
  klass: (gymId: string, id: string) => ['academia', gymId, 'aula', id] as const,
  classAttendance: (gymId: string, id: string) => ['academia', gymId, 'aula', id, 'presencas'] as const,
  classPhotos: (gymId: string, id: string) => ['academia', gymId, 'aula', id, 'fotos'] as const,
  schedules: (gymId: string) => ['academia', gymId, 'grade'] as const,
  diaryStudents: (gymId: string) => ['academia', gymId, 'diario', 'alunos'] as const,
  memberships: (gymId: string) => ['academia', gymId, 'diario', 'turmas-alunos'] as const,
  faceRefs: (gymId: string) => ['academia', gymId, 'diario', 'rostos'] as const,
}

export function useStudents() {
  const { academy } = useAcademy()
  return useQuery({ queryKey: keys.students(academy.gym_id), queryFn: () => listAcademyStudents(db(), academy.gym_id) })
}

export function useStudent(id: string) {
  const { academy } = useAcademy()
  return useQuery({ queryKey: keys.student(academy.gym_id, id), queryFn: () => getAcademyStudent(db(), id), enabled: Boolean(id) })
}

/** Presenças do aluno e treinos desde a última graduação. */
export function useStudentProgress(id: string) {
  const { academy } = useAcademy()
  return useQuery({ queryKey: keys.studentProgress(academy.gym_id, id), queryFn: () => getStudentProgress(db(), id), enabled: Boolean(id) })
}

/** Datas marcadas da próxima graduação da equipe (adulto e infantil). */
export function useGraduationSchedule() {
  return useQuery({ queryKey: ['academia', 'graduacao-marcada'], queryFn: () => getGraduationSchedule(db()), staleTime: 3_600_000 })
}

export function useStudentContracts(id: string) {
  const { academy, isAdmin } = useAcademy()
  return useQuery({
    queryKey: keys.studentContracts(academy.gym_id, id),
    queryFn: () => listStudentContracts(db(), id),
    enabled: Boolean(id) && isAdmin,
  })
}

export function useStudentCharges(id: string) {
  const { academy, isAdmin } = useAcademy()
  return useQuery({
    queryKey: keys.studentCharges(academy.gym_id, id),
    queryFn: () => listStudentCharges(db(), id),
    enabled: Boolean(id) && isAdmin,
  })
}

export function useModalities() {
  const { academy } = useAcademy()
  return useQuery({ queryKey: keys.modalities(academy.gym_id), queryFn: () => listModalities(db(), academy.gym_id) })
}

export function useClassGroups() {
  const { academy } = useAcademy()
  return useQuery({ queryKey: keys.groups(academy.gym_id), queryFn: () => listClassGroups(db(), academy.gym_id) })
}

export function usePayers() {
  const { academy, isAdmin } = useAcademy()
  return useQuery({ queryKey: keys.payers(academy.gym_id), queryFn: () => listPayers(db(), academy.gym_id), enabled: isAdmin })
}

export function usePlans() {
  const { academy } = useAcademy()
  return useQuery({ queryKey: keys.plans(academy.gym_id), queryFn: () => listPlans(db(), academy.gym_id) })
}

export function useRanks() {
  return useQuery({ queryKey: ['academia', 'graus'], queryFn: () => listRanks(db()), staleTime: 3_600_000 })
}

export function useBeltRanks() {
  return useQuery({ queryKey: ['academia', 'faixas'], queryFn: () => listBeltRanks(db()), staleTime: 3_600_000 })
}

// ── diários de aula ───────────────────────────────────────────────────────────

/** Aulas da semana. Antes de listar, gera as da grade (idempotente); se a geração falhar, vale o que já existe. */
export function useWeekClasses(from: string, to: string) {
  const { academy } = useAcademy()
  return useQuery({
    queryKey: keys.classes(academy.gym_id, from, to),
    queryFn: async () => {
      await ensureAcademyClasses(db(), academy.gym_id, from, to).catch((error: unknown) => console.warn('Não foi possível gerar as aulas da grade', error))
      return listAcademyClasses(db(), academy.gym_id, from, to)
    },
  })
}

/** Quantos presentes (presença + atraso) em cada aula. */
export function useClassCounts(ids: readonly string[]) {
  const { academy } = useAcademy()
  return useQuery({
    queryKey: keys.classCounts(academy.gym_id, ids),
    queryFn: () => countPresentByClass(db(), ids),
    enabled: ids.length > 0,
  })
}

export function useAcademyClass(id: string) {
  const { academy } = useAcademy()
  return useQuery({ queryKey: keys.klass(academy.gym_id, id), queryFn: () => getAcademyClass(db(), id), enabled: Boolean(id) })
}

export function useClassAttendance(id: string) {
  const { academy } = useAcademy()
  return useQuery({ queryKey: keys.classAttendance(academy.gym_id, id), queryFn: () => listClassAttendance(db(), id), enabled: Boolean(id) })
}

export function useClassPhotos(id: string) {
  const { academy } = useAcademy()
  return useQuery({ queryKey: keys.classPhotos(academy.gym_id, id), queryFn: () => listClassPhotos(db(), id), enabled: Boolean(id) })
}

export function useSchedules() {
  const { academy } = useAcademy()
  return useQuery({ queryKey: keys.schedules(academy.gym_id), queryFn: () => listAcademySchedules(db(), academy.gym_id) })
}

/** Todos os alunos da academia (ativos e inativos), com o consentimento de imagem. */
export function useDiaryStudents() {
  const { academy } = useAcademy()
  return useQuery({ queryKey: keys.diaryStudents(academy.gym_id), queryFn: () => listDiaryStudents(db(), academy.gym_id) })
}

export function useMemberships() {
  const { academy } = useAcademy()
  return useQuery({ queryKey: keys.memberships(academy.gym_id), queryFn: () => listGroupMemberships(db(), academy.gym_id) })
}

export function useFaceReferences(enabled: boolean) {
  const { academy } = useAcademy()
  return useQuery({
    queryKey: keys.faceRefs(academy.gym_id),
    queryFn: () => listFaceReferences(db(), academy.gym_id),
    enabled,
    staleTime: 10 * 60_000,
  })
}

/** Professores e administradores da academia, para escolher quem dá a aula (só o administrador lista). */
export function useInstructors() {
  const { academy, isAdmin } = useAcademy()
  return useQuery({
    queryKey: academyKeys.members(academy.gym_id),
    queryFn: async () => (await listAcademyMembers(db(), academy.gym_id)).filter((m) => m.role !== 'membro'),
    enabled: isAdmin,
  })
}
