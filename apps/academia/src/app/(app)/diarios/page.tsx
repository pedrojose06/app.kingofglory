'use client'

import {
  addDays, type ClassRow, type ClassSchedule, formatDateBR, formatDayLong, formatTime, groupByDate, todayISO, weekOf, WEEKDAYS,
} from '@kog/core'
import { Badge, Button, Card, EmptyState, Select } from '@kog/ui'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Suspense, useMemo, useState } from 'react'
import { NewClassDialog, ScheduleDialog, useToggleSchedule } from '@/components/diary-dialogs'
import { GroupTag } from '@/components/kit'
import { PageHeader } from '@/components/shell'
import { ErrorState, Loading } from '@/components/states'
import { useAcademy } from '@/lib/academy'
import { useClassCounts, useClassGroups, useSchedules, useWeekClasses } from '@/lib/queries'

type Tab = 'semana' | 'grade'

export default function DiariesPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Diaries />
    </Suspense>
  )
}

function Diaries() {
  const params = useSearchParams()
  const { academy, isAdmin } = useAcademy()
  const [tab, setTab] = useState<Tab>(params.get('aba') === 'grade' ? 'grade' : 'semana')
  const [creating, setCreating] = useState(false)
  const [scheduleDialog, setScheduleDialog] = useState<ClassSchedule | 'new' | null>(null)

  return (
    <>
      <PageHeader
        kicker={academy.name}
        title="Diários de aula"
        actions={
          <>
            {isAdmin && tab === 'grade' ? (
              <Button variant="ghost" onPress={() => setScheduleDialog('new')}>
                <Plus className="size-4" /> Horário
              </Button>
            ) : null}
            <Button onPress={() => setCreating(true)}>
              <Plus className="size-4" /> Nova aula
            </Button>
          </>
        }
      />
      <div className="mb-6 flex gap-1 border-b border-line">
        {(['semana', 'grade'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            aria-pressed={tab === t}
            className={`-mb-px border-b-2 px-3 py-2.5 text-sm font-bold ${tab === t ? 'border-gold text-accent' : 'border-transparent text-dim hover:text-text'}`}
          >
            {t === 'semana' ? 'Semana' : 'Grade de horários'}
          </button>
        ))}
      </div>

      {tab === 'semana' ? <Week /> : <Grade onEdit={setScheduleDialog} />}

      {creating ? <NewClassDialog defaultDate={todayISO()} onClose={() => setCreating(false)} /> : null}
      {scheduleDialog ? <ScheduleDialog schedule={scheduleDialog === 'new' ? null : scheduleDialog} onClose={() => setScheduleDialog(null)} /> : null}
    </>
  )
}

// ── semana ────────────────────────────────────────────────────────────────────

