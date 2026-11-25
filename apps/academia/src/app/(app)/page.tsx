'use client'

import { formatTime, graduationStatus, TIME_ZONE, todayISO, trackOf } from '@kog/core'
import { Badge, Card } from '@kog/ui'
import { Cake, ChevronRight, ClipboardCheck } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { ageOn, GroupTag } from '@/components/kit'
import { PageHeader } from '@/components/shell'
import { ErrorState, Loading } from '@/components/states'
import { AvatarImage, useStudentPhotoUrls } from '@/components/student-photo'
import { useAcademy } from '@/lib/academy'
import {
  useAcademyProgress, useClassCounts, useClassGroups, useDashboardCounts, useDiaryStudents, useGraduationSchedule, useRanks, useStudents,
  useWeekClasses,
} from '@/lib/queries'

export default function DashboardPage() {
  const { academy, role } = useAcademy()

  if (role === 'membro') {
    return (
      <>
        <PageHeader kicker={academy.name} title="Minha área" />
        <Card className="p-5">
          <p className="font-bold text-text">Em breve, aqui</p>
          <p className="mt-1 text-sm text-soft">Você vai preencher os seus dados, assinar o contrato e acompanhar as suas mensalidades.</p>
        </Card>
      </>
    )
  }

  return (
    <>
      <PageHeader kicker={academy.name} title="Painel" />
      <TodayClasses />
      <Counters />
      <Birthdays />
    </>
  )
}

// ── contadores ────────────────────────────────────────────────────────────────

type Tone = 'danger' | 'warning' | 'gold' | 'success'
const TONE: Record<Tone, string> = {
  danger: 'bg-danger-tint text-danger',
  warning: 'bg-warning-tint text-warning',
  gold: 'bg-tint text-accent',
  success: 'bg-success-tint text-success',
}

function Tile({ value, label, tone, href, onPress, expanded }: {
  value: number | undefined
  label: string
  tone: Tone
  href?: string
  onPress?: () => void
  expanded?: boolean
}) {
  const body = (
    <>
      <span className={`flex w-20 shrink-0 items-center justify-center font-display text-3xl ${value ? TONE[tone] : 'bg-surface-2 text-faint'}`}>
        {value ?? '–'}
      </span>
      <span className="flex min-w-0 flex-1 items-center px-4 py-3 text-sm font-semibold text-text">{label}</span>
      {href || onPress ? (
        <ChevronRight className={`mr-3 size-4 shrink-0 self-center text-dim transition ${expanded ? 'rotate-90' : ''}`} aria-hidden />
      ) : null}
    </>
  )
  const cls = 'flex min-h-16 w-full overflow-hidden rounded-lg border border-line bg-surface text-left transition hover:border-line-strong'
  if (href) return <Link href={href} className={cls}>{body}</Link>
  if (onPress) return <button type="button" onClick={onPress} aria-expanded={expanded} className={cls}>{body}</button>
  return <div className={cls}>{body}</div>
}

