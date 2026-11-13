import { describe, expect, it } from 'vitest'
import {
  addDays, buildImportPlan, enqueue, formatDayLong, graduationStatus, monthsBetween, nextBatch, overlayAttendance,
  overlayClassStatus, parseAttendanceExport, parseCsv, parseDateLoose, toCsv, todayISO, weekdayOf, attendanceStats,
  type Attendance, type OutboxItem, type OutboxOp, type Rank,
} from './index'

describe('dates', () => {
  it('usa o dia civil de São Paulo, não o UTC', () => {
    expect(todayISO(new Date('2026-11-13T01:30:00Z'))).toBe('2026-11-12')
    expect(todayISO(new Date('2026-11-13T03:00:00Z'))).toBe('2026-11-13')
  })
  it('aritmética e formatação', () => {
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01')
    expect(weekdayOf('2026-11-12')).toBe(4)
    expect(formatDayLong('2026-11-12')).toBe('quinta, 12 de novembro')
    expect(monthsBetween('2026-01-10', '2026-07-09')).toBe(5)
    expect(monthsBetween('2026-01-10', '2026-07-10')).toBe(6)
  })
  it('parseDateLoose', () => {
    expect(parseDateLoose('03/02/2026')).toBe('2026-02-03')
    expect(parseDateLoose('3/2/26')).toBe('2026-02-03')
    expect(parseDateLoose('2026-02-03 19:00')).toBe('2026-02-03')
    expect(parseDateLoose('31/02/2026')).toBeNull()
    expect(parseDateLoose('Nome')).toBeNull()
  })
})

const rank = (grade: number, extra: Partial<Rank> = {}): Rank => ({
  id: `r${grade}`, grade, name: `G${grade}`, level: '', colors: [], min_months: null, required_classes: null, min_percent: null, ...extra,
})
const ranks = [rank(1), rank(2, { min_months: 6, required_classes: 48, min_percent: 75 }), rank(3)]

describe('graduationStatus', () => {
  it('sem graduação: trata como grau 1 e conta desde o cadastro', () => {
    const s = graduationStatus(undefined, ranks, '2026-01-01', '2026-03-15')
    expect(s.current?.grade).toBe(1)
    expect(s.next?.grade).toBe(2)
    expect(s.needed).toBe(36)
    expect(s.missingClasses).toBe(36)
    expect(s.missingMonths).toBe(4)
    expect(s.eligible).toBe(false)
  })
  it('apto quando cumpre presenças mínimas (75% de 48) e o intervalo', () => {
    const p = { current_rank_id: 'r1', last_graduated_at: '2026-01-10', attendance_since: 36 }
    expect(graduationStatus(p, ranks, '2025-01-01', '2026-07-09').eligible).toBe(false)
    expect(graduationStatus(p, ranks, '2025-01-01', '2026-07-10').eligible).toBe(true)
    expect(graduationStatus({ ...p, attendance_since: 35 }, ranks, '2025-01-01', '2026-08-01').eligible).toBe(false)
  })
  it('grau sem requisito configurado nunca aparece como apto', () => {
    const s = graduationStatus({ current_rank_id: 'r2', last_graduated_at: '2020-01-01', attendance_since: 999 }, ranks, '2019-01-01', '2026-01-01')
    expect(s.configured).toBe(false)
    expect(s.eligible).toBe(false)
  })
  it('último grau não tem próximo', () => {
    expect(graduationStatus({ current_rank_id: 'r3', last_graduated_at: null, attendance_since: 1 }, ranks, '2026-01-01', '2026-02-01').next).toBeNull()
  })
})

describe('csv', () => {
  it('detecta delimitador, aspas e BOM', () => {
    expect(parseCsv('﻿a;b\r\n"x;1";"y ""z"""\n\n')).toEqual([['a', 'b'], ['x;1', 'y "z"']])
    expect(parseCsv('a,b\n1,2')).toEqual([['a', 'b'], ['1', '2']])
  })
  it('toCsv faz round-trip', () => {
    expect(parseCsv(toCsv(['n', 'o'], [['Ana; "A"', null]]))).toEqual([['n', 'o'], ['Ana; "A"', '']])
  })
})

