'use client'

import {
  addGraduation, attendanceStats, deleteGraduation, firstIssue, formatDateBR, formatMonth, graduationInput, graduationStatus,
  keys, missingLabel, ranksOfTrack, setImageConsent, trackOf, updateStudent, type Graduation,
} from '@kog/core'
import { Badge, Button, Card, Chip, DateInput, EmptyState, Field, Input, ProgressBar, RankBand, Select, Sheet } from '@kog/ui'
import { Pencil } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Section, StatusBadge, studentSince, useParam } from '@/components/common'
import { Loading, Page } from '@/components/shell'
import { StudentAccessSection } from '@/components/student-access'
import { StudentForm } from '@/components/student-form'
import { useGraduationSchedule, useGraduations, useGyms, useProgress, useRanks, useSave, useStudentAttendance, useStudents, useToday } from '@/lib/queries'
import { db } from '@/lib/supabase'
import { toast } from '@/lib/toast'

export default function StudentPage() {
  const id = useParam('id')
  const today = useToday()
  const students = useStudents()
  const gyms = useGyms()
  const ranks = useRanks()
  const progress = useProgress()
  const schedule = useGraduationSchedule()
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
    () => graduationStatus(progress.data?.find((p) => p.student_id === id), ranks.data ?? [], student ? studentSince(student) : today, today, { track: trackOf(student), birthDate: student?.birth_date, graduationOn: schedule.data?.[trackOf(student)] }),
    [progress.data, ranks.data, student, id, today, schedule.data],
  )
  const stats = useMemo(() => attendanceStats(attendance.data ?? [], gymName), [attendance.data, gymName])
  const rankOf = (rankId: string) => ranks.data?.find((r) => r.id === rankId)
  const trackRanks = useMemo(() => ranksOfTrack(ranks.data ?? [], trackOf(student)), [ranks.data, student])
  // Infantil: o Branco não pode ser pulado.
  const gradOptions = status.byAge && !status.current ? trackRanks.slice(0, 1) : trackRanks

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
    setGradRank((status.skipReady ? status.skipTo?.id : status.next?.id) ?? '')
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
            {status.on ? (
              <p className="mb-2 text-xs font-medium text-accent">Calculado para a graduação de {formatDateBR(status.on)} (meses até a data; treinos até hoje)</p>
            ) : null}
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-sm font-bold text-text">Próximo: {status.next.name}</p>
              {status.skipTo ? <Badge tone="gold">{status.skipReady ? 'Pode ir direto' : 'Pode pular'}</Badge> : null}
              {status.eligible ? <Badge tone="success">Apto</Badge> : status.configured ? <Badge tone="gold">Em progresso</Badge> : <Badge>Sem requisito</Badge>}
            </div>
            {status.byAge ? (
              <>
                <p className="text-sm text-soft">
                  {status.ageThisYear != null
                    ? <>Completa <strong className="text-text">{status.ageThisYear} anos</strong> este ano</>
                    : 'Sem data de nascimento cadastrada'}
                  {status.ageNeeded != null ? <span className="text-dim"> · {status.next.name} a partir de {status.ageNeeded}</span> : null}
                </p>
                <p className="mt-1 text-xs text-dim">Graduação infantil por idade: o Branco não pode ser pulado; depois dele vai direto ao grau da idade. Uma graduação por ano.</p>
              </>
            ) : status.needed != null ? (
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
            {!status.byAge && status.monthsNeeded != null ? (
              <p className="mt-1 text-sm text-soft">
                <strong className="text-text">{status.monthsElapsed}</strong> de {status.monthsNeeded} meses{status.on ? ` em ${formatDateBR(status.on)}` : ''}
              </p>
            ) : null}
            {!status.byAge && status.rate != null ? <p className="mt-1 text-xs text-dim">Frequência no período: {status.rate}% ({status.count} de {status.classes} aulas)</p> : null}
            {openingExcluded ? (
              <p className="mt-1 text-xs text-dim">
                {student.opening_after_grad != null
                  ? `Inclui ${student.opening_after_grad} treinos do saldo importado informados como posteriores à graduação.`
                  : 'O saldo importado não tem datas e a graduação foi dentro do período dele, então não entra nesta contagem (só no total). Informe em Editar aluno quantos treinos foram depois da graduação.'}
              </p>
            ) : null}
            {status.configured && !status.eligible ? <p className="mt-1 text-sm font-medium text-text first-letter:uppercase">{missingLabel(status)}</p> : null}
            {status.skipTo ? (() => {
              const skip = status.skipTo
              const skipNeeded = skip.required_classes == null ? null : Math.ceil((skip.required_classes * (skip.min_percent ?? 100)) / 100)
              return (
                <div className="mt-3 rounded-md border border-line p-3">
                  <p className="text-sm font-bold text-text">{status.skipReady ? `Pode graduar direto para ${skip.name}` : `Pular direto para ${skip.name}`}</p>
                  {skipNeeded != null ? (
                    <p className="mt-1 text-sm text-soft">
                      <strong className="text-text">{status.count}</strong> de {skipNeeded} treinos
                      {status.count >= skipNeeded ? ' ✓' : ` · faltam ${skipNeeded - status.count}`}
                    </p>
                  ) : null}
                  {skip.min_months != null ? (
                    <p className="mt-1 text-sm text-soft">
                      <strong className="text-text">{status.monthsElapsed}</strong> de {skip.min_months} meses{status.on ? ` em ${formatDateBR(status.on)}` : ''}
                      {status.monthsElapsed >= skip.min_months ? ' ✓' : ` · faltam ${skip.min_months - status.monthsElapsed}`}
                    </p>
                  ) : null}
                  <p className="mt-1 text-xs text-dim">Primeira graduação com {status.monthsElapsed} meses de treino{status.on ? ' na data marcada' : ''}: Branco ou direto {skip.name}, a critério do professor.</p>
                </div>
              )
            })() : null}
            {!status.configured ? <p className="mt-1 text-xs text-dim">Defina {status.byAge ? 'a idade' : 'os requisitos'} deste grau em Mais › Graus.</p> : null}
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
                  {a.credits > 1 ? <Badge tone="gold">Vale {a.credits}</Badge> : null}
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
          <EmptyState title="Nenhuma graduação registrada">{status.byAge
            ? `A primeira graduação infantil é sempre ${trackRanks[0]?.name ?? 'o primeiro grau'}.`
            : `A primeira graduação pode ser ${trackRanks[0]?.name ?? 'o primeiro grau'}${trackRanks[1] ? ` ou direto ${trackRanks[1].name}` : ''}.`}</EmptyState>
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

      <StudentAccessSection student={student} />

      <Section title="Cadastro">
        <Card className="divide-y divide-line text-sm">
          {student.phone ? <div className="flex justify-between px-3 py-2.5"><span className="text-dim">Telefone</span><a href={`tel:${student.phone}`} className="font-medium text-accent">{student.phone}</a></div> : null}
          {student.birth_date ? <div className="flex justify-between px-3 py-2.5"><span className="text-dim">Nascimento</span><span className="text-text">{formatDateBR(student.birth_date)}</span></div> : null}
          {student.notes ? <div className="px-3 py-2.5 text-soft">{student.notes}</div> : null}
          <label className="flex items-center justify-between gap-3 px-3 py-2.5">
            <span>
              <span className="block text-text">Autorizou uso de imagem e reconhecimento facial</span>
              <span className="block text-xs text-dim">{student.image_consent_at
                  ? `${student.account_consent_at ? 'Aceito pelo aluno no app' : 'Aceite registrado'} em ${formatDateBR(student.image_consent_at.slice(0, 10))}`
                  : 'Sem aceite registrado (LGPD)'}</span>
            </span>
            <input type="checkbox" className="size-5 accent-[var(--kog-gold)]" checked={!!student.image_consent_at} onChange={(e) => {
              const next = e.target.checked
              if (!next && !window.confirm(
                `Retirar a autorização? Os dados do rosto do aluno (reconhecimento facial) são apagados${student.profile_id ? ' e a conta dele no app fica bloqueada até ele aceitar de novo' : ''}.`,
              )) return
              setConsent.mutate(next)
            }} />
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
          {!status.current && !status.byAge && trackRanks.length > 1 ? (
            <div className="flex gap-2">
              {trackRanks.slice(0, 2).map((r) => (
                <Chip key={r.id} active={gradRank === r.id} onPress={() => setGradRank(r.id)}>{r.name}</Chip>
              ))}
            </div>
          ) : null}
          <Field label="Grau" hint={status.skipReady && status.skipTo ? `Cumpre os requisitos de ${status.skipTo.name}: pode graduar direto nele ou fazer ${status.next?.name}.` : status.skipTo ? `Apto para ${status.next?.name}; com ${status.monthsElapsed} meses, pode pular para ${status.skipTo.name}.` : status.next ? `Sugerido: ${status.next.name}.${status.byAge && !status.current ? '' : ' Dá para pular graus se for o caso.'}` : undefined}>
            <Select value={gradRank} onChange={(e) => setGradRank(e.target.value)}>
              <option value="">Escolha…</option>
              {gradOptions.map((r) => <option key={r.id} value={r.id}>{r.grade}. {r.name}</option>)}
            </Select>
          </Field>
          <Field label="Data da graduação" hint="A contagem de treinos para o próximo grau recomeça depois desta data.">
            <DateInput value={gradDate} max={today} onChange={(e) => setGradDate(e.target.value)} />
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
