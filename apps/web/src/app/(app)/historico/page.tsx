'use client'

import { addDays, formatMonth, parseISODate } from '@kog/core'
import { EmptyState } from '@kog/ui'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { ClassCard, GymChips } from '@/components/common'
import { Loading, Page } from '@/components/shell'
import { useClassCounts, useClassesRange, useGyms, useToday } from '@/lib/queries'

function shiftMonth(ym: string, delta: number): string {
  const d = parseISODate(`${ym}-01`)
  d.setUTCMonth(d.getUTCMonth() + delta)
  return d.toISOString().slice(0, 7)
}

export default function HistoryPage() {
  const today = useToday()
  const gyms = useGyms()
  const [gymId, setGymId] = useState<string | null>(null)
  const [month, setMonth] = useState(today.slice(0, 7))

  const from = `${month}-01`
  const to = addDays(`${shiftMonth(month, 1)}-01`, -1)
  const classes = useClassesRange(gymId, from, to)
  const counts = useClassCounts(classes.data)
  const gymName = (id: string) => gyms.data?.find((g) => g.id === id)?.name ?? 'Academia'
  const list = (classes.data ?? []).filter((c) => c.date <= today)
  const total = list.reduce((sum, c) => sum + (counts.data?.[c.id] ?? 0), 0)

  return (
    <Page title="Histórico" kicker={`${list.length} aulas · ${total} presenças`} back="/mais">
      <div className="mb-3 flex items-center justify-between rounded-lg border border-line">
        <button type="button" aria-label="Mês anterior" className="flex size-12 items-center justify-center text-accent" onClick={() => setMonth((m) => shiftMonth(m, -1))}>
          <ChevronLeft className="size-5" />
        </button>
        <span className="font-display text-lg uppercase tracking-[0.04em] text-text">{formatMonth(month)}</span>
        <button type="button" aria-label="Próximo mês" disabled={month >= today.slice(0, 7)} className="flex size-12 items-center justify-center text-accent disabled:opacity-30" onClick={() => setMonth((m) => shiftMonth(m, 1))}>
          <ChevronRight className="size-5" />
        </button>
      </div>
      <GymChips gyms={gyms.data ?? []} value={gymId} onChange={setGymId} />

      {classes.isPending ? (
        <Loading />
      ) : list.length === 0 ? (
        <EmptyState title="Nenhuma aula neste mês" />
      ) : (
        <div className="space-y-2">
          {list.map((c) => (
            <ClassCard key={c.id} klass={c} gymName={gymName(c.gym_id)} present={counts.data?.[c.id]} href={`/aula?id=${c.id}`} showDate />
          ))}
        </div>
      )}
    </Page>
  )
}
