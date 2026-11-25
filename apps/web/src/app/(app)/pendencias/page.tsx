'use client'

import {
  absenceAlerts, analyzeTurnout, formatDateBR, keys, updateAbsenceThreshold, type Bucket, type GymTurnout, type Insight,
} from '@kog/core'
import { Badge, Button, Card, EmptyState, Field, Input, Sheet } from '@kog/ui'
import { ChevronRight, TrendingDown, TrendingUp, UserX } from 'lucide-react'
import Link from 'next/link'
import { useMemo, useState } from 'react'
import { ClassCard, Section } from '@/components/common'
import { GraduationApprovalsSection } from '@/components/graduation-approvals'
import { GuardianReviewsSection } from '@/components/guardian-term'
import { StudentRequestsSection } from '@/components/student-requests'
import { Loading, Page } from '@/components/shell'
import { useUserId } from '@/lib/auth'
import {
  useAbsenceStreaks, useClassTurnout, useGyms, usePendingClasses, useProfile, useSave, useStudents, useToday,
} from '@/lib/queries'
import { db } from '@/lib/supabase'
import { toast } from '@/lib/toast'

const DEFAULT_THRESHOLD = 5

export default function PendingPage() {
  const gyms = useGyms()
  const pending = usePendingClasses()
  const list = pending.data ?? []
  const gymName = (id: string) => gyms.data?.find((g) => g.id === id)?.name ?? 'Academia'

  return (
    <Page title="Pendências" kicker="Chamadas, alunos, faltas e padrões">
      <div className="[&>section]:mt-0 [&>section]:mb-6"><GraduationApprovalsSection /><StudentRequestsSection /><GuardianReviewsSection /></div>
      {pending.isPending ? (
        <Loading />
      ) : list.length === 0 ? (
        <EmptyState title="Chamadas em dia">Nenhuma chamada acumulada.</EmptyState>
      ) : (
        <>
          <Link href={`/aula?id=${list[0]!.id}&fila=1`} className="mb-4 block">
            <Button size="lg" block>Resolver em sequência ({list.length})</Button>
          </Link>
          <div className="space-y-2">
            {list.map((c) => (
              <ClassCard key={c.id} klass={c} gymName={gymName(c.gym_id)} href={`/aula?id=${c.id}&fila=1`} showDate />
            ))}
          </div>
        </>
      )}

      <AbsenceSection gymName={gymName} />
      <PatternsSection gymName={gymName} />
    </Page>
  )
}

function AbsenceSection({ gymName }: { gymName: (id: string) => string }) {
  const userId = useUserId()
  const profile = useProfile()
  const streaks = useAbsenceStreaks()
  const students = useStudents()
  const threshold = profile.data?.absence_alert_threshold ?? DEFAULT_THRESHOLD
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState('')

  const save = useSave(
    async () => {
      const n = Number(value)
      if (!Number.isInteger(n) || n < 1 || n > 99) throw new Error('Informe um número de 1 a 99')
      await updateAbsenceThreshold(db(), userId, n)
    },
    [keys.profile],
    () => {
      setOpen(false)
      toast('Limite de faltas atualizado')
    },
  )

  const alerts = useMemo(() => absenceAlerts(streaks.data ?? [], threshold), [streaks.data, threshold])
  const studentName = (id: string) => students.data?.find((s) => s.id === id)?.name ?? 'Aluno'

  return (
    <Section
      title={`Mais de ${threshold} faltas seguidas`}
      action={
        <Button size="sm" variant="plain" onPress={() => { setValue(String(threshold)); setOpen(true) }}>
          Ajustar
        </Button>
      }
    >
      {streaks.isPending || students.isPending ? (
        <Loading />
      ) : alerts.length === 0 ? (
        <EmptyState title="Ninguém sumido">Nenhum aluno ativo passou de {threshold} faltas seguidas.</EmptyState>
      ) : (
        <Card className="divide-y divide-line">
          {alerts.map((a) => (
            <Link key={a.student_id} href={`/aluno?id=${a.student_id}`} className="flex min-h-14 items-center gap-3 px-3 py-2 active:bg-tint">
              <UserX className="size-5 shrink-0 text-danger" />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-text">{studentName(a.student_id)}</span>
                <span className="block truncate text-xs text-dim">
                  {gymName(a.gym_id)} · {a.last_present_on ? `última presença ${formatDateBR(a.last_present_on)}` : 'nunca veio'}
                </span>
              </span>
              <Badge tone="danger">{a.absences_in_row} faltas</Badge>
              <ChevronRight className="size-4 shrink-0 text-faint" />
            </Link>
          ))}
        </Card>
      )}
      <p className="mt-2 text-xs text-dim">
        Conta as faltas depois da última presença (presença avulsa também vale). Falta justificada não entra na conta. Só alunos ativos.
      </p>

      <Sheet open={open} onClose={() => setOpen(false)} title="Aviso de faltas">
        <div className="space-y-3">
          <Field label="Avisar quando passar de" hint="Número de faltas seguidas. Vale só para você; cada professor escolhe o seu.">
            <Input type="number" inputMode="numeric" min={1} max={99} value={value} onChange={(e) => setValue(e.target.value)} />
          </Field>
          <Button block loading={save.isPending} onPress={() => save.mutate()}>Salvar</Button>
        </div>
      </Sheet>
    </Section>
  )
}

