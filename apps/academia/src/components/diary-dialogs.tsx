'use client'

import { type AcademyScheduleInput, classTitle, createAcademyClass, saveAcademySchedule, setAcademyScheduleActive, todayISO, WEEKDAYS } from '@kog/core'
import type { ClassSchedule } from '@kog/core'
import { Button, DateInput, Field, Input, Select, TimeInput } from '@kog/ui'
import { toast, toastError } from '@kog/web-kit'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Dialog } from '@/components/kit'
import { FormMessage } from '@/components/states'
import { useAcademy } from '@/lib/academy'
import { keys, useClassGroups, useInstructors } from '@/lib/queries'
import { db } from '@/lib/supabase'

/** Turma (opcional) e professor: os campos que a aula e o horário da grade têm em comum. */
function GroupAndInstructor({ groupId, onGroup, instructorId, onInstructor }: {
  groupId: string
  onGroup: (id: string) => void
  instructorId: string
  onInstructor: (id: string) => void
}) {
  const groups = useClassGroups()
  const instructors = useInstructors()
  return (
    <>
      <Field label="Turma" hint="A chamada lista os alunos da turma. Sem turma, lista todos os alunos ativos.">
        <Select value={groupId} onChange={(e) => onGroup(e.target.value)}>
          <option value="">Sem turma</option>
          {(groups.data ?? []).filter((g) => g.active || g.id === groupId).map((g) => (
            <option key={g.id} value={g.id}>{g.name}</option>
          ))}
        </Select>
      </Field>
      {instructors.data && instructors.data.length > 0 ? (
        <Field label="Professor">
          <Select value={instructorId} onChange={(e) => onInstructor(e.target.value)}>
            <option value="">Eu</option>
            {instructors.data.map((m) => (
              <option key={m.profile_id} value={m.profile_id}>{m.name || 'Sem nome'}</option>
            ))}
          </Select>
        </Field>
      ) : null}
    </>
  )
}

