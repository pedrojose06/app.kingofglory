import { describe, expect, it } from 'vitest'
import { planShareText } from './data/plan-share'
import {
  absenceAlerts, addDays, analyzeTurnout, buildImportPlan, diffReminders, enqueue, formatDayLong, graduationStatus, missingLabel, monthsBetween, nextBatch, overlayAttendance,
  overlayClassStatus, parseAttendanceExport, planHasContent, upcomingClasses, parseCsv, parseDateLoose, toCsv, toReminderPlan, todayISO, weekdayOf, welchT, attendanceStats,
  type AbsenceStreak, type Attendance, type ClassRow, type ClassSchedule, type AttendanceReminder, type ClassTurnout, type OutboxItem, type OutboxOp, type Rank,
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
  id: `r${grade}`, grade, name: `G${grade}`, level: '', colors: [], min_months: null, required_classes: null, min_percent: null, track: 'adulto', min_age: null, ...extra,
})
const ranks = [
  rank(1, { required_classes: 24, min_months: 3 }),
  rank(2, { required_classes: 36, min_months: 6 }),
  rank(3, { required_classes: 72, min_months: 6, min_percent: 80 }),
  rank(4),
]
const prog = (current_rank_id: string | null, last_graduated_at: string | null, attendance_since: number) =>
  ({ current_rank_id, last_graduated_at, attendance_since, classes_since: attendance_since })

