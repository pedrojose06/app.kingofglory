'use client'

import {
  addGraduation, createStudent, firstIssue, keys, studentInput, updateStudent, type Gym, type Rank, type Student,
} from '@kog/core'
import { Button, Field, Input, Select, Sheet, Textarea } from '@kog/ui'
import { useEffect, useState } from 'react'
import { useSave } from '@/lib/queries'
import { db } from '@/lib/supabase'
import { toast } from '@/lib/toast'

export interface StudentFormProps {
  open: boolean
  onClose: () => void
  gyms: readonly Gym[]
  ranks: readonly Rank[]
  /** Edição quando informado; senão, cadastro. */
  student?: Student
  defaultGymId?: string | null
}

export function StudentForm({ open, onClose, gyms, ranks, student, defaultGymId }: StudentFormProps) {
  const [name, setName] = useState('')
  const [gymId, setGymId] = useState('')
  const [phone, setPhone] = useState('')
  const [birth, setBirth] = useState('')
  const [startedOn, setStartedOn] = useState('')
  const [notes, setNotes] = useState('')
  const [rankId, setRankId] = useState('')
  const [graduatedAt, setGraduatedAt] = useState('')

  useEffect(() => {
    if (!open) return
    setName(student?.name ?? '')
    setGymId(student?.gym_id ?? defaultGymId ?? gyms[0]?.id ?? '')
    setPhone(student?.phone ?? '')
    setBirth(student?.birth_date ?? '')
    setStartedOn(student?.started_on ?? student?.created_at.slice(0, 10) ?? '')
    setNotes(student?.notes ?? '')
    setRankId('')
    setGraduatedAt('')
  }, [open, student, defaultGymId, gyms])

  const save = useSave(
    async (keepOpen: boolean) => {
      const parsed = studentInput.safeParse({ gym_id: gymId, name, phone, birth_date: birth || null, notes, started_on: startedOn || undefined })
      if (!parsed.success) throw new Error(firstIssue(parsed.error))
      if (rankId && !graduatedAt) throw new Error('Informe a data da última graduação')
      if (student) {
        await updateStudent(db(), student.id, parsed.data)
      } else {
        const created = await createStudent(db(), parsed.data)
        if (rankId) await addGraduation(db(), { student_id: created.id, rank_id: rankId, graduated_at: graduatedAt })
      }
      return keepOpen
    },
    [keys.students, keys.progress],
    (keepOpen) => {
      toast(student ? 'Aluno atualizado' : 'Aluno cadastrado')
      if (keepOpen) {
        setName('')
        setPhone('')
        setBirth('')
        setNotes('')
      } else onClose()
    },
  )

  return (
    <Sheet open={open} onClose={onClose} title={student ? 'Editar aluno' : 'Novo aluno'}>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault()
          save.mutate(false)
        }}
      >
        <Field label="Nome">
          <Input value={name} onChange={(e) => setName(e.target.value)} autoCapitalize="words" autoFocus={!student} required />
        </Field>
        {gyms.length > 1 ? (
          <Field label="Academia">
            <Select value={gymId} onChange={(e) => setGymId(e.target.value)}>
              {gyms.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </Select>
          </Field>
        ) : null}
        <div className="grid grid-cols-2 gap-2">
          <Field label="Telefone">
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" inputMode="tel" />
          </Field>
          <Field label="Nascimento">
            <Input value={birth} onChange={(e) => setBirth(e.target.value)} type="date" />
          </Field>
        </div>
        <Field label="Início" hint="Base do intervalo mínimo enquanto o aluno não tem graduação. Vazio = hoje.">
          <Input value={startedOn} onChange={(e) => setStartedOn(e.target.value)} type="date" />
        </Field>
        {!student ? (
          <div className="grid grid-cols-2 gap-2">
            <Field label="Grau atual" hint="Vazio = sem graduação">
              <Select value={rankId} onChange={(e) => setRankId(e.target.value)}>
                <option value="">—</option>
                {ranks.map((r) => <option key={r.id} value={r.id}>{r.grade}. {r.name}</option>)}
              </Select>
            </Field>
            <Field label="Graduou em">
              <Input value={graduatedAt} onChange={(e) => setGraduatedAt(e.target.value)} type="date" disabled={!rankId} />
            </Field>
          </div>
        ) : null}
        <Field label="Observações">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <div className="flex gap-2 pt-1">
          {!student ? <Button variant="ghost" className="flex-1" onPress={() => save.mutate(true)} disabled={save.isPending}>Salvar e novo</Button> : null}
          <Button type="submit" className="flex-1" loading={save.isPending}>Salvar</Button>
        </div>
      </form>
    </Sheet>
  )
}
