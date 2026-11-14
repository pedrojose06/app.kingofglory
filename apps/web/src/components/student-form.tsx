'use client'

import {
  addGraduation, createStudent, firstIssue, keys, RANK_TRACKS, ranksOfTrack, studentInput, TRACK_LABEL, trackOf, updateStudent,
  type Gym, type Rank, type RankTrack, type Student,
} from '@kog/core'
import { Button, Chip, DateInput, Field, Input, Select, Sheet, Textarea } from '@kog/ui'
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
  const [afterGrad, setAfterGrad] = useState('')
  const [notes, setNotes] = useState('')
  const [track, setTrack] = useState<RankTrack>('adulto')
  const [rankId, setRankId] = useState('')
  const [graduatedAt, setGraduatedAt] = useState('')

  useEffect(() => {
    if (!open) return
    setName(student?.name ?? '')
    setGymId(student?.gym_id ?? defaultGymId ?? gyms[0]?.id ?? '')
    setPhone(student?.phone ?? '')
    setBirth(student?.birth_date ?? '')
    setStartedOn(student?.started_on ?? student?.created_at.slice(0, 10) ?? '')
    setAfterGrad(student?.opening_after_grad?.toString() ?? '')
    setNotes(student?.notes ?? '')
    setTrack(trackOf(student))
    setRankId('')
    setGraduatedAt('')
  }, [open, student, defaultGymId, gyms])

  const save = useSave(
    async (keepOpen: boolean) => {
      const parsed = studentInput.safeParse({ gym_id: gymId, name, phone, birth_date: birth || null, notes, track, started_on: startedOn || undefined, ...(student && (student.opening_present ?? 0) > 0 ? { opening_after_grad: afterGrad === '' ? null : Number(afterGrad) } : {}) })
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
            <DateInput value={birth} onChange={(e) => setBirth(e.target.value)} />
          </Field>
        </div>
        <Field label="Início" hint="Base do intervalo mínimo enquanto o aluno não tem graduação. Vazio = hoje.">
          <DateInput value={startedOn} onChange={(e) => setStartedOn(e.target.value)} />
        </Field>
        {student && (student.opening_present ?? 0) > 0 ? (
          <Field label="Treinos do saldo após a última graduação" hint={`O saldo importado (${student.opening_present} presenças) não tem datas. Informe quantas foram depois da última graduação, se ela caiu no período do saldo.`}>
            <Input inputMode="numeric" value={afterGrad} onChange={(e) => setAfterGrad(e.target.value.replace(/\D/g, ''))} placeholder="—" />
          </Field>
        ) : null}
        <Field label="Graduação" hint="Define a sequência de graus sugerida para o aluno.">
          <div className="flex gap-2">
            {RANK_TRACKS.map((t) => (
              <Chip key={t} active={track === t} onPress={() => { setTrack(t); setRankId('') }}>{TRACK_LABEL[t]}</Chip>
            ))}
          </div>
        </Field>
        {!student ? (
          <div className="grid grid-cols-2 gap-2">
            <Field label="Grau atual" hint="Vazio = sem graduação">
              <Select value={rankId} onChange={(e) => setRankId(e.target.value)}>
                <option value="">—</option>
                {ranksOfTrack(ranks, track).map((r) => <option key={r.id} value={r.id}>{r.grade}. {r.name}</option>)}
              </Select>
            </Field>
            <Field label="Graduou em">
              <DateInput value={graduatedAt} onChange={(e) => setGraduatedAt(e.target.value)} disabled={!rankId} />
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
