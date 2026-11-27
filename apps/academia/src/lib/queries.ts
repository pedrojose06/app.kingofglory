'use client'

import {
  type ChargeList, countPresentByClass, ensureAcademyClasses, getAcademyDashboardCounts, listAcademyCharges, listAcademyProgress, getAcademyClass, getAcademyStudent, getGraduationSchedule, getStudentProgress, listAcademyClasses, listAcademyMembers,
  listAcademySchedules, listAcademyStudents, listBeltRanks, listClassAttendance, listClassGroups, listClassPhotos, listDiaryStudents,
  listFaceReferences, listAcademySignupRequests, listGroupMemberships, listMessageTemplates, listStudentsWithoutAccount, listModalities, listPayers, listPlans, listRanks, listStudentCharges, listStudentContracts,
} from '@kog/core'
import {
  getGraduationEvent, listEventCandidates, listGraduationEvents, listGraduationPhotos,
} from '@kog/core'
import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
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
  dashboard: (gymId: string, today: string) => ['academia', gymId, 'painel', today] as const,
  progress: (gymId: string) => ['academia', gymId, 'progresso'] as const,
  charges: (gymId: string, list: string, month: string) => ['academia', gymId, 'mensalidades', list, month] as const,
  graduationEvents: (gymId: string) => ['academia', gymId, 'graduacoes'] as const,
  graduationEvent: (gymId: string, id: string) => ['academia', gymId, 'graduacao', id] as const,
  graduationPhotos: (gymId: string, id: string) => ['academia', gymId, 'graduacao', id, 'fotos'] as const,
  graduationCandidates: (gymId: string, id: string) => ['academia', gymId, 'graduacao', id, 'candidatos'] as const,
  messages: (gymId: string) => ['academia', gymId, 'mensagens'] as const,
  signupRequests: (gymId: string) => ['academia', gymId, 'pedidos'] as const,
  withoutAccount: (gymId: string) => ['academia', gymId, 'pedidos', 'alunos-sem-conta'] as const,
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

// ── painel ────────────────────────────────────────────────────────────────────

/** Contadores de contratos, cobranças e grade do painel (só o administrador). */
export function useDashboardCounts(today: string) {
  const { academy, isAdmin } = useAcademy()
  return useQuery({
    queryKey: keys.dashboard(academy.gym_id, today),
    queryFn: () => getAcademyDashboardCounts(db(), academy.gym_id, today),
    enabled: isAdmin,
  })
}

/** Progresso de todos os alunos da academia (aptos a graduar). */
export function useAcademyProgress() {
  const { academy } = useAcademy()
  return useQuery({ queryKey: keys.progress(academy.gym_id), queryFn: () => listAcademyProgress(db(), academy.gym_id) })
}

/** Uma das listas da tela de mensalidades (`month` 'YYYY-MM'; as atrasadas ignoram o mês). Só o administrador. */
export function useAcademyCharges(list: ChargeList, month: string) {
  const { academy, isAdmin } = useAcademy()
  const m = list === 'atrasadas' ? 'todas' : month
  return useQuery({
    queryKey: keys.charges(academy.gym_id, list, m),
    queryFn: () => listAcademyCharges(db(), academy.gym_id, list, month),
    enabled: isAdmin,
  })
}

/** Ids dos alunos ativos: a cobrança "conta" (como no DojoWeb) quando é de pelo menos um aluno ativo. */
export function useActiveStudentIds() {
  const students = useStudents()
  return useMemo(() => (students.data ? new Set(students.data.filter((s) => s.active).map((s) => s.id)) : undefined), [students.data])
}

// ── graduações ──────────────────────────────────────────────────────────────

export function useGraduationEvents() {
  const { academy } = useAcademy()
  return useQuery({ queryKey: keys.graduationEvents(academy.gym_id), queryFn: () => listGraduationEvents(db(), academy.gym_id) })
}

export function useGraduationEvent(id: string) {
  const { academy } = useAcademy()
  return useQuery({ queryKey: keys.graduationEvent(academy.gym_id, id), queryFn: () => getGraduationEvent(db(), id), enabled: Boolean(id) })
}

export function useGraduationPhotos(id: string) {
  const { academy } = useAcademy()
  return useQuery({ queryKey: keys.graduationPhotos(academy.gym_id, id), queryFn: () => listGraduationPhotos(db(), id), enabled: Boolean(id) })
}

export function useGraduationCandidates(id: string) {
  const { academy } = useAcademy()
  return useQuery({ queryKey: keys.graduationCandidates(academy.gym_id, id), queryFn: () => listEventCandidates(db(), id), enabled: Boolean(id) })
}

// ── mensagens padrão ──────────────────────────────────────────────────────────

export function useMessageTemplates() {
  const { academy, isStaff } = useAcademy()
  return useQuery({ queryKey: keys.messages(academy.gym_id), queryFn: () => listMessageTemplates(db(), academy.gym_id), enabled: isStaff })
}

// ── pedidos de acesso (cadastro de aluno) ─────────────────────────────────────

/** Pedidos de alunos que criaram a conta escolhendo esta academia (só o administrador). */
export function useSignupRequests() {
  const { academy, isAdmin } = useAcademy()
  return useQuery({
    queryKey: keys.signupRequests(academy.gym_id),
    queryFn: () => listAcademySignupRequests(db(), academy.gym_id),
    enabled: isAdmin,
    refetchInterval: 5 * 60_000,
  })
}

/** Alunos da academia sem conta, para ligar a um pedido. */
export function useStudentsWithoutAccount(enabled: boolean) {
  const { academy } = useAcademy()
  return useQuery({ queryKey: keys.withoutAccount(academy.gym_id), queryFn: () => listStudentsWithoutAccount(db(), academy.gym_id), enabled })
}