/** Aula avulsa (fora da grade): aulão, reposição, aula extra ou uma aula passada que ficou sem registro. */
export function NewClassDialog({ defaultDate, defaultGroupId = '', onClose }: { defaultDate: string; defaultGroupId?: string; onClose: () => void }) {
  const { academy } = useAcademy()
  const router = useRouter()
  const queryClient = useQueryClient()
  const groups = useClassGroups()
  const [groupId, setGroupId] = useState(defaultGroupId)
  const [instructorId, setInstructorId] = useState('')
  const [date, setDate] = useState(defaultDate)
  const [time, setTime] = useState('19:00')
  const [title, setTitle] = useState('')
  const [error, setError] = useState<string | null>(null)
  const groupName = groups.data?.find((g) => g.id === groupId)?.name

  const create = useMutation({
    mutationFn: () =>
      createAcademyClass(db(), {
        gym_id: academy.gym_id,
        group_id: groupId || null,
        date,
        start_time: time || null,
        title: classTitle({ title, groupName }),
        ...(instructorId ? { instructor_id: instructorId } : {}),
      }),
    onSuccess: async (klass) => {
      await queryClient.invalidateQueries({ queryKey: keys.all(academy.gym_id) })
      toast('Aula criada.')
      router.push(`/diario?id=${klass.id}`)
    },
    onError: toastError,
  })

  return (
    <Dialog
      open
      onClose={onClose}
      title="Nova aula"
      footer={
        <>
          <Button variant="plain" onPress={onClose}>Cancelar</Button>
          <Button
            loading={create.isPending}
            onPress={() => {
              setError(date ? null : 'Informe a data da aula.')
              if (date) create.mutate()
            }}
          >
            Criar aula
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-3 sm:col-span-2">
          <GroupAndInstructor groupId={groupId} onGroup={setGroupId} instructorId={instructorId} onInstructor={setInstructorId} />
        </div>
        <Field label="Data">
          <DateInput value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Horário">
          <TimeInput value={time} onChange={(e) => setTime(e.target.value)} />
        </Field>
        <Field label="Título (opcional)" className="sm:col-span-2" hint="Ex.: Aulão de sábado, Reposição. Sem título vale o nome da turma.">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={groupName ?? 'Aula'} />
        </Field>
        <div className="sm:col-span-2">
          <FormMessage message={error ? { text: error, error: true } : null} />
        </div>
      </div>
    </Dialog>
  )
}

/** Horário da grade semanal. Só o administrador. As aulas dele nascem sozinhas a cada semana. */
export function ScheduleDialog({ schedule, onClose }: { schedule: ClassSchedule | null; onClose: () => void }) {
  const { academy } = useAcademy()
  const queryClient = useQueryClient()
  const groups = useClassGroups()
  const [groupId, setGroupId] = useState(schedule?.group_id ?? '')
  const [instructorId, setInstructorId] = useState(schedule?.instructor_id ?? '')
  const [weekday, setWeekday] = useState(schedule?.weekday ?? 1)
  const [time, setTime] = useState(schedule?.start_time.slice(0, 5) ?? '19:00')
  const [title, setTitle] = useState(schedule?.title ?? '')
  const [startsOn, setStartsOn] = useState(schedule?.starts_on ?? todayISO())
  const [endsOn, setEndsOn] = useState(schedule?.ends_on ?? '')
  const [error, setError] = useState<string | null>(null)
  const groupName = groups.data?.find((g) => g.id === groupId)?.name

  const save = useMutation({
    mutationFn: () => {
      const input: AcademyScheduleInput = {
        group_id: groupId || null,
        weekday,
        start_time: time,
        title: classTitle({ title, groupName }),
        starts_on: startsOn,
        ends_on: endsOn || null,
        ...(instructorId ? { instructor_id: instructorId } : {}),
      }
      return saveAcademySchedule(db(), academy.gym_id, schedule?.id ?? null, input)
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: keys.all(academy.gym_id) })
      toast('Horário salvo.')
      onClose()
    },
    onError: toastError,
  })

  function submit() {
    const issue = !time
      ? 'Informe o horário.'
      : !startsOn
        ? 'Informe a data de início.'
        : endsOn && endsOn < startsOn
          ? 'O fim não pode ser antes do início.'
          : null
    setError(issue)
    if (!issue) save.mutate()
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={schedule ? 'Editar horário' : 'Novo horário'}
      footer={
        <>
          <Button variant="plain" onPress={onClose}>Cancelar</Button>
          <Button loading={save.isPending} onPress={submit}>Salvar</Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-3 sm:col-span-2">
          <GroupAndInstructor groupId={groupId} onGroup={setGroupId} instructorId={instructorId} onInstructor={setInstructorId} />
        </div>
        <Field label="Dia da semana">
          <Select value={weekday} onChange={(e) => setWeekday(Number(e.target.value))}>
            {WEEKDAYS.map((name, i) => (
              <option key={name} value={i}>{name}</option>
            ))}
          </Select>
        </Field>
        <Field label="Horário">
          <TimeInput value={time} onChange={(e) => setTime(e.target.value)} />
        </Field>
        <Field label="Título (opcional)" className="sm:col-span-2" hint="Sem título vale o nome da turma.">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={groupName ?? 'Aula'} />
        </Field>
        <Field label="Começa em" hint="As aulas são geradas a partir desta data.">
          <DateInput value={startsOn} onChange={(e) => setStartsOn(e.target.value)} />
        </Field>
        <Field label="Termina em (opcional)">
          <DateInput value={endsOn} onChange={(e) => setEndsOn(e.target.value)} />
        </Field>
        <div className="sm:col-span-2">
          <FormMessage message={error ? { text: error, error: true } : null} />
        </div>
      </div>
    </Dialog>
  )
}

/** Encerrar (ou reativar) um horário: não gera mais aulas; as já geradas e as presenças continuam. */
export function useToggleSchedule() {
  const { academy } = useAcademy()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => setAcademyScheduleActive(db(), id, active),
    onSuccess: async (_d, { active }) => {
      await queryClient.invalidateQueries({ queryKey: keys.all(academy.gym_id) })
      toast(active ? 'Horário reativado.' : 'Horário encerrado. As aulas já geradas continuam.')
    },
    onError: toastError,
  })
}
