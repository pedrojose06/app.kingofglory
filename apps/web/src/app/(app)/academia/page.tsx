'use client'

import {
  createSchedule, endSchedule, firstIssue, formatDateBR, formatTime, gymInput, keys, scheduleEditInput, scheduleInput, setScheduleStart, updateGym,
  updateSchedule, WEEKDAYS,
  WEEKDAYS_SHORT, type ClassSchedule,
} from '@kog/core'
import { Button, Card, Chip, DateInput, EmptyState, Field, Input, Sheet, TimeInput } from '@kog/ui'
import { Plus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Section, useParam } from '@/components/common'
import { Loading, Page } from '@/components/shell'
import { useGyms, useSave, useSchedules, useToday } from '@/lib/queries'
import { db } from '@/lib/supabase'
import { toast } from '@/lib/toast'

export default function GymPage() {
  const id = useParam('id')
  const today = useToday()
  const gyms = useGyms()
  const schedules = useSchedules()
  const gym = gyms.data?.find((g) => g.id === id)
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [open, setOpen] = useState(false)
  const [days, setDays] = useState<number[]>([2, 4])
  const [time, setTime] = useState('19:00')
  const [different, setDifferent] = useState(false)
  const [times, setTimes] = useState<Record<number, string>>({})
  const [title, setTitle] = useState('Muay Thai')
  const [startsOn, setStartsOn] = useState(today)
  const [editing, setEditing] = useState<ClassSchedule | null>(null)
  const [editTime, setEditTime] = useState('')
  const [editTitle, setEditTitle] = useState('')
  const [editStartsOn, setEditStartsOn] = useState('')

  useEffect(() => {
    setName(gym?.name ?? '')
    setAddress(gym?.address ?? '')
  }, [gym?.name, gym?.address])

  const saveGym = useSave(
    async () => {
      const parsed = gymInput.safeParse({ name, address })
      if (!parsed.success) throw new Error(firstIssue(parsed.error))
      await updateGym(db(), id, parsed.data)
    },
    [keys.gyms],
    () => toast('Academia atualizada'),
  )

  const addSchedules = useSave(
    async () => {
      if (days.length === 0) throw new Error('Escolha ao menos um dia')
      // Valida tudo antes de gravar, para um horário inválido não deixar a grade pela metade.
      const inputs = days.map((weekday) => {
        const start_time = different ? (times[weekday] ?? time) : time
        const parsed = scheduleInput.safeParse({ gym_id: id, weekday, start_time, title, starts_on: startsOn })
        if (!parsed.success) throw new Error(`${WEEKDAYS[weekday]}: ${firstIssue(parsed.error)}`)
        return parsed.data
      })
      for (const input of inputs) await createSchedule(db(), input)
    },
    [keys.schedules, ['classes']],
    () => setOpen(false),
  )
  const remove = useSave((s: ClassSchedule) => endSchedule(db(), s.id, today), [keys.schedules])
  const saveEdit = useSave(
    async () => {
      if (!editing) return
      const parsed = scheduleEditInput.safeParse({ start_time: editTime, title: editTitle })
      if (!parsed.success) throw new Error(firstIssue(parsed.error))
      const startChanged = !!editStartsOn && editStartsOn !== editing.starts_on
      if (startChanged && editStartsOn > editing.starts_on && !window.confirm(
        `Começar em ${formatDateBR(editStartsOn)}? As aulas antes dessa data que não têm chamada, presença, foto nem plano saem da lista.`,
      )) return null
      // A data primeiro: se ela for recusada, nada mais muda.
      const removed = startChanged ? await setScheduleStart(db(), editing.id, editStartsOn) : 0
      await updateSchedule(db(), editing.id, parsed.data, today)
      return { removed }
    },
    [keys.schedules, ['classes']],
    (result) => {
      if (!result) return
      setEditing(null)
      toast(result.removed > 0 ? `Horário atualizado · ${result.removed} ${result.removed === 1 ? 'aula removida' : 'aulas removidas'}` : 'Horário atualizado')
    },
  )
  const openEdit = (s: ClassSchedule) => {
    setEditing(s)
    setEditTime(formatTime(s.start_time))
    setEditTitle(s.title)
    setEditStartsOn(s.starts_on)
  }

  if (gyms.isPending) return <Loading />
  if (!gym) {
    return (
      <Page title="Academia" back="/academias">
        <EmptyState title="Academia não encontrada" />
      </Page>
    )
  }

  const grade = (schedules.data ?? []).filter((s) => s.gym_id === id)
  const dirty = name !== gym.name || address !== (gym.address ?? '')

  return (
    <Page title={gym.name} kicker="Academia" back="/academias">
      <div className="space-y-3">
        <Field label="Nome"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Endereço"><Input value={address} onChange={(e) => setAddress(e.target.value)} /></Field>
        {dirty ? <Button block loading={saveGym.isPending} onPress={() => saveGym.mutate()}>Salvar alterações</Button> : null}
      </div>

      <Section title="Grade semanal" action={<Button size="sm" variant="ghost" onPress={() => { setStartsOn(today); setOpen(true) }}><Plus className="size-4" /> Horário</Button>}>
        {grade.length === 0 ? (
          <EmptyState title="Sem horários">Adicione os dias e horários das aulas. Elas passam a aparecer em “Hoje” automaticamente.</EmptyState>
        ) : (
          <Card className="divide-y divide-line">
            {grade.map((s) => (
              <div key={s.id} className="flex items-center gap-3 px-3 py-2.5">
                <span className="w-24 shrink-0 font-display text-base uppercase text-accent">{WEEKDAYS_SHORT[s.weekday]} {formatTime(s.start_time)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-text">{s.title}</span>
                  <span className="block text-xs text-dim">desde {formatDateBR(s.starts_on)}</span>
                </span>
                <button type="button" className="h-9 px-2 text-xs font-bold uppercase tracking-[0.1em] text-accent" onClick={() => openEdit(s)}>
                  Editar
                </button>
              </div>
            ))}
          </Card>
        )}
      </Section>

      <Sheet open={!!editing} onClose={() => setEditing(null)} title={editing ? `${WEEKDAYS[editing.weekday]} · ${formatTime(editing.start_time)}` : ''}>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <Field label="Horário"><TimeInput value={editTime} onChange={(e) => setEditTime(e.target.value)} /></Field>
            <Field label="Nome da aula"><Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} /></Field>
          </div>
          <Field label="A partir de" hint="Corrija se a data de início foi cadastrada errada. Mais cedo: as aulas desde a nova data entram em Pendências. Mais tarde: as aulas vazias antes dela saem da lista.">
            <DateInput value={editStartsOn} max={editing?.ends_on ?? undefined} onChange={(e) => setEditStartsOn(e.target.value)} />
          </Field>
          <p className="text-xs text-dim">Horário e nome valem para as próximas aulas. As aulas já dadas e as presenças continuam como estão.</p>
          <Button block loading={saveEdit.isPending} onPress={() => saveEdit.mutate()}>Salvar</Button>
          <Button
            block
            variant="danger"
            loading={remove.isPending}
            onPress={() => {
              if (editing && window.confirm('Encerrar este horário? Ele deixa de gerar aulas; as já dadas continuam no histórico.')) {
                remove.mutate(editing)
                setEditing(null)
              }
            }}
          >
            Encerrar horário
          </Button>
          <p className="text-center text-xs text-dim">Para só mudar o horário, não encerre: edite acima.</p>
        </div>
      </Sheet>

      <Sheet open={open} onClose={() => setOpen(false)} title="Novo horário">
        <div className="space-y-3">
          <div>
            <span className="mb-1.5 block text-xs font-bold uppercase tracking-[0.12em] text-dim">Dias</span>
            <div className="flex flex-wrap gap-2">
              {WEEKDAYS.map((label, weekday) => (
                <Chip key={label} active={days.includes(weekday)} onPress={() => setDays((d) => (d.includes(weekday) ? d.filter((x) => x !== weekday) : [...d, weekday].sort()))}>
                  {WEEKDAYS_SHORT[weekday]}
                </Chip>
              ))}
            </div>
          </div>
          <label className="flex min-h-11 items-center gap-2.5 text-sm text-text">
            <input type="checkbox" className="size-5 accent-accent" checked={different} onChange={(e) => setDifferent(e.target.checked)} />
            Horários diferentes por dia
          </label>
          {different ? (
            days.length === 0 ? (
              <p className="text-xs text-dim">Escolha os dias para informar o horário de cada um.</p>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {days.map((weekday) => (
                  <Field key={weekday} label={WEEKDAYS[weekday] ?? ""}>
                    <TimeInput value={times[weekday] ?? time} onChange={(e) => setTimes((t) => ({ ...t, [weekday]: e.target.value }))} />
                  </Field>
                ))}
              </div>
            )
          ) : null}
          <div className="grid grid-cols-2 gap-2">
            {different ? null : <Field label="Horário"><TimeInput value={time} onChange={(e) => setTime(e.target.value)} /></Field>}
            <Field label="A partir de" className={different ? 'col-span-2' : undefined}><DateInput value={startsOn} onChange={(e) => setStartsOn(e.target.value || today)} /></Field>
          </div>
          <Field label="Nome da aula"><Input value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
          <p className="text-xs text-dim">Se a data de início for no passado, as aulas desde então entram em Pendências para você lançar a chamada.</p>
          <Button block loading={addSchedules.isPending} onPress={() => addSchedules.mutate()}>Adicionar</Button>
        </div>
      </Sheet>
    </Page>
  )
}
