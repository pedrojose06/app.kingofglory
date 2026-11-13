'use client'

import {
  isCounted, normalizeName, overlayAttendance, STATUS_LABEL, type AttendanceStatus, type ClassRow, type Student,
} from '@kog/core'
import { Button, EmptyState, Input, Sheet } from '@kog/ui'
import { MoreVertical, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { CheckRow } from '@/components/common'
import { Loading } from '@/components/shell'
import { outbox, useOutbox } from '@/lib/outbox'
import { useClassAttendance, useStudents } from '@/lib/queries'

const STATUSES: AttendanceStatus[] = ['present', 'late', 'justified', 'absent']

export function RollCall({ klass }: { klass: ClassRow }) {
  const students = useStudents()
  const attendance = useClassAttendance(klass.id)
  const items = useOutbox()
  const [search, setSearch] = useState('')
  const [menuFor, setMenuFor] = useState<Student | null>(null)

  const statusOf = useMemo(() => overlayAttendance(attendance.data ?? [], items, klass.id), [attendance.data, items, klass.id])

  // Alunos ativos da academia + inativos que já têm marcação nesta aula.
  const roster = useMemo(
    () => (students.data ?? []).filter((s) => s.gym_id === klass.gym_id && (s.active || statusOf.has(s.id))),
    [students.data, klass.gym_id, statusOf],
  )
  const visible = useMemo(() => {
    const q = normalizeName(search)
    return q ? roster.filter((s) => normalizeName(s.name).includes(q)) : roster
  }, [roster, search])

  const presentCount = roster.filter((s) => {
    const st = statusOf.get(s.id)
    return st ? isCounted(st) : false
  }).length

  const mark = (studentId: string, status: AttendanceStatus) =>
    outbox.add({ type: 'attendance.mark', mark: { class_id: klass.id, student_id: studentId, status, marked_at: new Date().toISOString() } })

  const toggle = (s: Student) => {
    const current = statusOf.get(s.id)
    mark(s.id, current && isCounted(current) ? 'absent' : 'present')
  }

  const markAll = () => {
    for (const s of roster) if (!statusOf.has(s.id) || statusOf.get(s.id) === 'absent') mark(s.id, 'present')
  }

  if (students.isPending || (attendance.isPending && attendance.fetchStatus !== 'paused')) return <Loading />
  if (roster.length === 0) return <EmptyState title="Nenhum aluno ativo nesta academia">Cadastre alunos na aba Alunos.</EmptyState>

  return (
    <div>
      <div className="mb-3 flex items-center gap-3">
        <p className="flex-1" aria-live="polite">
          <span className="font-display text-3xl text-accent">{presentCount}</span>
          <span className="text-sm text-dim"> / {roster.length} presentes</span>
        </p>
        <Button variant="ghost" size="sm" onPress={markAll}>Marcar todos</Button>
      </div>

      {roster.length > 8 ? (
        <div className="relative mb-3">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faint" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar aluno" className="pl-9" type="search" />
        </div>
      ) : null}

      <ul className="space-y-1.5">
        {visible.map((s) => {
          const st = statusOf.get(s.id)
          return (
            <li key={s.id}>
              <CheckRow
                checked={!!st && st !== 'absent'}
                tone={st === 'late' ? 'warning' : st === 'justified' ? 'neutral' : 'success'}
                onPress={() => toggle(s)}
                title={s.name}
                subtitle={st && st !== 'present' ? STATUS_LABEL[st] : !s.active ? 'Inativo' : undefined}
                trailing={
                  <button type="button" onClick={() => setMenuFor(s)} aria-label={`Mais opções para ${s.name}`} className="flex w-11 items-center justify-center text-faint">
                    <MoreVertical className="size-4" />
                  </button>
                }
              />
            </li>
          )
        })}
      </ul>

      <Sheet open={!!menuFor} onClose={() => setMenuFor(null)} title={menuFor?.name ?? ''}>
        <div className="grid grid-cols-2 gap-2">
          {STATUSES.map((st) => (
            <Button
              key={st}
              variant={menuFor && statusOf.get(menuFor.id) === st ? 'gold' : 'ghost'}
              onPress={() => {
                if (menuFor) mark(menuFor.id, st)
                setMenuFor(null)
              }}
            >
              {STATUS_LABEL[st]}
            </Button>
          ))}
        </div>
        <p className="mt-3 text-xs text-dim">Presença e atraso contam para a graduação. Falta, justificada ou não, não conta.</p>
      </Sheet>
    </div>
  )
}
