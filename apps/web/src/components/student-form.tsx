'use client'

import {
  addGraduation, birthDateIssue, createStudent, firstIssue, guardianTermStatus, isMinor, keys, RANK_TRACKS, ranksOfTrack, studentInput, TRACK_LABEL,
  trackOf, updateStudent, uploadGuardianConsent, type Gym, type Rank, type RankTrack, type Student,
} from '@kog/core'
import { Button, Chip, DateInput, Field, Input, Select, Sheet, Textarea } from '@kog/ui'
import { useEffect, useState } from 'react'
import { StudentAvatar } from '@/components/common'
import { GuardianTermStep } from '@/components/guardian-term'
import { useGuardianConsents, useSave, useStudentPhotos, useToday } from '@/lib/queries'
import { db } from '@/lib/supabase'
import { errorMessage, toast } from '@/lib/toast'

export interface StudentFormProps {
  open: boolean
  onClose: () => void
  gyms: readonly Gym[]
  ranks: readonly Rank[]
  /** Edição quando informado; senão, cadastro. */
  student?: Student
  defaultGymId?: string | null
  /** Nome inicial no cadastro (ex.: o que foi digitado na busca da chamada). */
  defaultName?: string
  /** Chamado após cadastrar (não na edição), também no "Salvar e novo". */
  onCreated?: (student: Student) => void
  /** Texto do aviso após cadastrar. */
  createdMessage?: string
}

export function StudentForm({ open, onClose, gyms, ranks, student, defaultGymId, defaultName, onCreated, createdMessage }: StudentFormProps) {
  const photos = useStudentPhotos()
  const consents = useGuardianConsents()
  const today = useToday()
  const photoUrl = student ? photos.data?.[student.id] : undefined
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
  const [termFile, setTermFile] = useState<File | null>(null)

  useEffect(() => {
    if (!open) return
    setName(student?.name ?? defaultName ?? '')
    setGymId(student?.gym_id ?? defaultGymId ?? gyms[0]?.id ?? '')
    setPhone(student?.phone ?? '')
    setBirth(student?.birth_date ?? '')
    setStartedOn(student?.started_on ?? student?.created_at.slice(0, 10) ?? '')
    setAfterGrad(student?.opening_after_grad?.toString() ?? '')
    setNotes(student?.notes ?? '')
    setTrack(trackOf(student))
    setRankId('')
    setGraduatedAt('')
    setTermFile(null)
  }, [open, student, defaultGymId, defaultName, gyms])

  const save = useSave(
    async (keepOpen: boolean) => {
      const parsed = studentInput.safeParse({ gym_id: gymId, name, phone, birth_date: birth, notes, track, started_on: startedOn || undefined, ...(student && (student.opening_present ?? 0) > 0 ? { opening_after_grad: afterGrad === '' ? null : Number(afterGrad) } : {}) })
      if (!parsed.success) throw new Error(firstIssue(parsed.error))
      if (rankId && !graduatedAt) throw new Error('Informe a data da última graduação')
      let studentId: string
      if (student) {
        await updateStudent(db(), student.id, parsed.data)
        studentId = student.id
      } else {
        const created = await createStudent(db(), parsed.data)
        if (rankId) await addGraduation(db(), { student_id: created.id, rank_id: rankId, graduated_at: graduatedAt })
        onCreated?.(created)
        studentId = created.id
      }
      // O aluno já está salvo: falha no envio do termo não desfaz o cadastro (fica "Termo pendente").
      let termError: string | null = null
      if (showTerm && termFile) {
        try {
          await uploadGuardianConsent(db(), { studentId, fileId: crypto.randomUUID(), file: termFile })
        } catch (error) {
          termError = errorMessage(error)
        }
      }
      return { keepOpen, termPending: showTerm && (!termFile || !!termError), termError }
    },
    [keys.students, keys.progress],
    ({ keepOpen, termPending, termError }) => {
      if (termError) toast(`Aluno salvo, mas o termo não foi enviado (${termError}). Envie pela ficha do aluno.`, 'error')
      else toast(`${student ? 'Aluno atualizado' : (createdMessage ?? 'Aluno cadastrado')}${termPending ? ' · Termo pendente' : ''}`)
      if (keepOpen) {
        setName('')
        setPhone('')
        setBirth('')
        setNotes('')
        setTermFile(null)
      } else onClose()
    },
  )

  // Etapa extra: só depois de uma data completa e válida de menor de 18 (o seletor nativo entrega a data inteira).
  const minor = !birthDateIssue(birth, today) && isMinor(birth, today)
  const termSent = !!student && guardianTermStatus(student, consents.data?.find((c) => c.student_id === student.id), today) === 'enviado'
  const showTerm = minor && !termSent
  const birthHint = birth
    ? undefined
    : track === 'infantil'
      ? 'Opcional. Sem data, o termo do responsável fica para quando ela for informada.'
      : 'Opcional: o aluno pode informar no cadastro do portal.'

  return (
    <Sheet open={open} onClose={onClose} title={student ? 'Editar aluno' : 'Novo aluno'}>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault()
          save.mutate(false)
        }}
      >
        {photoUrl && student ? (
          <div className="flex items-center gap-3">
            <StudentAvatar url={photoUrl} name={student.name} className="size-16 text-lg" />
            <p className="text-xs text-dim">Foto e nome que o aluno informou no cadastro dele.</p>
          </div>
        ) : null}
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
          <Field label="Nascimento" hint={birthHint}>
            <DateInput value={birth} max={today} onChange={(e) => setBirth(e.target.value)} />
          </Field>
        </div>
        {showTerm ? <GuardianTermStep name={name} birthDate={birth} file={termFile} onFileChange={setTermFile} /> : null}
        <Field label="Início" hint="Base do intervalo mínimo enquanto o aluno não tem graduação. Vazio = hoje.">
          <DateInput value={startedOn} onChange={(e) => setStartedOn(e.target.value)} />
        </Field>
        {student && (student.opening_present ?? 0) > 0 ? (
          <Field label="Treinos do saldo após a última graduação" hint={`O saldo importado (${student.opening_present} presenças) não tem datas. Informe quantas foram depois da última graduação, se ela caiu no período do saldo.`}>
            <Input inputMode="numeric" value={afterGrad} onChange={(e) => setAfterGrad(e.target.value.replace(/\D/g, ''))} placeholder="—" />
          </Field>
        ) : null}
        <Field label="Adulto ou infantil" hint="Define a sequência de graus sugerida para o aluno.">
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