describe('importação', () => {
  it('formato long', () => {
    const r = parseAttendanceExport('Aluno;Data;Presença\nAna Souza;03/02/2026;Presente\nBruno;03/02/2026;Falta\nX;;P\nY;04/02/2026;???')
    expect(r.format).toBe('long')
    expect(r.rows).toEqual([
      { studentName: 'Ana Souza', date: '2026-02-03', status: 'present' },
      { studentName: 'Bruno', date: '2026-02-03', status: 'absent' },
    ])
    expect(r.warnings).toHaveLength(2)
  })
  it('formato long sem coluna de status = presente', () => {
    expect(parseAttendanceExport('nome,data\nAna,2026-02-03').rows[0]?.status).toBe('present')
  })
  it('formato wide', () => {
    const r = parseAttendanceExport('Nome;03/02/2026;05/02/2026\nAna;P;F\nBruno;;X')
    expect(r.format).toBe('wide')
    expect(r.rows).toHaveLength(3)
  })
  it('plano: casa alunos sem acento/caixa, detecta aulas faltantes e duplicatas', () => {
    const { rows } = parseAttendanceExport('Aluno;Data;Status\nANA SOUZA;03/02/2026;F\nAna  Souza;03/02/2026;P\nJoão;05/02/2026;P')
    const plan = buildImportPlan(rows, [{ name: 'Ana Souza' }], [{ date: '2026-02-03', status: 'done' }])
    expect(plan.newStudents).toEqual(['João'])
    expect(plan.newClassDates).toEqual(['2026-02-05'])
    expect(plan.duplicates).toBe(1)
    expect(plan.records).toHaveLength(2)
    expect(plan.records[0]?.status).toBe('present')
    expect(plan.dateRange).toEqual({ from: '2026-02-03', to: '2026-02-05' })
  })
})

const item = (id: string, op: OutboxOp, error?: string): OutboxItem => ({ id, createdAt: '', op, error })
const mark = (student: string, status: 'present' | 'absent', cls = 'c1'): OutboxOp => ({
  type: 'attendance.mark', mark: { class_id: cls, student_id: student, status, marked_at: '' },
})

describe('outbox', () => {
  it('coalesce marcações do mesmo aluno/aula', () => {
    let q: OutboxItem[] = []
    q = enqueue(q, item('1', mark('a', 'present')))
    q = enqueue(q, item('2', mark('b', 'present')))
    q = enqueue(q, item('3', mark('a', 'absent')))
    expect(q.map((i) => i.id)).toEqual(['2', '3'])
  })
  it('não coalesce avulsas nem fotos', () => {
    const w: OutboxOp = { type: 'walkin.add', student_ids: ['a'], date: '2026-01-01', location: 'Matriz' }
    expect(enqueue([item('1', w)], item('2', w))).toHaveLength(2)
  })
  it('lote: marcações consecutivas juntas, pulando itens com erro', () => {
    const q = [item('0', mark('z', 'present'), 'recusado'), item('1', mark('a', 'present')), item('2', mark('b', 'present')), item('3', { type: 'class.conclude', classId: 'c1' }), item('4', mark('c', 'present'))]
    expect(nextBatch(q).map((i) => i.id)).toEqual(['1', '2'])
    expect(nextBatch(q.slice(3)).map((i) => i.id)).toEqual(['3'])
  })
  it('overlay aplica pendências sobre o servidor', () => {
    const q = [item('1', mark('a', 'absent')), item('2', mark('b', 'present', 'outra')), item('3', { type: 'class.conclude', classId: 'c1' })]
    const m = overlayAttendance([{ student_id: 'a', status: 'present' }, { student_id: 'c', status: 'late' }], q, 'c1')
    expect(Object.fromEntries(m)).toEqual({ a: 'absent', c: 'late' })
    expect(overlayClassStatus('scheduled', q, 'c1')).toBe('done')
    expect(overlayClassStatus('scheduled', q, 'c2')).toBe('scheduled')
  })
})

describe('attendanceStats', () => {
  it('conta presença e atraso; falta e justificada não', () => {
    const a = (date: string, status: Attendance['status'], class_id: string | null, location_label: string | null = null) =>
      ({ date, status, class_id, location_label }) as Attendance
    const s = attendanceStats([a('2026-01-05', 'present', 'c'), a('2026-01-07', 'late', 'c'), a('2026-02-01', 'present', null, 'Matriz'), a('2026-02-03', 'justified', 'c'), a('2026-02-05', 'absent', 'c')], 'Centro')
    expect(s.total).toBe(3)
    expect(s.absences).toBe(2)
    expect(s.byMonth).toEqual([{ month: '2026-02', count: 1 }, { month: '2026-01', count: 2 }])
    expect(s.byLocation).toEqual([{ location: 'Centro', count: 2 }, { location: 'Matriz', count: 1 }])
  })
})
