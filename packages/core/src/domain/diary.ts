// Diários de aula da academia: semana, quem entra na chamada de uma aula e rótulos. Regras puras (sem banco).

import { addDays, weekdayOf } from '../dates'
import type { Student } from '../types'

/** Segunda a domingo da semana da data (a semana de treino da academia começa na segunda). */
export function weekOf(date: string): { from: string; to: string } {
  const back = (weekdayOf(date) + 6) % 7
  const from = addDays(date, -back)
  return { from, to: addDays(from, 6) }
}

/** Pertencimento do aluno a uma turma (`class_group_members`). */
export interface GroupMembership {
  group_id: string
  student_id: string
  joined_on: string
  left_on: string | null
}

/** O aluno estava na turma naquele dia? Mesma regra do banco em `conclude_academy_class`. */
export function isMemberOn(m: Pick<GroupMembership, 'joined_on' | 'left_on'>, date: string): boolean {
  return m.joined_on <= date && (m.left_on === null || m.left_on >= date)
}

/**
 * Quem a chamada da aula lista: os alunos ativos da turma naquele dia (aula sem turma: todos os ativos da academia)
 * mais quem já tem marcação na aula, mesmo inativo ou de outra turma (reposição). Em ordem alfabética.
 */
export function classRoster(
  klass: { date: string; group_id: string | null },
  students: readonly Student[],
  memberships: readonly GroupMembership[],
  markedIds: ReadonlySet<string>,
): Student[] {
  const inGroup = new Set(
    klass.group_id ? memberships.filter((m) => m.group_id === klass.group_id && isMemberOn(m, klass.date)).map((m) => m.student_id) : [],
  )
  return students
    .filter((s) => markedIds.has(s.id) || (s.active && (klass.group_id ? inGroup.has(s.id) : true)))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
}

/** Agrupa por dia, do mais antigo ao mais novo, e dentro do dia por horário (sem horário por último). */
export function groupByDate<T extends { date: string; start_time: string | null }>(classes: readonly T[]): { date: string; classes: T[] }[] {
  const byDate = new Map<string, T[]>()
  for (const c of classes) byDate.set(c.date, [...(byDate.get(c.date) ?? []), c])
  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, list]) => ({ date, classes: [...list].sort((a, b) => (a.start_time ?? '99').localeCompare(b.start_time ?? '99')) }))
}

/** Título da aula: o da turma (ou o texto digitado) — nunca vazio. */
export function classTitle(input: { title?: string | null; groupName?: string | null }): string {
  return input.title?.trim() || input.groupName?.trim() || 'Aula'
}
