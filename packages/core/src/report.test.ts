import { describe, expect, it } from 'vitest'
import { buildReport, monthRange, shiftMonth, type ReportInput } from './index'

const student = (id: string, gym = 'g1', extra: Partial<ReportInput['students'][number]> = {}) => ({
  id, gym_id: gym, name: id.toUpperCase(), active: true, started_on: '2026-01-01', ...extra,
})

const base: ReportInput = {
  from: '2026-10-01',
  to: '2026-10-31',
  today: '2026-11-16',
  gymId: null,
  students: [student('a'), student('b'), student('c'), student('d', 'g2'), student('novo', 'g1', { started_on: '2026-10-10' }), student('inativo', 'g1', { active: false })],
  classes: [
    { id: 'k1', gym_id: 'g1', date: '2026-10-05', status: 'done' },
    { id: 'k2', gym_id: 'g1', date: '2026-10-07', status: 'done' },
    { id: 'k3', gym_id: 'g2', date: '2026-10-06', status: 'done' },
    { id: 'k4', gym_id: 'g1', date: '2026-10-09', status: 'scheduled' },
    { id: 'k0', gym_id: 'g1', date: '2026-09-20', status: 'done' },
  ],
  attendance: [
    { student_id: 'a', gym_id: 'g1', class_id: 'k1', date: '2026-10-05', status: 'present' },
    { student_id: 'a', gym_id: 'g1', class_id: 'k2', date: '2026-10-07', status: 'late' },
    { student_id: 'b', gym_id: 'g1', class_id: 'k1', date: '2026-10-05', status: 'present' },
    { student_id: 'b', gym_id: 'g1', class_id: 'k2', date: '2026-10-07', status: 'absent' },
    { student_id: 'b', gym_id: 'g1', class_id: null, date: '2026-10-12', status: 'present', credits: 2 },
    { student_id: 'c', gym_id: 'g1', class_id: 'k4', date: '2026-10-09', status: 'present' },
    { student_id: 'd', gym_id: 'g2', class_id: 'k3', date: '2026-10-06', status: 'present' },
    { student_id: 'c', gym_id: 'g1', class_id: 'k0', date: '2026-09-20', status: 'present' },
  ],
  graduations: [{ student_id: 'a', graduated_at: '2026-10-20' }, { student_id: 'd', graduated_at: '2026-09-01' }],
}

describe('relatório', () => {
  it('períodos por mês', () => {
    expect(monthRange('2026-11', 1)).toEqual({ from: '2026-11-01', to: '2026-11-30' })
    expect(monthRange('2026-02', 3)).toEqual({ from: '2025-12-01', to: '2026-02-28' })
    expect(shiftMonth('2026-01', -1)).toBe('2025-12')
  })

  it('números gerais, ranking e quem não treinou', () => {
    const r = buildReport(base)
    expect(r.classes).toBe(3) // aula em aberto e de setembro ficam de fora
    expect(r.presences).toBe(6) // a: 2, b: 1 + avulsa valendo 2, d: 1
    expect(r.perClass).toBeCloseTo(4 / 3) // presenças em aula ÷ aulas (avulsa não entra)
    expect(r.rate).toBeCloseTo(5 / 6)
    expect(r.activeStudents).toBe(5)
    expect(r.trainedStudents).toBe(3)
    expect(r.ranking.map((x) => [x.studentId, x.presences])).toEqual([['b', 3], ['a', 2], ['d', 1]])
    expect(r.ranking[0]!.rate).toBeCloseTo(2 / 3)
    expect(r.missing.map((s) => s.id)).toEqual(['c', 'novo'])
    expect(r.newStudents.map((s) => s.id)).toEqual(['novo'])
    expect(r.graduations).toBe(1)
    expect(r.monthly).toHaveLength(12)
    expect(r.monthly.at(-1)).toEqual({ month: '2026-10', presences: 6, classes: 3 })
    expect(r.monthly.at(-2)).toEqual({ month: '2026-09', presences: 1, classes: 1 })
  })

  it('filtra por academia e compara academias', () => {
    const r = buildReport({ ...base, gymId: 'g2' })
    expect(r.presences).toBe(1)
    expect(r.classes).toBe(1)
    expect(r.graduations).toBe(0)
    const all = buildReport(base)
    expect(all.byGym.map((g) => [g.gymId, g.classes, g.presences, g.trainedStudents, g.activeStudents])).toEqual([
      ['g1', 2, 5, 2, 4],
      ['g2', 1, 1, 1, 1],
    ])
  })
})