function Counters() {
  const { isAdmin } = useAcademy()
  const { today } = useClock()
  const counts = useDashboardCounts(today)
  const eligible = useEligibleStudents(today)
  const [showEligible, setShowEligible] = useState(false)
  const c = counts.data
  const plural = (n: number | undefined, one: string, many: string) => (n === 1 ? one : many)

  return (
    <section aria-label="Resumo" className="mb-6">
      {counts.isError ? <ErrorState error={counts.error} onRetry={() => counts.refetch()} /> : null}
      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {isAdmin ? (
          <>
            <Tile
              value={c?.contractsPending}
              tone="warning"
              label={plural(c?.contractsPending, 'Contrato com pendência', 'Contratos com pendência')}
              href="/alunos?filtro=revisar"
            />
            <Tile value={c?.chargesOverdue} tone="danger" label={plural(c?.chargesOverdue, 'Cobrança em atraso', 'Cobranças em atraso')} />
            <Tile
              value={c?.contractsEnding}
              tone="gold"
              label={plural(c?.contractsEnding, 'Contrato que termina neste mês', 'Contratos que terminam neste mês')}
              href="/alunos?filtro=termina_mes"
            />
            <Tile
              value={c?.schedulesEnding}
              tone="warning"
              label={plural(c?.schedulesEnding, 'Horário da grade que termina neste mês', 'Horários da grade que terminam neste mês')}
              href="/diarios?aba=grade"
            />
          </>
        ) : null}
        <Tile
          value={eligible.data?.length}
          tone="success"
          label={plural(eligible.data?.length, 'Aluno apto a graduar', 'Alunos aptos a graduar')}
          onPress={eligible.data?.length ? () => setShowEligible(!showEligible) : undefined}
          expanded={showEligible}
        />
      </div>
      {showEligible && eligible.data?.length ? (
        <Card className="mt-2 p-2">
          <ul className="divide-y divide-line">
            {eligible.data.map(({ student, next }) => (
              <li key={student.id}>
                <Link href={`/aluno?id=${student.id}`} className="flex items-center gap-3 rounded px-2 py-2.5 hover:bg-surface-2">
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-text">{student.name}</span>
                  {next ? <span className="text-xs text-dim">→ {next}</span> : null}
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </section>
  )
}

/** Alunos ativos com os requisitos do próximo grau cumpridos, pela mesma regra da ficha do aluno. */
function useEligibleStudents(today: string) {
  const students = useDiaryStudents()
  const progress = useAcademyProgress()
  const ranks = useRanks()
  const schedule = useGraduationSchedule()
  const data = useMemo(() => {
    if (!students.data || !progress.data || !ranks.data) return undefined
    const progressOf = new Map(progress.data.map((p) => [p.student_id, p]))
    return students.data
      .filter((s) => s.active)
      .map((s) => {
        const track = trackOf(s)
        const status = graduationStatus(progressOf.get(s.id), ranks.data, s.started_on ?? s.created_at.slice(0, 10), today, {
          track,
          birthDate: s.birth_date,
          graduationOn: schedule.data?.[track] ?? null,
        })
        return { student: s, eligible: status.eligible, next: status.next?.name ?? null }
      })
      .filter((r) => r.eligible)
  }, [students.data, progress.data, ranks.data, schedule.data, today])
  return { data }
}

// ── aniversariantes ───────────────────────────────────────────────────────────

const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']

function Birthdays() {
  const { today } = useClock()
  const students = useStudents()
  const month = today.slice(5, 7)
  const list = useMemo(
    () =>
      (students.data ?? [])
        .filter((s) => s.active && s.birth_date?.slice(5, 7) === month)
        .sort((a, b) => a.birth_date!.slice(8).localeCompare(b.birth_date!.slice(8)) || a.name.localeCompare(b.name, 'pt-BR')),
    [students.data, month],
  )
  const photos = useStudentPhotoUrls(useMemo(() => list.flatMap((s) => (s.photo_path ? [s.photo_path] : [])), [list]))

  return (
    <Card className="overflow-hidden">
      <h2 className="flex items-center gap-2 border-b border-line px-4 py-3 text-sm font-bold text-text">
        <Cake className="size-4 text-accent" /> Aniversariantes de {MONTHS[Number(month) - 1]}
      </h2>
      {students.isPending ? (
        <Loading />
      ) : list.length === 0 ? (
        <p className="px-4 py-4 text-sm text-dim">Nenhum aluno ativo faz aniversário neste mês.</p>
      ) : (
        <ul className="divide-y divide-line">
          {list.map((s) => {
            const day = s.birth_date!.slice(8)
            const isToday = s.birth_date!.slice(5) === today.slice(5)
            const past = s.birth_date!.slice(5) < today.slice(5)
            return (
              <li key={s.id}>
                <Link href={`/aluno?id=${s.id}`} className={`flex items-center gap-3 px-4 py-3 hover:bg-surface-2 ${isToday ? 'bg-tint' : ''}`}>
                  <AvatarImage url={s.photo_path ? photos.data?.[s.photo_path] : null} name={s.name} className="size-10" />
                  <span className="min-w-0 flex-1">
                    <span className={`block text-sm font-bold ${past && !isToday ? 'text-dim' : 'text-text'}`}>
                      {day} de {MONTHS[Number(month) - 1]}
                      {isToday ? <Badge tone="gold" className="ml-2">Hoje</Badge> : null}
                    </span>
                    <span className="block truncate text-sm text-accent">
                      {s.name}
                      {s.birth_date ? <span className="ml-1.5 text-xs text-dim">faz {ageOn(s.birth_date, `${today.slice(0, 4)}-12-31`)} anos</span> : null}
                    </span>
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}

const clockFmt = new Intl.DateTimeFormat('en-GB', { timeZone: TIME_ZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })

/** Dia e hora em São Paulo ('YYYY-MM-DD' e 'HH:MM'), atualizados a cada minuto (a tela pode ficar aberta o dia todo). */
function useClock(): { today: string; time: string } {
  const read = () => {
    const now = new Date()
    return { today: todayISO(now), time: clockFmt.format(now) }
  }
  const [clock, setClock] = useState(read)
  useEffect(() => {
    const timer = window.setInterval(() => setClock(read()), 30_000)
    return () => window.clearInterval(timer)
  }, [])
  return clock
}

/**
 * Aulas de hoje que já começaram e ainda esperam a chamada. O card aparece no horário da aula (aula sem horário: o dia
 * todo), leva ao diário dela e some quando a chamada é concluída (ou a aula é cancelada) ou quando o dia acaba.
 */
function TodayClasses() {
  const { today, time } = useClock()
  const classes = useWeekClasses(today, today)
  const groups = useClassGroups()
  const groupById = useMemo(() => new Map((groups.data ?? []).map((g) => [g.id, g])), [groups.data])
  const open = useMemo(
    () =>
      (classes.data ?? [])
        .filter((c) => c.date === today && c.status === 'scheduled' && (!c.start_time || formatTime(c.start_time) <= time))
        .sort((a, b) => (a.start_time ?? '99').localeCompare(b.start_time ?? '99')),
    [classes.data, today, time],
  )
  const counts = useClassCounts(useMemo(() => open.map((c) => c.id), [open]))

  if (open.length === 0) return null

  return (
    <section aria-label="Aulas de hoje" className="mb-6">
      <h2 className="kicker mb-2 flex items-center gap-2 text-accent">
        <ClipboardCheck className="size-4" /> Aulas de hoje · chamada em aberto
      </h2>
      <ul className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {open.map((c) => {
          const group = c.group_id ? groupById.get(c.group_id) : undefined
          const present = counts.data?.[c.id] ?? 0
          return (
            <li key={c.id}>
              <Link
                href={`/diario?id=${c.id}`}
                className="flex items-center gap-3 rounded-lg border border-gold bg-surface p-4 transition hover:border-line-strong"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-display text-2xl leading-none text-accent">{c.start_time ? formatTime(c.start_time) : '--:--'}</p>
                    <Badge tone="gold">Fazer chamada</Badge>
                  </div>
                  <p className="mt-2 truncate font-semibold text-text">{c.title}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-dim">
                    {group ? <GroupTag name={group.name} color={group.color} /> : <span>Sem turma</span>}
                    {present > 0 ? <span>{present} {present === 1 ? 'presente' : 'presentes'}</span> : null}
                  </div>
                </div>
                <ChevronRight className="size-5 shrink-0 text-dim" aria-hidden />
              </Link>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
