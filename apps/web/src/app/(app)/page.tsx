'use client'

import { addDays, createClass, ensureScheduledClass, formatDayLong, formatDayShort, formatTime, upcomingClasses, type UpcomingClass } from '@kog/core'
import { Badge, Button, Card, EmptyState, Sheet } from '@kog/ui'
import { ChevronRight, MapPinPlus, Plus } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'
import { ClassCard, PlanReviewBadge, Section } from '@/components/common'
import { Loading, Page } from '@/components/shell'
import { useClassCounts, useClassesByDate, useClassesRange, useGyms, usePendingClasses, usePlannedClasses, usePlanReviews, useSave, useSchedules, useToday } from '@/lib/queries'
import { toastError } from '@/lib/toast'

/** Quantos dias à frente aparecem em "Próximas aulas" (para adiantar o plano). */
const UPCOMING_DAYS = 7
import { db } from '@/lib/supabase'

export default function TodayPage() {
  const today = useToday()
  const router = useRouter()
  const gyms = useGyms()
  const classes = useClassesByDate(today)
  const pending = usePendingClasses()
  const counts = useClassCounts(classes.data)
  const reviews = usePlanReviews((classes.data ?? []).map((c) => c.id))
  const [extraOpen, setExtraOpen] = useState(false)

  const createExtra = useSave(
    (gymId: string) => createClass(db(), { gym_id: gymId, date: today, title: 'Aula extra' }),
    [['classes']],
    (klass) => router.push(`/aula?id=${klass.id}`),
  )

  const gymName = (id: string) => gyms.data?.find((g) => g.id === id)?.name ?? 'Academia'
  const pendingCount = pending.data?.length ?? 0

  return (
    <Page title="Hoje" kicker={formatDayLong(today)}>
      {gyms.isPending || classes.isPending ? (
        <Loading />
      ) : gyms.data?.length === 0 ? (
        <EmptyState title="Comece cadastrando suas academias" action={<Link href="/academias"><Button>Cadastrar academia</Button></Link>}>
          Depois defina a grade semanal: as aulas aparecem aqui sozinhas.
        </EmptyState>
      ) : (
        <>
          {pendingCount > 0 ? (
            <Link href="/pendencias" className="mb-4 block">
              <Card className="flex items-center gap-3 border-line-strong bg-tint p-4">
                <span className="font-display text-3xl text-accent">{pendingCount}</span>
                <span className="flex-1 text-sm font-medium text-soft">
                  {pendingCount === 1 ? 'aula passada sem chamada' : 'aulas passadas sem chamada'}
                </span>
                <span className="text-xs font-bold uppercase tracking-[0.1em] text-accent">Resolver</span>
                <ChevronRight className="size-4 text-accent" />
              </Card>
            </Link>
          ) : null}

          <div className="space-y-2">
            {(classes.data ?? []).map((c) => (
              <ClassCard key={c.id} klass={c} gymName={gymName(c.gym_id)} present={counts.data?.[c.id]} review={reviews.data?.[c.id]} href={`/aula?id=${c.id}`} />
            ))}
            {classes.data?.length === 0 ? (
              <EmptyState title="Sem aulas na grade hoje">Deu aula mesmo assim? Crie uma aula extra.</EmptyState>
            ) : null}
          </div>

          <UpcomingSection today={today} gymName={gymName} />

          <Section title="Atalhos">
            <div className="grid grid-cols-2 gap-2">
              <Link href="/avulsa">
                <Button variant="ghost" block className="h-14 px-2 text-xs"><MapPinPlus className="size-4" /> Presença avulsa</Button>
              </Link>
              <Button variant="ghost" block className="h-14 px-2 text-xs" onPress={() => (gyms.data?.length === 1 ? createExtra.mutate(gyms.data[0]!.id) : setExtraOpen(true))} loading={createExtra.isPending}>
                <Plus className="size-4" /> Aula extra
              </Button>
            </div>
          </Section>
        </>
      )}

      <Sheet open={extraOpen} onClose={() => setExtraOpen(false)} title="Aula extra em…">
        <div className="space-y-2">
          {(gyms.data ?? []).map((g) => (
            <Button key={g.id} variant="ghost" block onPress={() => { setExtraOpen(false); createExtra.mutate(g.id) }}>{g.name}</Button>
          ))}
        </div>
      </Sheet>
    </Page>
  )
}

/** Próximas aulas (a partir de amanhã): toque abre o plano, gerando a aula da grade se ainda não existe. */
function UpcomingSection({ today, gymName }: { today: string; gymName: (id: string) => string }) {
  const router = useRouter()
  const schedules = useSchedules()
  const from = addDays(today, 1)
  const to = addDays(today, UPCOMING_DAYS)
  const existing = useClassesRange(null, from, to)
  const items = useMemo(
    () => (schedules.data && existing.data ? upcomingClasses(schedules.data, existing.data, from, UPCOMING_DAYS) : []),
    [schedules.data, existing.data, from],
  )
  const classIds = items.flatMap((u) => (u.klass ? [u.klass.id] : []))
  const planned = usePlannedClasses(classIds)
  const reviews = usePlanReviews(classIds)
  const [opening, setOpening] = useState<string | null>(null)

  async function open(u: UpcomingClass) {
    if (u.klass) return router.push(`/aula?id=${u.klass.id}&aba=plano`)
    if (!u.schedule) return
    setOpening(u.key)
    try {
      const klass = await ensureScheduledClass(db(), u.schedule, u.date)
      router.push(`/aula?id=${klass.id}&aba=plano`)
    } catch (error) {
      toastError(error)
    } finally {
      setOpening(null)
    }
  }

  if (items.length === 0) return null
  return (
    <Section title="Próximas aulas">
      <div className="space-y-2">
        {items.map((u) => {
          const done = !!u.klass && (planned.data ?? []).includes(u.klass.id)
          const review = u.klass ? reviews.data?.[u.klass.id] : undefined
          return (
            <button key={u.key} type="button" disabled={opening !== null} onClick={() => open(u)} className="block w-full text-left disabled:opacity-60">
              <Card className="flex items-center gap-3 p-4 active:bg-tint">
                <div className="w-14 shrink-0 text-center font-display text-xl text-accent">{formatTime(u.start_time) || '—'}</div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold text-text">{gymName(u.gym_id)}</p>
                  <p className="truncate text-sm text-dim">{formatDayShort(u.date)} · {u.title}</p>
                </div>
                {opening === u.key ? <Badge>Abrindo…</Badge> : review ? <PlanReviewBadge status={review} /> : done ? <Badge tone="success">Plano feito</Badge> : <Badge tone="gold">Sem plano</Badge>}
                <ChevronRight className="size-4 shrink-0 text-faint" />
              </Card>
            </button>
          )
        })}
      </div>
      <p className="mt-2 text-xs text-dim">Toque numa aula para adiantar o plano.</p>
    </Section>
  )
}
