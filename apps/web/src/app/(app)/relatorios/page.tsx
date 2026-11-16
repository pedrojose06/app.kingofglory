'use client'

import {
  buildReport, formatDateBR, formatMonth, getReportData, keys, monthRange, shiftMonth, toCsv, type MonthRow, type Report,
} from '@kog/core'
import { Button, Card, Chip, EmptyState, cn } from '@kog/ui'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, Download } from 'lucide-react'
import Link from 'next/link'
import { useMemo, useState } from 'react'
import { GymChips, Section } from '@/components/common'
import { Loading, Page } from '@/components/shell'
import { useGyms, useProgress, useStudents, useToday } from '@/lib/queries'
import { db } from '@/lib/supabase'

const SPANS = [
  { months: 1, label: 'Mês' },
  { months: 3, label: '3 meses' },
  { months: 12, label: '12 meses' },
] as const

const MONTH_SHORT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
const monthShort = (ym: string) => MONTH_SHORT[Number(ym.slice(5, 7)) - 1]!
const num = (n: number, digits = 0) => n.toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits })
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const pct = (r: number | null) => (r === null ? '—' : `${Math.round(r * 100)}%`)

function periodLabel(endMonth: string, months: number): string {
  if (months === 1) return formatMonth(endMonth)
  const start = shiftMonth(endMonth, -(months - 1))
  const year = (ym: string) => ym.slice(0, 4)
  return year(start) === year(endMonth)
    ? `${monthShort(start)}–${monthShort(endMonth)} ${year(endMonth)}`
    : `${monthShort(start)}/${year(start).slice(2)}–${monthShort(endMonth)}/${year(endMonth).slice(2)}`
}