function Week() {
  const today = todayISO()
  const [anchor, setAnchor] = useState(today)
  const [groupId, setGroupId] = useState('')
  const { from, to } = weekOf(anchor)
  const classes = useWeekClasses(from, to)
  const groups = useClassGroups()
  const groupById = useMemo(() => new Map((groups.data ?? []).map((g) => [g.id, g])), [groups.data])
  const visible = useMemo(() => (classes.data ?? []).filter((c) => !groupId || c.group_id === groupId), [classes.data, groupId])
  const counts = useClassCounts(useMemo(() => visible.map((c) => c.id), [visible]))
  const days = useMemo(() => groupByDate(visible), [visible])
  const thisWeek = weekOf(today).from === from

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" aria-label="Semana anterior" onPress={() => setAnchor(addDays(from, -7))}>
          <ChevronLeft className="size-4" />
        </Button>
        <p className="min-w-44 text-center text-sm font-bold text-text">
          {formatDateBR(from).slice(0, 5)} a {formatDateBR(to).slice(0, 5)}
          {thisWeek ? <span className="ml-2 font-normal text-dim">esta semana</span> : null}
        </p>
        <Button variant="ghost" size="sm" aria-label="Próxima semana" onPress={() => setAnchor(addDays(from, 7))}>
          <ChevronRight className="size-4" />
        </Button>
        {!thisWeek ? (
          <Button variant="plain" size="sm" onPress={() => setAnchor(today)}>Hoje</Button>
        ) : null}
        <Select value={groupId} onChange={(e) => setGroupId(e.target.value)} aria-label="Turma" className="ml-auto h-10 w-auto min-w-44 py-0 text-sm">
          <option value="">Todas as turmas</option>
          {(groups.data ?? []).map((g) => (
            <option key={g.id} value={g.id}>{g.name}</option>
          ))}
        </Select>
      </div>

      {classes.isPending ? (
        <Loading label="Carregando aulas…" />
      ) : classes.isError ? (
        <ErrorState error={classes.error} onRetry={() => classes.refetch()} />
      ) : days.length === 0 ? (
        <EmptyState title="Nenhuma aula nesta semana.">
          As aulas da grade aparecem sozinhas. Monte a grade na aba ao lado ou lance uma aula avulsa em &ldquo;Nova aula&rdquo;.
        </EmptyState>
      ) : (
        <div className="space-y-6">
          {days.map((day) => (
            <section key={day.date} aria-label={formatDayLong(day.date)}>
              <h2 className={`kicker mb-2 ${day.date === today ? 'text-accent' : ''}`}>
                {formatDayLong(day.date)}
                {day.date === today ? ' · hoje' : ''}
              </h2>
              <ul className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                {day.classes.map((c) => {
                  const group = c.group_id ? groupById.get(c.group_id) : undefined
                  return (
                    <li key={c.id}>
                      <ClassCard klass={c} today={today} present={counts.data?.[c.id]} group={group ? { name: group.name, color: group.color } : null} />
                    </li>
                  )
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </>
  )
}

function StatusBadge({ klass, today }: { klass: ClassRow; today: string }) {
  if (klass.status === 'cancelled') return <Badge tone="neutral">Cancelada</Badge>
  if (klass.status === 'done') return <Badge tone="success">Concluída</Badge>
  if (klass.date < today) return <Badge tone="warning">Chamada pendente</Badge>
  if (klass.date === today) return <Badge tone="gold">Em aberto</Badge>
  return <Badge tone="neutral">Agendada</Badge>
}

function ClassCard({ klass, today, present, group }: { klass: ClassRow; today: string; present: number | undefined; group: { name: string; color: string | null } | null }) {
  return (
    <Link href={`/diario?id=${klass.id}`} className="block rounded-lg border border-line bg-surface p-4 transition hover:border-line-strong">
      <div className="flex items-start justify-between gap-2">
        <p className="font-display text-2xl leading-none text-accent">{klass.start_time ? formatTime(klass.start_time) : '--:--'}</p>
        <StatusBadge klass={klass} today={today} />
      </div>
      <p className="mt-2 truncate font-semibold text-text">{klass.title}</p>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-dim">
        {group ? <GroupTag name={group.name} color={group.color} /> : <span>Sem turma</span>}
        {klass.status !== 'cancelled' && present != null && present > 0 ? <span>{present} {present === 1 ? 'presente' : 'presentes'}</span> : null}
      </div>
    </Link>
  )
}

// ── grade ─────────────────────────────────────────────────────────────────────

function Grade({ onEdit }: { onEdit: (s: ClassSchedule) => void }) {
  const { isAdmin } = useAcademy()
  const schedules = useSchedules()
  const groups = useClassGroups()
  const toggle = useToggleSchedule()
  const groupById = useMemo(() => new Map((groups.data ?? []).map((g) => [g.id, g])), [groups.data])
  const [showEnded, setShowEnded] = useState(false)

  if (schedules.isPending) return <Loading />
  if (schedules.isError) return <ErrorState error={schedules.error} onRetry={() => schedules.refetch()} />
  const list = schedules.data.filter((s) => showEnded || s.active)
  const ended = schedules.data.filter((s) => !s.active).length
  // Segunda primeiro: a semana da academia começa na segunda e o domingo fecha a lista.
  const order = [1, 2, 3, 4, 5, 6, 0]

  if (schedules.data.length === 0) {
    return (
      <EmptyState title="A grade ainda está vazia.">
        {isAdmin
          ? 'Cadastre os horários de cada turma em “Horário”: as aulas passam a aparecer sozinhas na semana.'
          : 'O administrador cadastra os horários de cada turma; as aulas passam a aparecer sozinhas na semana.'}
      </EmptyState>
    )
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {order.map((weekday) => {
          const day = list.filter((s) => s.weekday === weekday).sort((a, b) => a.start_time.localeCompare(b.start_time))
          return (
            <Card key={weekday} className="p-4">
              <h2 className="kicker mb-3">{WEEKDAYS[weekday]}</h2>
              {day.length === 0 ? (
                <p className="text-sm text-faint">Sem aulas</p>
              ) : (
                <ul className="space-y-2">
                  {day.map((s) => {
                    const group = s.group_id ? groupById.get(s.group_id) : undefined
                    return (
                      <li key={s.id} className="rounded border border-line p-3" style={{ borderLeftWidth: 4, borderLeftColor: group?.color ?? 'var(--kog-gold)' }}>
                        <p className="font-display text-xl leading-none text-accent">{formatTime(s.start_time)}</p>
                        <p className="mt-1 truncate text-sm font-semibold text-text">{s.title}</p>
                        <p className="mt-0.5 text-xs text-dim">
                          {group?.name ?? 'Sem turma'}
                          {s.ends_on ? ` · até ${formatDateBR(s.ends_on)}` : ''}
                          {!s.active ? ' · encerrado' : ''}
                        </p>
                        {isAdmin ? (
                          <div className="mt-2 flex gap-3 text-xs font-semibold">
                            <button type="button" className="text-accent hover:underline" onClick={() => onEdit(s)}>Editar</button>
                            <button
                              type="button"
                              className="text-accent hover:underline"
                              disabled={toggle.isPending}
                              onClick={() => {
                                if (!s.active || window.confirm('Encerrar este horário? Ele deixa de gerar aulas; as já geradas e as presenças continuam.')) {
                                  toggle.mutate({ id: s.id, active: !s.active })
                                }
                              }}
                            >
                              {s.active ? 'Encerrar' : 'Reativar'}
                            </button>
                          </div>
                        ) : null}
                      </li>
                    )
                  })}
                </ul>
              )}
            </Card>
          )
        })}
      </div>
      {ended > 0 ? (
        <button type="button" className="text-xs font-semibold text-accent hover:underline" onClick={() => setShowEnded(!showEnded)}>
          {showEnded ? 'Esconder' : 'Mostrar'} horários encerrados ({ended})
        </button>
      ) : null}
    </div>
  )
}
