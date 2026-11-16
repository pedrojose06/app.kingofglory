'use client'

import { firstIssue, formatDateBR, normalizeName, walkInInput } from '@kog/core'
import { Button, Chip, DateInput, EmptyState, Field, Input } from '@kog/ui'
import { Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { CheckRow, GymChips } from '@/components/common'
import { Loading, Page } from '@/components/shell'
import { outbox } from '@/lib/outbox'
import { useGyms, useStudents, useToday, useWalkInLocations } from '@/lib/queries'
import { toast } from '@/lib/toast'

export default function WalkInPage() {
  const today = useToday()
  const gyms = useGyms()
  const students = useStudents()
  const locations = useWalkInLocations()
  const [date, setDate] = useState(today)
  const [location, setLocation] = useState('')
  const [gymId, setGymId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [credits, setCredits] = useState(1)

  const visible = useMemo(() => {
    const q = normalizeName(search)
    return (students.data ?? []).filter((s) => s.active && (!gymId || s.gym_id === gymId) && (!q || normalizeName(s.name).includes(q)))
  }, [students.data, gymId, search])

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (!next.delete(id)) next.add(id)
      return next
    })

  function submit() {
    const parsed = walkInInput.safeParse({ student_ids: [...selected], date, location, credits })
    if (!parsed.success) return toast(firstIssue(parsed.error), 'error')
    outbox.add({ type: 'walkin.add', ...parsed.data })
    const worth = credits > 1 ? ` (vale ${credits})` : ''
    toast(`${selected.size} ${selected.size === 1 ? 'presença registrada' : 'presenças registradas'}${worth} em ${parsed.data.location}, ${formatDateBR(date)}`)
    setSelected(new Set())
    setSearch('')
  }

  const suggestions = (locations.data ?? []).filter((l) => l !== location.trim()).slice(0, 6)
  const gymName = (id: string) => gyms.data?.find((g) => g.id === id)?.name

  return (
    <Page title="Presença avulsa" kicker="Treino em outra academia" back>
      <div className="grid grid-cols-[1fr_9.5rem] gap-2">
        <Field label="Local">
          <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Ex.: Matriz" autoCapitalize="words" list="walkin-locations" />
          <datalist id="walkin-locations">
            {(locations.data ?? []).map((l) => <option key={l} value={l} />)}
          </datalist>
        </Field>
        <Field label="Data">
          <DateInput value={date} max={today} onChange={(e) => setDate(e.target.value || today)} />
        </Field>
      </div>
      {suggestions.length > 0 ? (
        <div className="-mx-4 mt-2 flex gap-2 overflow-x-auto px-4 pb-1">
          {suggestions.map((l) => <Chip key={l} onPress={() => setLocation(l)}>{l}</Chip>)}
        </div>
      ) : null}

      {/* div e não Field: um <label> repassaria o toque ao primeiro chip. */}
      <div className="mt-4" role="group" aria-labelledby="walkin-credits">
        <p id="walkin-credits" className="mb-1.5 text-xs font-bold uppercase tracking-[0.12em] text-dim">Vale</p>
        <div className="flex gap-2">
          {[1, 2, 3].map((n) => (
            <Chip key={n} active={credits === n} onPress={() => setCredits(n)}>{n === 1 ? '1 presença' : `${n} presenças`}</Chip>
          ))}
        </div>
        <p className="mt-1 text-xs text-dim">Ex.: aulão vale 2 presenças para a graduação. Registrar de novo o mesmo aluno, dia e local corrige o valor.</p>
      </div>

      <div className="mt-5">
        <GymChips gyms={gyms.data ?? []} value={gymId} onChange={setGymId} />
        <div className="relative mb-3">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faint" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar aluno" className="pl-9" type="search" />
        </div>
        {students.isPending ? (
          <Loading />
        ) : visible.length === 0 ? (
          <EmptyState title="Nenhum aluno encontrado" />
        ) : (
          <ul className="space-y-1.5">
            {visible.map((s) => (
              <li key={s.id}>
                <CheckRow checked={selected.has(s.id)} onPress={() => toggle(s.id)} title={s.name} subtitle={(gyms.data?.length ?? 0) > 1 ? gymName(s.gym_id) : undefined} />
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-30 border-t border-line bg-bg/95 px-4 py-2.5 backdrop-blur">
        <div className="mx-auto max-w-xl">
          <Button block onPress={submit} disabled={selected.size === 0}>
            {selected.size === 0 ? 'Escolha os alunos' : `Registrar ${selected.size} ${selected.size === 1 ? 'aluno' : 'alunos'}${credits > 1 ? ` · vale ${credits}` : ''}`}
          </Button>
        </div>
      </div>
      <div className="h-20" />
    </Page>
  )
}