function PatternsSection({ gymName }: { gymName: (id: string) => string }) {
  const turnout = useClassTurnout()
  const today = useToday()
  const analysis = useMemo(() => (turnout.data ? analyzeTurnout(turnout.data, today) : []), [turnout.data, today])
  const insights = analysis.flatMap((g) => g.insights).sort((a, b) => strengthRank(a) - strengthRank(b) || b.change - a.change)

  return (
    <Section title="Padrões de frequência">
      {turnout.isPending ? (
        <Loading />
      ) : analysis.length === 0 ? (
        <EmptyState title="Poucas aulas ainda">A análise aparece quando uma academia tiver ao menos 12 aulas concluídas.</EmptyState>
      ) : (
        <>
          {insights.length === 0 ? (
            <Card className="p-4 text-sm text-dim">
              Sem padrão claro por enquanto: a lotação varia pouco entre começo e fim do mês e entre os dias da semana.
            </Card>
          ) : (
            <div className="space-y-2">
              {insights.map((i) => <InsightCard key={`${i.gymId}-${i.kind}`} insight={i} gym={gymName(i.gymId)} />)}
            </div>
          )}
          <div className="mt-3 space-y-3">
            {analysis.map((g) => <GymTable key={g.gymId} gym={g} name={gymName(g.gymId)} />)}
          </div>
          <p className="mt-2 text-xs text-dim">
            Média de alunos presentes por aula concluída. “Padrão” é diferença que se repete ao longo dos meses; “sinal leve” pode
            ser acaso e vale acompanhar.
          </p>
        </>
      )}
    </Section>
  )
}

const strengthRank = (i: Insight) => (i.strength === 'strong' ? 0 : 1)

function InsightCard({ insight, gym }: { insight: Insight; gym: string }) {
  const down = insight.kind === 'trend' && insight.text.includes('caindo')
  const Icon = down ? TrendingDown : TrendingUp
  return (
    <Card className="flex items-start gap-3 p-3">
      <Icon className={down ? 'mt-0.5 size-5 shrink-0 text-danger' : 'mt-0.5 size-5 shrink-0 text-accent'} />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-bold uppercase tracking-[0.08em] text-dim">{gym}</p>
        <p className="text-sm text-text">{insight.text}</p>
      </div>
      {insight.strength === 'strong' ? <Badge tone="gold">Padrão</Badge> : <Badge>Sinal leve</Badge>}
    </Card>
  )
}

function GymTable({ gym, name }: { gym: GymTurnout; name: string }) {
  const max = Math.max(...gym.byPeriod.map((b) => b.mean), ...gym.byWeekday.map((b) => b.mean), 1)
  return (
    <Card className="p-3">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <p className="truncate font-bold text-text">{name}</p>
        <p className="shrink-0 text-xs text-dim">{gym.classes} aulas · média {fmt(gym.mean)}</p>
      </div>
      <Rows buckets={gym.byPeriod} max={max} />
      {gym.byWeekday.length > 1 ? <div className="mt-2 border-t border-line pt-2"><Rows buckets={gym.byWeekday} max={max} /></div> : null}
      {gym.trend ? (
        <div className="mt-2 border-t border-line pt-2">
          <Rows buckets={[gym.trend.previous, gym.trend.recent]} max={max} />
        </div>
      ) : null}
    </Card>
  )
}

function Rows({ buckets, max }: { buckets: readonly Bucket[]; max: number }) {
  return (
    <div className="space-y-1">
      {buckets.map((b) => (
        <div key={b.key} className="flex items-center gap-2 text-xs">
          <span className="w-32 shrink-0 truncate text-soft">{b.label}</span>
          <span className="h-2 min-w-0 flex-1 overflow-hidden rounded-sm bg-surface-2">
            <span className="bg-gold-gradient block h-full" style={{ width: `${Math.round((b.mean / max) * 100)}%` }} />
          </span>
          <span className="w-8 shrink-0 text-right font-bold text-text">{fmt(b.mean)}</span>
          <span className="w-14 shrink-0 whitespace-nowrap text-right text-faint">{b.classes} aulas</span>
        </div>
      ))}
    </div>
  )
}

const fmt = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
