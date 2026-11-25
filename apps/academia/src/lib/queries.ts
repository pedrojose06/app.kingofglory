'use client'

import {
  getAcademyStudent, listAcademyStudents, listBeltRanks, listClassGroups, listModalities, listPayers, listPlans, listRanks,
  listStudentCharges, listStudentContracts,
} from '@kog/core'
import { useQuery } from '@tanstack/react-query'
import { useAcademy } from './academy'
import { db } from './supabase'

/** Chaves do cache do sistema da academia. Tudo começa com ['academia', gymId] para invalidar por academia. */
export const keys = {
  all: (gymId: string) => ['academia', gymId] as const,
  students: (gymId: string) => ['academia', gymId, 'alunos'] as const,
  student: (gymId: string, id: string) => ['academia', gymId, 'aluno', id] as const,
  studentContracts: (gymId: string, id: string) => ['academia', gymId, 'aluno', id, 'contratos'] as const,
  studentCharges: (gymId: string, id: string) => ['academia', gymId, 'aluno', id, 'cobrancas'] as const,
  modalities: (gymId: string) => ['academia', gymId, 'modalidades'] as const,
  groups: (gymId: string) => ['academia', gymId, 'turmas'] as const,
  payers: (gymId: string) => ['academia', gymId, 'pagadores'] as const,
  plans: (gymId: string) => ['academia', gymId, 'planos'] as const,
}

export function useStudents() {
  const { academy } = useAcademy()
  return useQuery({ queryKey: keys.students(academy.gym_id), queryFn: () => listAcademyStudents(db(), academy.gym_id) })
}

export function useStudent(id: string) {
  const { academy } = useAcademy()
  return useQuery({ queryKey: keys.student(academy.gym_id, id), queryFn: () => getAcademyStudent(db(), id), enabled: Boolean(id) })
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
