'use client'

import {
  type AttendanceMark, type AttendanceStatus, classRoster, type ClassRow, isCounted, markAttendanceBatch, normalizeName, STATUS_LABEL,
} from '@kog/core'
import { Badge, Button, EmptyState, Input } from '@kog/ui'
import { toastError } from '@kog/web-kit'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Check, MoreVertical, Search, UserPlus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Dialog } from '@/components/kit'
import { ErrorState, Loading } from '@/components/states'
import { useAcademy } from '@/lib/academy'
import { keys, useClassAttendance, useDiaryStudents, useMemberships } from '@/lib/queries'
import { db } from '@/lib/supabase'

const STATUSES: AttendanceStatus[] = ['present', 'late', 'justified', 'absent']

/** Marca presenças da aula. A tela já mostra a marcação enquanto o envio acontece; se falhar, volta ao que estava. */
export function useMarkAttendance(classId: string) {
  const { academy } = useAcademy()
  const queryClient = useQueryClient()
  const [local, setLocal] = useState<ReadonlyMap<string, AttendanceStatus>>(new Map())
  const drop = (marks: readonly AttendanceMark[]) =>
    setLocal((prev) => {
      const next = new Map(prev)
      for (const m of marks) next.delete(m.student_id)
      return next
    })

  const mutation = useMutation({
    mutationFn: (marks: AttendanceMark[]) => markAttendanceBatch(db(), marks),
    onMutate: (marks) => setLocal((prev) => new Map([...prev, ...marks.map((m) => [m.student_id, m.status] as const)])),
    onError: (error, marks) => {
      drop(marks)
      toastError(error)
    },
    onSettled: async (_data, _error, marks) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: keys.classAttendance(academy.gym_id, classId) }),
        // Semana e contagem de presentes (as chaves das aulas começam por [academia, gymId, 'aulas']).
        queryClient.invalidateQueries({ queryKey: [...keys.all(academy.gym_id), 'aulas'] }),
      ])
      drop(marks)
    },
  })

  const mark = (studentIds: readonly string[], status: AttendanceStatus, source: AttendanceMark['source'] = 'manual') => {
    const marked_at = new Date().toISOString()
    mutation.mutate(studentIds.map((student_id) => ({ class_id: classId, student_id, status, marked_at, source })))
  }
  return { mark, local, isPending: mutation.isPending }
}

