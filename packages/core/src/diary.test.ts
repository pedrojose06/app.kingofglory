import { describe, expect, it } from 'vitest'
import { classRoster, classTitle, groupByDate, isMemberOn, weekOf, type GroupMembership } from './domain/diary'
import type { Student } from './types'

const student = (id: string, name: string, active = true) => ({ id, name, active }) as Student
const member = (group_id: string, student_id: string, joined_on = '2026-01-01', left_on: string | null = null): GroupMembership => ({
  group_id, student_id, joined_on, left_on,
})

describe('semana da academia', () => {
  it('vai de segunda a domingo', () => {
    expect(weekOf('2026-11-25')).toEqual({ from: '2026-11-23', to: '2026-11-29' }) // quarta
    expect(weekOf('2026-11-23')).toEqual({ from: '2026-11-23', to: '2026-11-29' }) // segunda
    expect(weekOf('2026-11-29')).toEqual({ from: '2026-11-23', to: '2026-11-29' }) // domingo fecha a semana
    expect(weekOf('2026-12-01')).toEqual({ from: '2026-11-30', to: '2026-12-06' }) // vira o mês
  })
})

describe('chamada da turma', () => {
  const students = [student('a', 'Carlos'), student('b', 'Ana'), student('c', 'Bruno', false), student('d', 'Diego'), student('e', 'Eva')]
  const memberships = [member('g1', 'a'), member('g1', 'b'), member('g1', 'c'), member('g1', 'e', '2026-12-01'), member('g2', 'd')]

  it('pertencimento vale da entrada até a saída, inclusive', () => {
    expect(isMemberOn({ joined_on: '2026-01-01', left_on: null }, '2026-06-01')).toBe(true)
    expect(isMemberOn({ joined_on: '2026-06-02', left_on: null }, '2026-06-01')).toBe(false)
    expect(isMemberOn({ joined_on: '2026-01-01', left_on: '2026-06-01' }, '2026-06-01')).toBe(true)
    expect(isMemberOn({ joined_on: '2026-01-01', left_on: '2026-05-31' }, '2026-06-01')).toBe(false)
  })

  it('lista os ativos da turma na data, em ordem alfabética', () => {
    const roster = classRoster({ date: '2026-11-25', group_id: 'g1' }, students, memberships, new Set())
    expect(roster.map((s) => s.name)).toEqual(['Ana', 'Carlos']) // Bruno inativo, Eva entra só em dezembro, Diego é de outra turma
  })

  it('quem já tem marcação aparece mesmo inativo ou de outra turma (reposição)', () => {
    const roster = classRoster({ date: '2026-11-25', group_id: 'g1' }, students, memberships, new Set(['c', 'd']))
    expect(roster.map((s) => s.name)).toEqual(['Ana', 'Bruno', 'Carlos', 'Diego'])
  })

  it('aula sem turma lista todos os ativos da academia', () => {
    const roster = classRoster({ date: '2026-11-25', group_id: null }, students, memberships, new Set())
    expect(roster.map((s) => s.name)).toEqual(['Ana', 'Carlos', 'Diego', 'Eva'])
  })
})

describe('lista de aulas', () => {
  it('agrupa por dia e ordena por horário, sem horário por último', () => {
    const list = [
      { date: '2026-11-25', start_time: '20:00:00', id: 1 },
      { date: '2026-11-24', start_time: null, id: 2 },
      { date: '2026-11-25', start_time: '07:00:00', id: 3 },
      { date: '2026-11-24', start_time: '19:00:00', id: 4 },
    ]
    expect(groupByDate(list).map((g) => [g.date, g.classes.map((c) => c.id)])).toEqual([
      ['2026-11-24', [4, 2]],
      ['2026-11-25', [3, 1]],
    ])
  })

  it('título cai no nome da turma e nunca fica vazio', () => {
    expect(classTitle({ title: ' Aulão ', groupName: 'Adulto' })).toBe('Aulão')
    expect(classTitle({ title: '  ', groupName: 'Adulto' })).toBe('Adulto')
    expect(classTitle({})).toBe('Aula')
  })
})