export default function ReportsPage() {
  const today = useToday()
  const gyms = useGyms()
  const students = useStudents()
  const [gymId, setGymId] = useState<string | null>(null)
  const [months, setMonths] = useState<number>(1)
  const [endMonth, setEndMonth] = useState(today.slice(0, 7))

  const period = monthRange(endMonth, months)
  // Busca sempre os 12 meses que terminam no mês final: cobre o período e a evolução mensal.
  const fetchRange = monthRange(endMonth, 12)
  const data = useQuery({
    queryKey: keys.report(fetchRange.from, fetchRange.to),
    queryFn: () => getReportData(db(), fetchRange.from, fetchRange.to),
  })

  const report = useMemo(
    () =>
      data.data && students.data
        ? buildReport({ ...period, ...data.data, students: students.data, gymId, today })
        : null,
    [data.data, students.data, gymId, today, period.from, period.to],
  )

  const gymName = (id: string) => gyms.data?.find((g) => g.id === id)?.name ?? 'Academia'
  const atEnd = endMonth >= today.slice(0, 7)

  function exportCsv(r: Report) {
    const rows = [
      ...r.ranking.map((s) => [s.name, gymName(s.gymId), s.presences, s.absences, s.rate === null ? '' : Math.round(s.rate * 100)]),
      ...r.missing.map((s) => [s.name, gymName(s.gym_id), 0, '', '']),
    ]
    const csv = toCsv(['aluno', 'academia', 'presencas', 'faltas', 'frequencia_%'], rows)
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `relatorio-${period.from}-a-${period.to}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <Page title="Relatórios" kicker="Frequência da equipe" back="/mais">
      <div className="mb-3 flex gap-2">
        {SPANS.map((s) => (
          <Chip key={s.months} active={months === s.months} onPress={() => setMonths(s.months)} className="flex-1">{s.label}</Chip>
        ))}
      </div>
      <div className="mb-3 flex items-center justify-between rounded-lg border border-line">
        <button type="button" aria-label="Período anterior" className="flex size-12 items-center justify-center text-accent" onClick={() => setEndMonth((m) => shiftMonth(m, -months))}>
          <ChevronLeft className="size-5" />
        </button>
        <span className="font-display text-lg uppercase tracking-[0.04em] text-text">{periodLabel(endMonth, months)}</span>
        <button type="button" aria-label="Próximo período" disabled={atEnd} className="flex size-12 items-center justify-center text-accent disabled:opacity-30" onClick={() => setEndMonth((m) => { const next = shiftMonth(m, months); const cur = today.slice(0, 7); return next > cur ? cur : next })}>
          <ChevronRight className="size-5" />
        </button>
      </div>
      <GymChips gyms={gyms.data ?? []} value={gymId} onChange={setGymId} />

      {!report ? (
        data.isError ? <EmptyState title="Não foi possível carregar">Os relatórios precisam de internet.</EmptyState> : <Loading />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
            <Stat label="Aulas dadas" value={num(report.classes)} />
            <Stat label="Presenças" value={num(report.presences)} />
            <Stat label="Média por aula" value={num(report.perClass, 1)} hint="alunos presentes" />
            <Stat label="Frequência" value={pct(report.rate)} hint="presenças ÷ chamadas" />
            <Stat label="Treinaram" value={`${report.trainedStudents}/${report.activeStudents}`} hint="alunos ativos" />
            <Stat label="Graduações" value={num(report.graduations)} hint={report.newStudents.length ? report.newStudents.length === 1 ? '1 aluno novo' : `${report.newStudents.length} alunos novos` : undefined} />
          </div>

          <Section title="Evolução (12 meses)">
            <MonthlyChart rows={report.monthly} from={period.from.slice(0, 7)} to={period.to.slice(0, 7)} />
          </Section>

          {gymId === null && report.byGym.length > 1 ? (
            <Section title="Por academia">
              <Card className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-line text-left text-xs uppercase tracking-[0.08em] text-dim">
                      <th className="px-3 py-2 font-bold">Academia</th>
                      <th className="px-2 py-2 text-right font-bold">Aulas</th>
                      <th className="px-2 py-2 text-right font-bold">Pres.</th>
                      <th className="px-2 py-2 text-right font-bold">Média</th>
                      <th className="px-3 py-2 text-right font-bold">Alunos</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {report.byGym.map((g) => (
                      <tr key={g.gymId}>
                        <td className="max-w-32 truncate px-3 py-2.5 font-medium text-text">{gymName(g.gymId)}</td>
                        <td className="px-2 py-2.5 text-right text-soft">{g.classes}</td>
                        <td className="px-2 py-2.5 text-right text-soft">{g.presences}</td>
                        <td className="px-2 py-2.5 text-right font-bold text-text">{num(g.perClass, 1)}</td>
                        <td className="px-3 py-2.5 text-right text-soft">{g.trainedStudents}/{g.activeStudents}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
              <p className="mt-2 text-xs text-dim">Média: alunos presentes por aula concluída. Alunos: ativos que treinaram no período.</p>
            </Section>
          ) : null}

          <RankingSection report={report} gymName={gymName} showGym={gymId === null && (gyms.data?.length ?? 0) > 1} />
          <MissingSection report={report} gymName={gymName} showGym={gymId === null && (gyms.data?.length ?? 0) > 1} />

          {report.newStudents.length > 0 ? (
            <Section title={`Alunos novos (${report.newStudents.length})`}>
              <Card className="divide-y divide-line">
                {report.newStudents.map((s) => (
                  <Link key={s.id} href={`/aluno?id=${s.id}`} className="flex min-h-12 items-center gap-3 px-3 py-2 active:bg-tint">
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-text">{s.name}</span>
                    <span className="shrink-0 text-xs text-dim">desde {formatDateBR(s.started_on)}</span>
                    <ChevronRight className="size-4 shrink-0 text-faint" />
                  </Link>
                ))}
              </Card>
            </Section>
          ) : null}

          <Section title="Exportar">
            <Button variant="ghost" block onPress={() => exportCsv(report)}><Download className="size-4" /> Baixar relatório (CSV)</Button>
            <p className="mt-2 text-xs text-dim">Uma linha por aluno com presenças, faltas e frequência no período, incluindo quem não treinou.</p>
          </Section>
        </>
      )}
    </Page>
  )
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card className="p-3">
      <p className="text-xs font-bold uppercase tracking-[0.08em] text-dim">{label}</p>
      <p className="mt-1 font-display text-3xl leading-none text-text">{value}</p>
      {hint ? <p className="mt-1 truncate text-xs text-faint">{hint}</p> : null}
    </Card>
  )
}

/** Barras de presenças por mês; os meses do período ficam em destaque. Toque numa barra mostra os números. */
function MonthlyChart({ rows, from, to }: { rows: readonly MonthRow[]; from: string; to: string }) {
  const [selected, setSelected] = useState<string | null>(null)
  const max = Math.max(...rows.map((r) => r.presences), 1)
  const shown = rows.find((r) => r.month === selected) ?? rows.at(-1)!
  return (
    <Card className="p-3">
      <p className="mb-3 text-sm text-soft">
        <span className="font-bold text-text">{capitalize(formatMonth(shown.month))}</span>
        {' · '}
        {num(shown.presences)} presenças em {shown.classes} aulas
      </p>
      <div className="flex h-36 items-end gap-0.5" role="img" aria-label="Presenças por mês nos últimos 12 meses">
        {rows.map((r) => {
          const inPeriod = r.month >= from && r.month <= to
          const active = r.month === shown.month
          return (
            <button
              key={r.month}
              type="button"
              onClick={() => setSelected(r.month)}
              aria-label={`${formatMonth(r.month)}: ${r.presences} presenças`}
              className="flex h-full min-w-0 flex-1 flex-col items-center justify-end"
            >
              <span
                className={cn('block w-full max-w-6 rounded-t', inPeriod ? 'bg-gold-gradient' : 'bg-surface-2', active && 'ring-2 ring-accent ring-offset-2 ring-offset-surface')}
                style={{ height: `${r.presences ? Math.max((r.presences / max) * 100, 3) : 0}%` }}
              />
            </button>
          )
        })}
      </div>
      <div className="mt-1.5 flex gap-0.5 border-t border-line pt-1">
        {rows.map((r) => (
          <span key={r.month} className={cn('min-w-0 flex-1 text-center text-[10px]', r.month === shown.month ? 'font-bold text-text' : 'text-faint')}>
            {monthShort(r.month).charAt(0).toUpperCase()}
          </span>
        ))}
      </div>
    </Card>
  )
}

const TOP = 10

function RankingSection({ report, gymName, showGym }: { report: Report; gymName: (id: string) => string; showGym: boolean }) {
  const [all, setAll] = useState(false)
  const list = all ? report.ranking : report.ranking.slice(0, TOP)
  const max = report.ranking[0]?.presences ?? 1
  return (
    <Section title="Mais assíduos">
      {report.ranking.length === 0 ? (
        <EmptyState title="Nenhuma presença no período" />
      ) : (
        <>
          <Card className="divide-y divide-line">
            {list.map((s, i) => (
              <Link key={s.studentId} href={`/aluno?id=${s.studentId}`} className="flex min-h-14 items-center gap-3 px-3 py-2 active:bg-tint">
                <span className="w-6 shrink-0 text-center font-display text-lg text-accent">{i + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-text">{s.name}</span>
                  <span className="mt-1 block h-1.5 overflow-hidden rounded-sm bg-surface-2">
                    <span className="bg-gold-gradient block h-full" style={{ width: `${Math.round((s.presences / max) * 100)}%` }} />
                  </span>
                  {showGym ? <span className="mt-0.5 block truncate text-xs text-dim">{gymName(s.gymId)}</span> : null}
                </span>
                <span className="shrink-0 text-right">
                  <span className="block text-sm font-bold text-text">{s.presences}</span>
                  <span className="block text-xs text-dim">{pct(s.rate)}</span>
                </span>
              </Link>
            ))}
          </Card>
          {report.ranking.length > TOP ? (
            <Button variant="ghost" block className="mt-2" onPress={() => setAll((v) => !v)}>
              {all ? 'Mostrar só os 10 primeiros' : `Ver todos (${report.ranking.length})`}
            </Button>
          ) : null}
          <p className="mt-2 text-xs text-dim">Presenças no período (aulão conta o valor inteiro) e frequência nas chamadas.</p>
        </>
      )}
    </Section>
  )
}

function MissingSection({ report, gymName, showGym }: { report: Report; gymName: (id: string) => string; showGym: boolean }) {
  const progress = useProgress()
  const lastSeen = new Map((progress.data ?? []).map((p) => [p.student_id, p.last_attendance_on]))
  if (report.missing.length === 0) return null
  return (
    <Section title={`Não treinaram (${report.missing.length})`}>
      <Card className="divide-y divide-line">
        {report.missing.map((s) => {
          const last = lastSeen.get(s.id)
          return (
            <Link key={s.id} href={`/aluno?id=${s.id}`} className="flex min-h-12 items-center gap-3 px-3 py-2 active:bg-tint">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-text">{s.name}</span>
                {showGym ? <span className="block truncate text-xs text-dim">{gymName(s.gym_id)}</span> : null}
              </span>
              <span className="shrink-0 text-xs text-dim">{last ? `última: ${formatDateBR(last)}` : 'sem presença'}</span>
              <ChevronRight className="size-4 shrink-0 text-faint" />
            </Link>
          )
        })}
      </Card>
      <p className="mt-2 text-xs text-dim">Alunos ativos sem nenhuma presença no período.</p>
    </Section>
  )
}
