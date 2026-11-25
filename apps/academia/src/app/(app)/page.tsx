'use client'

import { formatTime, TIME_ZONE, todayISO } from '@kog/core'
import { Badge, Card } from '@kog/ui'
import { CalendarDays, ChevronRight, ClipboardCheck, FileSignature, Users, Wallet } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { GroupTag } from '@/components/kit'
import { PageHeader } from '@/components/shell'
import { useAcademy } from '@/lib/academy'
import { useClassCounts, useClassGroups, useWeekClasses } from '@/lib/queries'

const ROADMAP = [
  { icon: Users, title: 'Cadastros e matrículas', text: 'Alunos, responsáveis, planos, turmas e contratos de matrícula com as parcelas geradas.' },
  { icon: Wallet, title: 'Mensalidades', text: 'Em aberto, atrasados e pagos por mês, baixa com forma de pagamento e exportação.' },
  { icon: CalendarDays, title: 'Diários de aula', text: 'Grade da semana com presentes por aula e a chamada de cada turma.' },
  { icon: FileSignature, title: 'Contratos', text: 'Termo de uso do espaço e de imagem, assinado no sistema com trilha de evidência.' },
]

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
      <Card className="p-5">
        <p className="font-bold text-text">O painel chega junto com os módulos</p>
        <p className="mt-1 text-sm text-soft">
          Contratos com pendência, cobranças em atraso, resumo do mês e aulas do dia aparecem aqui assim que os cadastros e o
          financeiro estiverem no ar. A ordem de entrega:
        </p>
      </Card>
      <ol className="mt-4 grid gap-3 sm:grid-cols-2">
        {ROADMAP.map(({ icon: Icon, title, text }, i) => (
          <li key={title}>
            <Card className="flex h-full gap-4 p-5">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-tint text-accent">
                <Icon className="size-5" />
              </span>
              <div>
                <p className="kicker">Etapa {i + 1}</p>
                <p className="mt-1 font-bold text-text">{title}</p>
                <p className="mt-1 text-sm text-soft">{text}</p>
              </div>
            </Card>
          </li>
        ))}
      </ol>
    </>
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
