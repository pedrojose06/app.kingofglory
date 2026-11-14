'use client'

import {
  addGraduation, attendanceStats, deleteGraduation, firstIssue, formatDateBR, formatMonth, graduationInput, graduationStatus,
  keys, missingLabel, setImageConsent, updateStudent, type Graduation,
} from '@kog/core'
import { Badge, Button, Card, EmptyState, Field, Input, ProgressBar, RankBand, Select, Sheet } from '@kog/ui'
import { Pencil } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Section, StatusBadge, studentSince, useParam } from '@/components/common'
import { Loading, Page } from '@/components/shell'
import { StudentForm } from '@/components/student-form'
import { useGraduations, useGyms, useProgress, useRanks, useSave, useStudentAttendance, useStudents, useToday } from '@/lib/queries'
import { db } from '@/lib/supabase'
import { toast } from '@/lib/toast'

export default function StudentPage() {
  const id = useParam('id')
  const today = useToday()
  const students = useStudents()
  const gyms = useGyms()
  const ranks = useRanks()
  const progress = useProgress()
  const attendance = useStudentAttendance(id)
  const graduations = useGraduations(id)
  const [editOpen, setEditOpen] = useState(false)
  const [gradOpen, setGradOpen] = useState(false)
  const [gradRank, setGradRank] = useState('')
  const [gradDate, setGradDate] = useState(today)
  const [gradNotes, setGradNotes] = useState('')
  const [showAll, setShowAll] = useState(false)

  const student = students.data?.find((s) => s.id === id)
  const gymName = gyms.data?.find((g) => g.id === student?.gym_id)?.name ?? 'Academia'
  const status = useMemo(
    () => graduationStatus(progress.data?.find((p) => p.student_id === id), ranks.data ?? [], student ? studentSince(student) : today, today),
    [progress.data, ranks.data, student, id, today],
  )
  const stats = useMemo(() => attendanceStats(attendance.data ?? [], gymName), [attendance.data, gymName])
  const rankOf = (rankId: string) => ranks.data?.find((r) => r.id === rankId)

  const invalidate = [keys.students, keys.progress, keys.graduations(id)] as const
  const graduate = useSave(
    async () => {
      const parsed = graduationInput.safeParse({ student_id: id, rank_id: gradRank, graduated_at: gradDate, notes: gradNotes })
      if (!parsed.success) throw new Error(firstIssue(parsed.error))
      await addGraduation(db(), parsed.data)
    },
    invalidate,
    () => {
      setGradOpen(false)
      toast('Graduação registrada')
    },
  )
  const removeGraduation = useSave((g: Graduation) => deleteGraduation(db(), g.id), invalidate)
  const setActive = useSave((active: boolean) => updateStudent(db(), id, { active }), invalidate)
  const setConsent = useSave((consented: boolean) => setImageConsent(db(), id, consented), invalidate)

  if (students.isPending) return <Loading />
  if (!student) {
    return (
      <Page title="Aluno" back>
        <EmptyState title="Aluno não encontrado" />
      </Page>
    )
  }

  const openGraduate = () => {
    setGradRank(status.next?.id ?? '')
    setGradDate(today)
    setGradNotes('')
    setGradOpen(true)
  }
  const rows = attendance.data ?? []
  // O cache offline pode ter alunos salvos antes de o saldo existir.
  const openingPresent = student.opening_present ?? 0
  const openingAbsent = student.opening_absent ?? 0
  const shown = showAll ? rows : rows.slice(0, 12)
  const lastGraduated = progress.data?.find((p) => p.student_id === id)?.last_graduated_at
  const openingFrom = student.opening_from ?? student.opening_until
  const openingExcluded = openingPresent > 0 && !!lastGraduated && !!openingFrom && lastGraduated >= openingFrom

  return (
    <Page
      title={student.name}
      kicker={`${gymName}${student.active ? '' : ' · inativo'}`}
      back
      actions={<Button variant="ghost" size="sm" onPress={() => setEditOpen(true)} aria-label="Editar aluno"><Pencil className="size-4" /></Button>}
    >
      <Card className="p-4">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="kicker">Grau atual</p>
            <p className="mt-1 truncate font-display text-xl uppercase text-text">
              {status.current ? `${status.current.grade}º · ${status.current.name}` : 'Sem graduação'}
            </p>
            <p className="text-xs text-dim">{status.current?.level ?? `Início em ${formatDateBR(studentSince(student))}`}</p>
          </div>
          {status.current ? <RankBand colors={status.current.colors} className="h-3.5 w-20" /> : null}
        </div>

        {status.next ? (
          <div className="mt-4 border-t border-line pt-4">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-sm font-bold text-text">Próximo: {status.next.name}</p>
              {status.eligible ? <Badge tone="success">Apto</Badge> : status.configured ? <Badge tone="gold">Em progresso</Badge> : <Badge>Sem requisito</Badge>}
            </div>
            {status.needed != null ? (
              <>
                <ProgressBar value={Math.min(status.count, status.needed)} max={status.needed || 1} />
                <p className="mt-1.5 text-sm text-soft">
                  <strong className="text-text">{status.count}</strong> de {status.needed} treinos
                  {status.minPercent != null ? <span className="text-dim"> ({status.minPercent}% de {status.requiredClasses})</span> : null}
                  <span className="text-dim"> {status.current ? 'desde a última graduação' : 'desde o início'}</span>
                </p>
              </>
            ) : (
              <p className="text-sm text-soft"><strong className="text-text">{status.count}</strong> treinos {status.current ? 'desde a última graduação' : 'desde o início'}</p>
            )}
            {status.monthsNeeded != null ? (
              <p className="mt-1 text-sm text-soft">
                <strong className="text-text">{status.monthsElapsed}</strong> de {status.monthsNeeded} meses
              </p>
            ) : null}
            {status.rate != null ? <p className="mt-1 text-xs text-dim">Frequência no período: {status.rate}% ({status.count} de {status.classes} aulas)</p> : null}
            {openingExcluded ? (
              <p className="mt-1 text-xs text-dim">O saldo importado não tem datas e a graduação foi dentro do período dele, então não entra nesta contagem (só no total).</p>
            ) : null}
            {status.configured && !status.eligible ? <p className="mt-1 text-sm font-medium text-text first-letter:uppercase">{missingLabel(status)}</p> : null}
            {!status.configured ? <p className="mt-1 text-xs text-dim">Defina os requisitos deste grau em Mais › Graus.</p> : null}
          </div>
        ) : null}

        <Button block className="mt-4" variant={status.eligible ? 'gold' : 'ghost'} onPress={openGraduate}>Registrar graduação</Button>
      </Card>

      <Section title="Presenças">
        {attendance.isPending ? (
          <Loading />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2">
              <Card className="p-3">
                <p className="font-display text-3xl text-accent">{stats.total + openingPresent}</p>
                <p className="text-xs text-dim">treinos no total</p>
              </Card>
              <Card className="p-3">
                <p className="font-display text-3xl text-text">{stats.absences + openingAbsent}</p>
                <p className="text-xs text-dim">faltas registradas</p>
              </Card>
            </div>
            {openingPresent + openingAbsent > 0 ? (
              <p className="mt-2 text-xs text-dim">
                Inclui o saldo importado{student.opening_until ? ` até ${formatDateBR(student.opening_until)}` : ''}: {openingPresent} presenças e {openingAbsent} faltas, sem registro por data.
              </p>
            ) : null}
            {stats.byLocation.length > 0 ? (
              <Card className="mt-2 divide-y divide-line">
                {stats.byLocation.map((l) => (
                  <div key={l.location} className="flex justify-between px-3 py-2 text-sm">
                    <span className="truncate text-soft">{l.location}</span>
                    <span className="font-bold text-text">{l.count}</span>
                  </div>
                ))}
              </Card>
            ) : null}
            {stats.byMonth.length > 0 ? (
              <Card className="mt-2 divide-y divide-line">
                {stats.byMonth.slice(0, showAll ? undefined : 6).map((m) => (
                  <div key={m.month} className="flex justify-between px-3 py-2 text-sm">
                    <span className="text-soft first-letter:uppercase">{formatMonth(m.month)}</span>
                    <span className="font-bold text-text">{m.count}</span>
                  </div>
                ))}
              </Card>
            ) : null}
          </>
        )}
      </Section>

      <Section title="Registros">
        {rows.length === 0 ? (
          <EmptyState title="Nenhuma presença registrada" />
        ) : (
          <>
            <Card className="divide-y divide-line">
              {shown.map((a) => (
                <div key={a.id} className="flex items-center gap-3 px-3 py-2">
                  <span className="w-20 shrink-0 text-sm font-medium text-text">{formatDateBR(a.date)}</span>
                  <span className="min-w-0 flex-1 truncate text-sm text-dim">{a.class_id ? gymName : a.location_label}</span>
                  <StatusBadge status={a.status} />
                </div>
              ))}
            </Card>
            {rows.length > 12 && !showAll ? (
              <Button variant="plain" block className="mt-1" onPress={() => setShowAll(true)}>Ver todos ({rows.length})</Button>
            ) : null}
          </>
        )}
      </Section>

      <Section title="Graduações">
        {(graduations.data ?? []).length === 0 ? (
          <EmptyState title="Nenhuma graduação registrada">A primeira graduação pode ser Branco ou direto Vermelho e Branco.</EmptyState>
        ) : (
          <Card className="divide-y divide-line">
            {(graduations.data ?? []).map((g) => {
              const rank = rankOf(g.rank_id)
              return (
                <div key={g.id} className="flex items-center gap-3 px-3 py-2.5">
                  {rank ? <RankBand colors={rank.colors} /> : null}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-text">{rank ? `${rank.grade}º · ${rank.name}` : 'Grau'}</span>
                    <span className="block truncate text-xs text-dim">{formatDateBR(g.graduated_at)}{g.notes ? ` · ${g.notes}` : ''}</span>
                  </span>
                  <button type="button" className="h-9 px-2 text-xs font-bold uppercase tracking-[0.1em] text-danger" onClick={() => window.confirm('Remover esta graduação?') && removeGraduation.mutate(g)}>
                    Remover
                  </button>
                </div>
              )
            })}
          </Card>
        )}
      </Section>

      <Section title="Cadastro">
        <Card className="divide-y divide-line text-sm">
          {student.phone ? <div className="flex justify-between px-3 py-2.5"><span className="text-dim">Telefone</span><a href={`tel:${student.phone}`} className="font-medium text-accent">{student.phone}</a></div> : null}
          {student.birth_date ? <div className="flex justify-between px-3 py-2.5"><span className="text-dim">Nascimento</span><span className="text-text">{formatDateBR(student.birth_date)}</span></div> : null}
          {student.notes ? <div className="px-3 py-2.5 text-soft">{student.notes}</div> : null}
          <label className="flex items-center justify-between gap-3 px-3 py-2.5">
            <span>
              <span className="block text-text">Autorizou uso de imagem</span>
              <span className="block text-xs text-dim">{student.image_consent_at ? `Aceite registrado em ${formatDateBR(student.image_consent_at.slice(0, 10))}` : 'Sem aceite registrado (LGPD)'}</span>
            </span>
            <input type="checkbox" className="size-5 accent-[var(--kog-gold)]" checked={!!student.image_consent_at} onChange={(e) => setConsent.mutate(e.target.checked)} />
          </label>
        </Card>
        <Button variant={student.active ? 'danger' : 'ghost'} block className="mt-3" loading={setActive.isPending} onPress={() => setActive.mutate(!student.active)}>
          {student.active ? 'Inativar aluno' : 'Reativar aluno'}
        </Button>
        <p className="mt-2 text-center text-xs text-dim">Inativar tira o aluno da chamada. O histórico de presenças é mantido.</p>
      </Section>

      <StudentForm open={editOpen} onClose={() => setEditOpen(false)} gyms={gyms.data ?? []} ranks={ranks.data ?? []} student={student} />

      <Sheet open={gradOpen} onClose={() => setGradOpen(false)} title="Registrar graduação">
        <div className="space-y-3">
          <Field label="Grau" hint={status.next ? `Sugerido: ${status.next.name}. Dá para pular graus se for o caso.` : undefined}>
            <Select value={gradRank} onChange={(e) => setGradRank(e.target.value)}>
              <option value="">Escolha…</option>
              {(ranks.data ?? []).map((r) => <option key={r.id} value={r.id}>{r.grade}. {r.name}</option>)}
            </Select>
          </Field>
          <Field label="Data da graduação" hint="A contagem de presenças para o próximo grau recomeça depois desta data.">
            <Input type="date" value={gradDate} max={today} onChange={(e) => setGradDate(e.target.value)} />
          </Field>
          <Field label="Observação">
            <Input value={gradNotes} onChange={(e) => setGradNotes(e.target.value)} />
          </Field>
          <Button block loading={graduate.isPending} onPress={() => graduate.mutate()}>Confirmar graduação</Button>
        </div>
      </Sheet>
    </Page>
  )
}
