'use client'

import {
  countPresentByClass, ensureClasses, getClass, getLessonPlan, getProfile, keys, listClassAttendance, listClassesByDate,
  listClassesRange, listClassPhotos, listGraduations, listGyms, listPendingClasses, listProgress, listRanks, listReminders, listSchedules,
  listStudentAttendance, listStudents, listWalkInLocations, todayISO, type ClassRow,
} from '@kog/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useUserId } from './auth'
import { db } from './supabase'
import { toastError } from './toast'

/** Dia de hoje em São Paulo; atualiza se o app ficar aberto na virada do dia. */
export function useToday(): string {
  const [today, setToday] = useState(() => todayISO())
  useEffect(() => {
    const tick = () => setToday(todayISO())
    const timer = window.setInterval(tick, 60_000)
    document.addEventListener('visibilitychange', tick)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [])
  return today
}

export const useProfile = () => {
  const userId = useUserId()
  return useQuery({ queryKey: keys.profile, queryFn: () => getProfile(db(), userId), enabled: !!userId })
}
export const useGyms = () => useQuery({ queryKey: keys.gyms, queryFn: () => listGyms(db()) })
export const useSchedules = () => useQuery({ queryKey: keys.schedules, queryFn: () => listSchedules(db()) })
export const useReminders = () => useQuery({ queryKey: keys.reminders, queryFn: () => listReminders(db()) })
export const useStudents = () => useQuery({ queryKey: keys.students, queryFn: () => listStudents(db()) })
export const useRanks = () => useQuery({ queryKey: keys.ranks, queryFn: () => listRanks(db()), staleTime: 5 * 60_000 })
export const useProgress = () => useQuery({ queryKey: keys.progress, queryFn: () => listProgress(db()) })
export const useGraduations = (studentId: string) =>
  useQuery({ queryKey: keys.graduations(studentId), queryFn: () => listGraduations(db(), studentId), enabled: !!studentId })

/** Gera as aulas da grade antes de listar; offline, a geração falha em silêncio e vale o cache. */
async function withEnsure<T>(fn: () => Promise<T>): Promise<T> {
  await ensureClasses(db()).catch(() => {})
  return fn()
}

export const useClassesByDate = (date: string) =>
  useQuery({ queryKey: keys.classesByDate(date), queryFn: () => withEnsure(() => listClassesByDate(db(), date)) })

export const usePendingClasses = () => {
  const today = useToday()
  return useQuery({ queryKey: [...keys.classesPending, today], queryFn: () => withEnsure(() => listPendingClasses(db(), today)) })
}

export const useClassesRange = (gymId: string | null, from: string, to: string) =>
  useQuery({ queryKey: keys.classesRange(gymId, from, to), queryFn: () => listClassesRange(db(), gymId, from, to) })

export const useClassCounts = (classes: readonly ClassRow[] | undefined) => {
  const ids = (classes ?? []).map((c) => c.id)
  return useQuery({ queryKey: keys.classCounts(ids), queryFn: () => countPresentByClass(db(), ids), enabled: ids.length > 0 })
}

/** Aula por id; aproveita o que já está em cache nas listas para abrir instantaneamente (e offline). */
export const useClass = (id: string) => {
  const queryClient = useQueryClient()
  return useQuery({
    queryKey: keys.class(id),
    queryFn: () => getClass(db(), id),
    enabled: !!id,
    initialData: () =>
      queryClient
        .getQueriesData<ClassRow[]>({ queryKey: ['classes'] })
        .flatMap(([, rows]) => (Array.isArray(rows) ? rows : []))
        .find((c) => c.id === id),
    initialDataUpdatedAt: 0,
  })
}

export const useClassAttendance = (classId: string) =>
  useQuery({ queryKey: keys.classAttendance(classId), queryFn: () => listClassAttendance(db(), classId), enabled: !!classId })
export const useStudentAttendance = (studentId: string) =>
  useQuery({ queryKey: keys.studentAttendance(studentId), queryFn: () => listStudentAttendance(db(), studentId), enabled: !!studentId })
export const useWalkInLocations = () =>
  useQuery({ queryKey: keys.walkInLocations, queryFn: () => listWalkInLocations(db()) })
export const useLessonPlan = (classId: string) =>
  useQuery({ queryKey: keys.lessonPlan(classId), queryFn: () => getLessonPlan(db(), classId), enabled: !!classId })
export const useClassPhotos = (classId: string) =>
  useQuery({ queryKey: keys.classPhotos(classId), queryFn: () => listClassPhotos(db(), classId), enabled: !!classId })

/** Mutação online (cadastros): mostra erro em toast e invalida as chaves informadas. */
export function useSave<TArgs, TResult = unknown>(
  fn: (args: TArgs) => Promise<TResult>,
  invalidate: readonly (readonly unknown[])[],
  onDone?: (result: TResult) => void,
) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: async (result) => {
      await Promise.all(invalidate.map((queryKey) => queryClient.invalidateQueries({ queryKey })))
      onDone?.(result)
    },
    onError: toastError,
  })
}
