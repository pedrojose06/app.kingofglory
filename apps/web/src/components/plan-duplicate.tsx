'use client'

import { addDays, ensureScheduledClass, formatDayShort, formatTime, upcomingClasses, type Json, type UpcomingClass } from '@kog/core'
import { Badge, Card, Sheet } from '@kog/ui'
import { CopyPlus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { outbox } from '@/lib/outbox'
import { useClassesRange, useGyms, usePlannedClasses, useSchedules, useToday } from '@/lib/queries'
import { db } from '@/lib/supabase'
import { toast, toastError } from '@/lib/toast'

/** Quantos dias à frente (contando hoje) aparecem como destino da cópia. */
const DAYS = 8

/**
 * Botão "Duplicar" do plano: copia o plano desta aula para uma próxima aula de outra academia.
 * Depois de copiado, o plano da outra aula é independente e pode ser ajustado lá.
 */
export function PlanDuplicateButton({ classId, gymId, getContent }: { classId: string; gymId: string; getContent: () => Json | null }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => {
          if (!getContent()) return toast('Escreva o plano antes de duplicar')
          setOpen(true)
        }}
        aria-label="Duplicar plano para outra academia"
        title="Duplicar plano para outra academia"
        className="flex h-9 items-center gap-1 rounded border border-line px-2.5 text-xs font-bold uppercase tracking-[0.1em] text-accent"
      >
        <CopyPlus className="size-4" /> <span className="hidden sm:inline">Duplicar</span>
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Duplicar plano">
        <DuplicateSheet classId={classId} gymId={gymId} getContent={getContent} onDone={() => setOpen(false)} />
      </Sheet>
    </>
  )
}

function DuplicateSheet({ classId, gymId, getContent, onDone }: { classId: string; gymId: string; getContent: () => Json | null; onDone: () => void }) {
  const today = useToday()
  const gyms = useGyms()
  const schedules = useSchedules()
  const existing = useClassesRange(null, today, addDays(today, DAYS - 1))
  const items = useMemo(
    () =>
      schedules.data && existing.data
        ? upcomingClasses(schedules.data, existing.data, today, DAYS).filter(
            (u) => u.gym_id !== gymId && u.klass?.id !== classId && (!u.klass || u.klass.status === 'scheduled'),
          )
        : [],
    [schedules.data, existing.data, today, gymId, classId],
  )
  const planned = usePlannedClasses(items.flatMap((u) => (u.klass ? [u.klass.id] : [])))
  const [busy, setBusy] = useState<string | null>(null)
  const gymName = (id: string) => gyms.data?.find((g) => g.id === id)?.name ?? 'Academia'

  async function copyTo(u: UpcomingClass, hasPlan: boolean) {
    const content = getContent()
    if (!content) return
    if (hasPlan && !window.confirm('Essa aula já tem plano. Substituir pelo plano desta aula?')) return
    setBusy(u.key)
    try {
      const target = u.klass ?? (u.schedule ? await ensureScheduledClass(db(), u.schedule, u.date) : null)
      if (!target) return
      outbox.add({ type: 'plan.save', classId: target.id, content, updatedAt: new Date().toISOString() })
      onDone()
      toast(`Plano copiado para ${gymName(u.gym_id)} · ${u.date === today ? 'hoje' : formatDayShort(u.date)}`)
    } catch (error) {
      toastError(error)
    } finally {
      setBusy(null)
    }
  }

  if (schedules.isPending || existing.isPending) return <p className="text-sm text-dim">Carregando…</p>
  if (items.length === 0) {
    return <p className="text-sm text-dim">Nenhuma aula de outra academia nos próximos dias.</p>
  }

  return (
    <div className="space-y-2">
      <p className="text-sm text-soft">Escolha a aula que vai receber uma cópia deste plano. Depois você pode ajustar lá.</p>
      {items.map((u) => {
        const hasPlan = !!u.klass && (planned.data ?? []).includes(u.klass.id)
        return (
          <button key={u.key} type="button" disabled={busy !== null} onClick={() => copyTo(u, hasPlan)} className="block w-full text-left disabled:opacity-60">
            <Card className="flex items-center gap-3 p-4 active:bg-tint">
              <div className="w-14 shrink-0 text-center font-display text-xl text-accent">{formatTime(u.start_time) || '—'}</div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold text-text">{gymName(u.gym_id)}</p>
                <p className="truncate text-sm text-dim">{u.date === today ? 'Hoje' : formatDayShort(u.date)} · {u.title}</p>
              </div>
              {busy === u.key ? <Badge>Copiando…</Badge> : hasPlan ? <Badge tone="success">Plano feito</Badge> : <Badge tone="gold">Sem plano</Badge>}
            </Card>
          </button>
        )
      })}
    </div>
  )
}