export function DiaryRollCall({ klass, canEdit }: { klass: ClassRow; canEdit: boolean }) {
  const students = useDiaryStudents()
  const memberships = useMemberships()
  const attendance = useClassAttendance(klass.id)
  const { mark, local } = useMarkAttendance(klass.id)
  const [search, setSearch] = useState('')
  const [menuFor, setMenuFor] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  const statusOf = useMemo(() => {
    const map = new Map<string, AttendanceStatus>((attendance.data ?? []).map((a) => [a.student_id, a.status]))
    for (const [id, status] of local) map.set(id, status)
    return map
  }, [attendance.data, local])

  const roster = useMemo(
    () => classRoster(klass, students.data ?? [], memberships.data ?? [], new Set(statusOf.keys())),
    [klass, students.data, memberships.data, statusOf],
  )
  const rosterIds = useMemo(() => new Set(roster.map((s) => s.id)), [roster])
  const visible = useMemo(() => {
    const q = normalizeName(search)
    return q ? roster.filter((s) => normalizeName(s.name).includes(q)) : roster
  }, [roster, search])
  const present = roster.filter((s) => {
    const st = statusOf.get(s.id)
    return st ? isCounted(st) : false
  }).length

  if (students.isPending || memberships.isPending || attendance.isPending) return <Loading />
  if (students.isError || memberships.isError || attendance.isError) {
    return <ErrorState error={students.error ?? memberships.error ?? attendance.error} onRetry={() => { void students.refetch(); void memberships.refetch(); void attendance.refetch() }} />
  }

  const toggle = (id: string) => {
    const current = statusOf.get(id)
    mark([id], current && isCounted(current) ? 'absent' : 'present')
  }
  const markAll = () => mark(roster.filter((s) => !statusOf.has(s.id) || statusOf.get(s.id) === 'absent').map((s) => s.id), 'present')
  const menuStudent = menuFor ? roster.find((s) => s.id === menuFor) : undefined

  if (roster.length === 0 && !adding) {
    return (
      <>
        <EmptyState
          title={klass.group_id ? 'Nenhum aluno ativo nesta turma' : 'Nenhum aluno ativo na academia'}
          action={canEdit ? <Button onPress={() => setAdding(true)}><UserPlus className="size-4" /> Adicionar aluno</Button> : undefined}
        >
          {klass.group_id ? 'Coloque os alunos na turma em Cadastros › Alunos, ou adicione quem veio só nesta aula.' : 'Cadastre os alunos em Cadastros › Alunos.'}
        </EmptyState>
      </>
    )
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <p className="mr-auto" aria-live="polite">
          <span className="font-display text-4xl text-accent">{present}</span>
          <span className="text-sm text-dim"> / {roster.length} presentes</span>
        </p>
        {roster.length > 8 ? (
          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faint" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar aluno" className="h-10 pl-9 text-sm" type="search" />
          </div>
        ) : null}
        {canEdit ? (
          <>
            <Button variant="ghost" size="sm" onPress={() => setAdding(true)}><UserPlus className="size-4" /> Aluno de fora da turma</Button>
            <Button variant="ghost" size="sm" onPress={markAll}>Marcar todos</Button>
          </>
        ) : null}
      </div>

      <ul className="grid gap-1.5 md:grid-cols-2">
        {visible.map((s) => {
          const st = statusOf.get(s.id)
          const checked = !!st && st !== 'absent'
          return (
            <li key={s.id} className={`flex items-stretch rounded-lg border ${checked ? 'border-line-strong bg-surface' : 'border-line'}`}>
              <button
                type="button"
                disabled={!canEdit}
                onClick={() => toggle(s.id)}
                aria-pressed={checked}
                className="flex min-h-14 min-w-0 flex-1 items-center gap-3 px-3 py-2 text-left disabled:cursor-default"
              >
                <span
                  className={`flex size-7 shrink-0 items-center justify-center rounded border-2 ${
                    checked ? (st === 'late' ? 'border-warning bg-warning text-ink' : st === 'justified' ? 'border-dim bg-dim text-bg' : 'border-success bg-success text-bg') : 'border-line-strong'
                  }`}
                >
                  {checked ? <Check className="size-4" strokeWidth={3} /> : null}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-text">{s.name}</span>
                  {(st && st !== 'present') || !s.active || !rosterIds.has(s.id) ? (
                    <span className="block truncate text-xs text-dim">
                      {[st && st !== 'present' ? STATUS_LABEL[st] : null, !s.active ? 'Inativo' : null].filter(Boolean).join(' · ')}
                    </span>
                  ) : null}
                </span>
              </button>
              {canEdit ? (
                <button type="button" onClick={() => setMenuFor(s.id)} aria-label={`Mais opções para ${s.name}`} className="flex w-11 items-center justify-center text-faint hover:text-text">
                  <MoreVertical className="size-4" />
                </button>
              ) : null}
            </li>
          )
        })}
      </ul>
      {visible.length === 0 ? <p className="py-4 text-center text-sm text-dim">Nenhum aluno com esse nome.</p> : null}

      <Dialog open={!!menuStudent} onClose={() => setMenuFor(null)} title={menuStudent?.name ?? ''}>
        <div className="grid grid-cols-2 gap-2">
          {STATUSES.map((st) => (
            <Button
              key={st}
              variant={menuStudent && statusOf.get(menuStudent.id) === st ? 'gold' : 'ghost'}
              onPress={() => {
                if (menuStudent) mark([menuStudent.id], st)
                setMenuFor(null)
              }}
            >
              {STATUS_LABEL[st]}
            </Button>
          ))}
        </div>
        <p className="mt-3 text-xs text-dim">Presença e atraso contam para a graduação. Falta, justificada ou não, não conta.</p>
      </Dialog>

      {adding ? (
        <AddStudentDialog
          candidates={(students.data ?? []).filter((s) => s.active && !rosterIds.has(s.id))}
          onPick={(id) => {
            mark([id], 'present')
            setAdding(false)
          }}
          onClose={() => setAdding(false)}
        />
      ) : null}
    </div>
  )
}

/** Quem veio nesta aula mas não é da turma (reposição, visita, aluno de outra turma). */
function AddStudentDialog({ candidates, onPick, onClose }: { candidates: { id: string; name: string }[]; onPick: (id: string) => void; onClose: () => void }) {
  const [query, setQuery] = useState('')
  const q = normalizeName(query)
  const list = candidates.filter((s) => !q || normalizeName(s.name).includes(q))
  return (
    <Dialog open onClose={onClose} title="Aluno de fora da turma">
      <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar aluno" aria-label="Buscar aluno" autoFocus />
      <ul className="mt-3 max-h-80 divide-y divide-line overflow-y-auto rounded border border-line">
        {list.length === 0 ? <li className="px-3 py-3 text-sm text-dim">Nenhum aluno encontrado.</li> : null}
        {list.slice(0, 60).map((s) => (
          <li key={s.id}>
            <button type="button" onClick={() => onPick(s.id)} className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-sm text-text hover:bg-tint">
              <span className="truncate">{s.name}</span>
              <Badge tone="neutral">Marcar presente</Badge>
            </button>
          </li>
        ))}
      </ul>
      {list.length > 60 ? <p className="mt-2 text-xs text-dim">Mostrando 60 de {list.length}: busque pelo nome.</p> : null}
    </Dialog>
  )
}
