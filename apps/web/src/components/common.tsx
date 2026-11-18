'use client'

import { formatDayShort, formatTime, PLAN_REVIEW_LABEL, STATUS_LABEL, type AttendanceStatus, type PlanReviewStatus, type ClassRow, type Gym, type Student } from '@kog/core'
import { Badge, Card, Chip, cn } from '@kog/ui'
import { Check, ChevronRight } from 'lucide-react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import type { ReactNode } from 'react'

export const useParam = (name: string) => useSearchParams().get(name) ?? ''

/** Início do aluno; o cache offline pode ter alunos salvos antes de started_on existir. */
export const studentSince = (s: Pick<Student, 'started_on' | 'created_at'>) => s.started_on ?? s.created_at.slice(0, 10)

/** Filtro de academia em chips; `null` = todas. Some quando há só uma academia. */
export function GymChips({ gyms, value, onChange, all = true }: { gyms: readonly Gym[]; value: string | null; onChange: (id: string | null) => void; all?: boolean }) {
  if (gyms.length < 2) return null
  return (
    <div className="-mx-4 mb-3 flex gap-2 overflow-x-auto px-4 pb-1">
      {all ? (
        <Chip active={value === null} onPress={() => onChange(null)}>Todas</Chip>
      ) : null}
      {gyms.map((g) => (
        <Chip key={g.id} active={value === g.id} onPress={() => onChange(g.id)}>{g.name}</Chip>
      ))}
    </div>
  )
}

const STATUS_TONE: Record<AttendanceStatus, 'success' | 'danger' | 'warning' | 'neutral'> = {
  present: 'success',
  absent: 'danger',
  late: 'warning',
  justified: 'neutral',
}

export function StatusBadge({ status }: { status: AttendanceStatus }) {
  return <Badge tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Badge>
}

/** Selo da revisão do mestre no plano compartilhado. */
export function PlanReviewBadge({ status }: { status: PlanReviewStatus }) {
  return <Badge tone={status === 'approved' ? 'success' : 'warning'}>{PLAN_REVIEW_LABEL[status]}</Badge>
}

export function ClassCard({ klass, gymName, present, href, showDate, review }: { klass: ClassRow; gymName: string; present?: number; href: string; showDate?: boolean; review?: PlanReviewStatus }) {
  return (
    <Link href={href} className="block">
      <Card className="flex items-center gap-3 p-4 active:bg-tint">
        <div className="w-14 shrink-0 text-center font-display text-xl text-accent">{formatTime(klass.start_time) || '—'}</div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-bold text-text">{gymName}</p>
          <p className="truncate text-sm text-dim">
            {showDate ? `${formatDayShort(klass.date)} · ` : ''}
            {klass.title}
            {present != null && present > 0 ? ` · ${present} presentes` : ''}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {klass.status === 'done' ? <Badge tone="success">Concluída</Badge> : klass.status === 'cancelled' ? <Badge>Cancelada</Badge> : <Badge tone="gold">Em aberto</Badge>}
          {review ? <PlanReviewBadge status={review} /> : null}
        </div>
        <ChevronRight className="size-4 shrink-0 text-faint" />
      </Card>
    </Link>
  )
}

/** Linha grande e tocável com marca de seleção — usada em chamada e presença avulsa. */
export function CheckRow({ checked, onPress, title, subtitle, trailing, tone = 'success' }: { checked: boolean; onPress: () => void; title: string; subtitle?: ReactNode; trailing?: ReactNode; tone?: 'success' | 'warning' | 'neutral' }) {
  const toneCls = tone === 'warning' ? 'border-warning bg-warning text-ink' : tone === 'neutral' ? 'border-dim bg-dim text-bg' : 'border-success bg-success text-bg'
  return (
    <div className={cn('flex items-stretch rounded-lg border', checked ? 'border-line-strong bg-surface' : 'border-line')}>
      <button type="button" onClick={onPress} aria-pressed={checked} className="flex min-h-14 min-w-0 flex-1 items-center gap-3 px-3 py-2 text-left">
        <span className={cn('flex size-7 shrink-0 items-center justify-center rounded border-2', checked ? toneCls : 'border-line-strong')}>
          {checked ? <Check className="size-4" strokeWidth={3} /> : null}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium text-text">{title}</span>
          {subtitle ? <span className="block truncate text-xs text-dim">{subtitle}</span> : null}
        </span>
      </button>
      {trailing}
    </div>
  )
}

export function Section({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="mt-6">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="kicker">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}
