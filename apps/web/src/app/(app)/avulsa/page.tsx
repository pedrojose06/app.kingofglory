'use client'

import { PERIOD_LABEL, WALK_IN_PERIODS, firstIssue, formatDateBR, normalizeName, walkInInput, walkInLabel, type WalkInPeriod } from '@kog/core'
import { Button, Chip, DateInput, EmptyState, Field, Input, cn } from '@kog/ui'
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
  const [period, setPeriod] = useState<WalkInPeriod | ''>('')
  // Aluno escolhido → quanto vale a presença dele.
  const [selected, setSelected] = useState<Map<string, number>>(new Map())
  const [credits, setCredits] = useState(1)

  const visible = useMemo(() => {
    const q = normalizeName(search)
    return (students.data ?? []).filter((s) => s.active && (!gymId || s.gym_id === gymId) && (!q || normalizeName(s.name).includes(q)))
  }, [students.data, gymId, search])

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Map(prev)
      if (!next.delete(id)) next.set(id, credits)
      return next
    })

  // Valor de todos: muda o padrão e os já escolhidos.
  function setAllCredits(n: number) {
    setCredits(n)
    setSelected((prev) => new Map([...prev.keys()].map((id) => [id, n])))
  }

  // Valor só deste aluno: 1× → 2× → 3× → 1×.
  const cycleCredits = (id: string) =>
    setSelected((prev) => new Map(prev).set(id, ((prev.get(id) ?? 1) % 3) + 1))

  function submit() {
    // Um registro por valor (o servidor grava o mesmo valor para a lista de alunos).
    const groups = new Map<number, string[]>()
    for (const [id, n] of selected) groups.set(n, [...(groups.get(n) ?? []), id])
    const ops = []
    for (const [n, ids] of groups) {
      const parsed = walkInInput.safeParse({ student_ids: ids, date, location, credits: n, period })
      if (!parsed.success) return toast(firstIssue(parsed.error), 'error')
      ops.push(parsed.data)
    }
    for (const op of ops) outbox.add({ type: 'walkin.add', ...op })
    const where = walkInLabel({ location_label: location.trim(), walk_in_period: period })
    toast(`${selected.size} ${selected.size === 1 ? 'presença registrada' : 'presenças registradas'} em ${where}, ${formatDateBR(date)}`)
    setSelected(new Map())
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
      <div className="mt-4" role="group" aria-labelledby="walkin-period">
        <p id="walkin-period" className="mb-1.5 text-xs font-bold uppercase tracking-[0.12em] text-dim">Período</p>
        <div className="grid grid-cols-4 gap-2">
          <Chip active={period === ''} onPress={() => setPeriod('')} className="w-full px-1">—</Chip>
          {WALK_IN_PERIODS.map((p) => (
            <Chip key={p} active={period === p} onPress={() => setPeriod(p)} className="w-full px-1">{PERIOD_LABEL[p]}</Chip>
          ))}
        </div>
        <p className="mt-1 text-xs text-dim">Treinou duas vezes no mesmo dia e local? Registre cada treino com um período (ex.: manhã e noite).</p>
      </div>

      <div className="mt-4" role="group" aria-labelledby="walkin-credits">
        <p id="walkin-credits" className="mb-1.5 text-xs font-bold uppercase tracking-[0.12em] text-dim">Vale quantas presenças</p>
        {/* Grade de 3 colunas: os botões dividem a largura e nunca passam da tela. */}
        <div className="grid grid-cols-3 gap-2">
          {[1, 2, 3].map((n) => (
            <Chip key={n} active={credits === n} onPress={() => setAllCredits(n)} className="w-full">
              <span aria-label={n === 1 ? '1 presença' : `${n} presenças`}>{n}×</span>
            </Chip>
          ))}
        </div>
        <p className="mt-1 text-xs text-dim">
          Vale para todos os escolhidos. Para mudar só um aluno, toque no valor ao lado do nome dele. Registrar de novo o mesmo
          aluno, dia, local e período corrige o valor.
        </p>
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
                <CheckRow
                  checked={selected.has(s.id)}
                  onPress={() => toggle(s.id)}
                  title={s.name}
                  subtitle={(gyms.data?.length ?? 0) > 1 ? gymName(s.gym_id) : undefined}
                  trailing={selected.has(s.id) ? (
                    <button
                      type="button"
                      onClick={() => cycleCredits(s.id)}
                      aria-label={`${s.name}: vale ${selected.get(s.id)}. Tocar para mudar`}
                      className={cn(
                        'my-2 mr-2 flex w-14 shrink-0 flex-col items-center justify-center rounded-md border text-sm font-bold',
                        (selected.get(s.id) ?? 1) > 1 ? 'border-accent bg-tint text-accent' : 'border-line-strong text-soft',
                      )}
                    >
                      {selected.get(s.id)}×
                      <span className="text-[10px] font-medium uppercase tracking-wide text-dim">vale</span>
                    </button>
                  ) : undefined}
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-30 border-t border-line bg-bg/95 px-4 py-2.5 backdrop-blur">
        <div className="mx-auto max-w-xl">
          <Button block onPress={submit} disabled={selected.size === 0}>
            {selected.size === 0 ? 'Escolha os alunos' : `Registrar ${selected.size} ${selected.size === 1 ? 'aluno' : 'alunos'}${period ? ` · ${PERIOD_LABEL[period].toLowerCase()}` : ''}`}
          </Button>
        </div>
      </div>
      <div className="h-20" />
    </Page>
  )
}