describe('graduationStatus', () => {
  it('sem graduação: não tem grau, próximo é o primeiro e conta desde o início', () => {
    const s = graduationStatus(prog(null, null, 20), ranks, '2026-01-01', '2026-03-15')
    expect(s.current).toBeNull()
    expect(s.next?.grade).toBe(1)
    expect(s.needed).toBe(24)
    expect(s.missingClasses).toBe(4)
    expect(s.missingMonths).toBe(1)
    expect(graduationStatus(prog(null, null, 24), ranks, '2026-01-01', '2026-04-01').eligible).toBe(true)
  })
  it('primeira graduação com 5+ meses pode pular para o segundo grau', () => {
    expect(graduationStatus(prog(null, null, 30), ranks, '2026-01-01', '2026-05-31').skipTo).toBeNull()
    expect(graduationStatus(prog(null, null, 30), ranks, '2026-01-01', '2026-06-01').skipTo?.grade).toBe(2)
    expect(graduationStatus(prog(null, null, 10), ranks, '2026-01-01', '2026-09-01').skipTo).toBeNull()
    expect(graduationStatus(prog('r1', '2025-01-01', 99), ranks, '2024-01-01', '2026-09-01').skipTo).toBeNull()
  })
  it('data da próxima graduação: meses contam até ela (caso real: 5 meses hoje, 6 na graduação)', () => {
    // Começou em 26/05 com 36 treinos; hoje 16/11 (5 meses), graduação em 13/12 (6 meses).
    const hoje = graduationStatus(prog(null, null, 36), ranks, '2026-05-26', '2026-11-16')
    expect([hoje.skipTo?.grade, hoje.skipReady, hoje.on]).toEqual([2, false, null])
    const naGraduacao = graduationStatus(prog(null, null, 36), ranks, '2026-05-26', '2026-11-16', { graduationOn: '2026-12-13' })
    expect([naGraduacao.monthsElapsed, naGraduacao.skipTo?.grade, naGraduacao.skipReady, naGraduacao.on]).toEqual([6, 2, true, '2026-12-13'])
    // Poucos treinos para o segundo grau: pode pular pelo tempo, mas não está pronto.
    expect(graduationStatus(prog(null, null, 30), ranks, '2026-05-26', '2026-11-16', { graduationOn: '2026-12-13' }).skipReady).toBe(false)
    // Data passada é ignorada: vale hoje.
    expect(graduationStatus(prog(null, null, 36), ranks, '2026-05-26', '2026-11-16', { graduationOn: '2026-11-01' }).on).toBeNull()
  })
  it('quantidade cheia sem *, e 80% da quantidade com *', () => {
    expect(graduationStatus(prog('r1', '2026-01-10', 35), ranks, '2025-01-01', '2026-08-01').missingClasses).toBe(1)
    const s = graduationStatus(prog('r2', '2026-01-10', 58), ranks, '2025-01-01', '2026-07-10')
    expect(s.needed).toBe(58)
    expect(s.eligible).toBe(true)
    expect(graduationStatus(prog('r2', '2026-01-10', 58), ranks, '2025-01-01', '2026-07-09').eligible).toBe(false)
  })
  it('grau sem requisito configurado nunca aparece como apto', () => {
    const s = graduationStatus(prog('r3', '2020-01-01', 999), ranks, '2019-01-01', '2026-01-01')
    expect(s.configured).toBe(false)
    expect(s.eligible).toBe(false)
  })
  it('último grau não tem próximo', () => {
    expect(graduationStatus(prog('r4', null, 1), ranks, '2026-01-01', '2026-02-01').next).toBeNull()
  })
  it('graduação infantil por idade que completa no ano', () => {
    const kids = [11, 12, 13, 14].map((age, i) =>
      rank(i + 1, { id: `k${i + 1}`, track: 'infantil', name: ['Branco', 'Amarelo', 'Laranja', 'Verde'][i], min_age: age }))
    const all = [...ranks, ...kids]
    const kid = (birthDate: string | null) => ({ track: 'infantil' as const, birthDate })
    // Completa 11 no ano: Branco.
    let s = graduationStatus(prog(null, null, 0), all, '2026-01-01', '2026-03-01', kid('2015-12-31'))
    expect([s.next?.name, s.eligible]).toEqual(['Branco', true])
    // Completa 10: ainda não.
    s = graduationStatus(prog(null, null, 0), all, '2026-01-01', '2026-03-01', kid('2016-01-01'))
    expect([s.next?.name, s.eligible, missingLabel(s)]).toEqual(['Branco', false, 'completa 11 anos em 2027'])
    // 13 anos sem graduação: Branco não pode ser pulado.
    s = graduationStatus(prog(null, null, 0), all, '2026-01-01', '2026-03-01', kid('2013-05-05'))
    expect([s.next?.name, s.eligible]).toEqual(['Branco', true])
    // Mesmo ano da Branco: espera o próximo ano.
    s = graduationStatus(prog('k1', '2026-02-01', 0), all, '2026-01-01', '2026-03-01', kid('2013-05-05'))
    expect([s.next?.name, s.eligible, missingLabel(s)]).toEqual(['Laranja', false, 'já graduou este ano; só no próximo'])
    // Ano seguinte, completa 14: direto para Verde.
    s = graduationStatus(prog('k1', '2026-02-01', 0), all, '2026-01-01', '2027-01-10', kid('2013-05-05'))
    expect([s.next?.name, s.eligible]).toEqual(['Verde', true])
    // Branco aos 11, ano seguinte completa 12: Amarelo.
    s = graduationStatus(prog('k1', '2025-12-13', 0), all, '2025-01-01', '2026-11-14', kid('2014-08-01'))
    expect([s.next?.name, s.eligible]).toEqual(['Amarelo', true])
    // Sem nascimento.
    s = graduationStatus(prog('k1', '2025-12-13', 0), all, '2025-01-01', '2026-11-14', kid(null))
    expect([s.next?.name, s.eligible, missingLabel(s)]).toEqual(['Amarelo', false, 'falta a data de nascimento'])
    // Verde: fim da trilha.
    expect(graduationStatus(prog('k4', '2025-01-01', 0), all, '2025-01-01', '2026-11-14', kid('2010-01-01')).next).toBeNull()
    // Passou para o adulto: próximo é o primeiro grau adulto.
    expect(graduationStatus(prog('k4', '2026-01-01', 0), all, '2026-01-01', '2026-02-01', { track: 'adulto' }).next?.id).toBe('r1')
    // Sem trilha informada continua no adulto.
    expect(graduationStatus(prog('r1', '2026-01-01', 0), all, '2026-01-01', '2026-02-01').next?.id).toBe('r2')
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
  it('presença que vale mais de uma (aulão) soma o valor', () => {
    const s = attendanceStats([
      { date: '2026-11-14', status: 'present', class_id: null, location_label: 'Aulão', credits: 2 },
      { date: '2026-11-12', status: 'present', class_id: 'c', location_label: null },
    ], 'Centro')
    expect(s.total).toBe(3)
    expect(s.byMonth).toEqual([{ month: '2026-11', count: 3 }])
    expect(s.byLocation).toEqual([{ location: 'Aulão', count: 2 }, { location: 'Centro', count: 1 }])
  })
})

describe('lembretes de chamada', () => {
  const row = (id: string, schedule_id: string | null, remind_at: string): AttendanceReminder => ({
    id, schedule_id, remind_at, profile_id: 'p', last_sent_on: null, created_at: '2026-11-14T00:00:00Z',
  })

  it('lê o que está salvo como plano (horário geral e por turma)', () => {
    expect(toReminderPlan([row('1', null, '22:30:00'), row('2', 's1', '21:00:00')])).toEqual({
      general: '22:30',
      bySchedule: { s1: '21:00' },
    })
    expect(toReminderPlan([])).toEqual({ general: null, bySchedule: {} })
  })

  it('grava só o que mudou', () => {
    const current = [row('1', null, '22:30:00'), row('2', 's1', '21:00:00'), row('3', 's2', '20:00:00')]
    // mesmo horário geral, s1 muda, s2 sai, s3 entra
    expect(diffReminders(current, { general: '22:30', bySchedule: { s1: '21:30', s3: '19:45' } })).toEqual({
      remove: ['3'],
      update: [{ id: '2', remind_at: '21:30' }],
      insert: [{ schedule_id: 's3', remind_at: '19:45' }],
    })
  })

  it('trocar de "por turma" para um horário só remove os horários das turmas', () => {
    const current = [row('2', 's1', '21:00:00'), row('3', 's2', '20:00:00')]
    expect(diffReminders(current, { general: '22:30', bySchedule: {} })).toEqual({
      remove: ['2', '3'],
      update: [],
      insert: [{ schedule_id: null, remind_at: '22:30' }],
    })
    expect(diffReminders(current, { general: null, bySchedule: {} }).remove).toEqual(['2', '3'])
  })
})

describe('faltas seguidas', () => {
  const s = (id: string, n: number, last: string | null = null): AbsenceStreak => ({ student_id: id, gym_id: 'g', last_present_on: last, absences_in_row: n })

  it('avisa só quem passou do limite, quem falta há mais tempo primeiro', () => {
    const list = [s('a', 5), s('b', 6, '2026-10-01'), s('c', 12, '2026-08-01'), s('d', 6, '2026-09-01')]
    expect(absenceAlerts(list, 5).map((x) => x.student_id)).toEqual(['c', 'd', 'b'])
    expect(absenceAlerts(list, 10).map((x) => x.student_id)).toEqual(['c'])
  })
})

describe('padrões de frequência', () => {
  // Gera aulas às terças e quintas entre duas datas, com a lotação dada por dia.
  function classes(gym: string, from: string, to: string, present: (date: string) => number): ClassTurnout[] {
    const out: ClassTurnout[] = []
    for (let d = from; d <= to; d = addDays(d, 1)) {
      const wd = weekdayOf(d)
      if (wd === 2 || wd === 4) out.push({ class_id: `${gym}-${d}`, gym_id: gym, date: d, present: present(d) })
    }
    return out
  }
  // ruído determinístico: 0, 1, 2, 0, 1, 2…
  const noise = (d: string) => Number(d.slice(8, 10)) % 3

  it('aponta o fim do mês mais cheio quando a diferença é clara', () => {
    const rows = classes('g1', '2026-01-01', '2026-10-31', (d) => (Number(d.slice(8, 10)) > 20 ? 9 : 4) + noise(d))
    const [gym] = analyzeTurnout(rows, '2026-11-01')
    const period = gym!.insights.find((i) => i.kind === 'period')
    expect(period?.strength).toBe('strong')
    expect(period?.text).toContain('O fim do mês (dias 21–31) tem mais alunos')
  })

  it('não inventa padrão quando a lotação é a mesma', () => {
    const rows = classes('g1', '2026-01-01', '2026-10-31', (d) => 5 + noise(d))
    const [gym] = analyzeTurnout(rows, '2026-11-01')
    expect(gym!.insights.filter((i) => i.kind === 'period' || i.kind === 'weekday')).toEqual([])
    expect(gym!.byPeriod.map((b) => b.label)).toEqual(['Início (1–10)', 'Meio (11–20)', 'Fim (21–31)'])
  })

  it('compara dias da semana e detecta queda recente', () => {
    const rows = classes('g1', '2026-01-01', '2026-10-31', (d) =>
      (weekdayOf(d) === 2 ? 8 : 4) + noise(d) - (d > '2026-09-05' ? 3 : 0),
    )
    const [gym] = analyzeTurnout(rows, '2026-10-31')
    expect(gym!.insights.find((i) => i.kind === 'weekday')?.text).toContain('Terça enche mais que quinta')
    const trend = gym!.insights.find((i) => i.kind === 'trend')
    expect(trend?.text).toContain('caindo')
    expect(gym!.byWeekday.map((b) => b.label)).toEqual(['Terça', 'Quinta'])
  })

  it('deixa de fora dias com poucas aulas extras (não são da grade)', () => {
    const regular = classes('g1', '2026-01-01', '2026-10-31', (d) => 6 + noise(d))
    const extras: ClassTurnout[] = ['2026-02-06', '2026-03-13', '2026-03-20', '2026-07-24', '2026-10-09', '2026-04-03']
      .map((date) => ({ class_id: `x-${date}`, gym_id: 'g1', date, present: 1 }))
    const [gym] = analyzeTurnout([...regular, ...extras], '2026-11-01')
    expect(gym!.byWeekday.map((b) => b.label)).toEqual(['Terça', 'Quinta'])
    expect(gym!.insights.find((i) => i.kind === 'weekday')).toBeUndefined()
  })

  it('ignora academias com poucas aulas', () => {
    const rows = classes('g2', '2026-10-01', '2026-10-20', () => 3)
    expect(analyzeTurnout(rows, '2026-11-01')).toEqual([])
  })

  it('welchT cresce com a diferença e com o número de aulas', () => {
    expect(welchT([5, 5, 5], [5, 5, 5])).toBe(0)
    expect(welchT([4, 6, 4, 6], [5, 7, 5, 7])).toBeLessThan(welchT([4, 6, 4, 6, 4, 6, 4, 6], [5, 7, 5, 7, 5, 7, 5, 7]))
  })
})

describe('próximas aulas e plano antecipado', () => {
  // 2026-11-16 é segunda (1); 2026-11-18 é quarta (3).
  const sched = (id: string, weekday: number, extra: Partial<ClassSchedule> = {}): ClassSchedule => ({
    id, gym_id: 'g', instructor_id: 'p', weekday, start_time: '19:00:00', title: 'Muay Thai', starts_on: '2026-01-01',
    ends_on: null, active: true, created_at: '2026-01-01T00:00:00Z', ...extra,
  })
  const klass = (id: string, date: string, extra: Partial<ClassRow> = {}): ClassRow => ({
    id, gym_id: 'g', instructor_id: 'p', schedule_id: null, date, start_time: '20:00:00', title: 'Extra', status: 'scheduled',
    created_at: '2026-01-01T00:00:00Z', ...extra,
  })

  it('junta a grade (gerada ou não) com as extras e pula as canceladas', () => {
    const schedules = [sched('seg', 1), sched('qua', 3), sched('fim', 3, { ends_on: '2026-11-17' })]
    const existing = [
      klass('c-seg', '2026-11-16', { schedule_id: 'seg', start_time: '19:30:00', title: 'Muay Thai' }),
      klass('x', '2026-11-17'),
      klass('c-qua', '2026-11-18', { schedule_id: 'qua', status: 'cancelled' }),
      klass('fora', '2026-11-30'),
    ]
    const list = upcomingClasses(schedules, existing, '2026-11-16', 7)
    expect(list.map((u) => [u.date, u.klass?.id ?? null, u.schedule?.id ?? null, u.start_time])).toEqual([
      ['2026-11-16', 'c-seg', 'seg', '19:30:00'],
      ['2026-11-17', 'x', null, '20:00:00'],
    ])
    // Semana seguinte da quarta (não gerada) entra só pela grade.
    expect(upcomingClasses(schedules, [], '2026-11-19', 7).map((u) => [u.date, u.key])).toEqual([
      ['2026-11-23', 'seg|2026-11-23'],
      ['2026-11-25', 'qua|2026-11-25'],
    ])
  })

  it('plano só conta com texto', () => {
    expect(planHasContent(null)).toBe(false)
    expect(planHasContent({ type: 'doc', content: [{ type: 'paragraph' }] })).toBe(false)
    expect(planHasContent({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '  ' }] }] })).toBe(false)
    expect(planHasContent({ type: 'doc', content: [{ type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Jab' }] }] }] }] })).toBe(true)
  })
})

describe('planShareText', () => {
  it('usa "hoje" no dia da aula e o dia da semana nos outros dias', () => {
    expect(planShareText({ gymName: 'Panobianco', date: '2026-11-19' }, '2026-11-19')).toBe(
      'Mestre, segue o plano de aula de hoje (19/11) na Panobianco para aprovação:',
    )
    expect(planShareText({ gymName: 'Panobianco', date: '2026-11-20' }, '2026-11-19')).toBe(
      'Mestre, segue o plano de aula de sexta (20/11) na Panobianco para aprovação:',
    )
  })
})
