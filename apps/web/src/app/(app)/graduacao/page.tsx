'use client'

import {
  formatDateBR, graduationStatus, keys, missingLabel, RANK_TRACKS, setGraduationDate, trackOf, TRACK_LABEL, type GraduationSchedule, type RankTrack,
} from '@kog/core'
import { Badge, Card, DateInput, EmptyState, ProgressBar, RankBand } from '@kog/ui'
import Link from 'next/link'
import { useMemo, useState } from 'react'
import { GymChips, studentSince } from '@/components/common'
import { Loading, Page } from '@/components/shell'
import { useGraduationSchedule, useGyms, useProgress, useRanks, useSave, useStudents, useToday } from '@/lib/queries'
import { db } from '@/lib/supabase'
import { toast } from '@/lib/toast'

export default function GraduationPage() {
  const today = useToday()
  const gyms = useGyms()
  const students = useStudents()
  const ranks = useRanks()
  const progress = useProgress()
  const schedule = useGraduationSchedule()
  const [gymId, setGymId] = useState<string | null>(null)

  const rows = useMemo(() => {
    const progressOf = new Map((progress.data ?? []).map((p) => [p.student_id, p]))
    return (students.data ?? [])
      .filter((s) => s.active && (!gymId || s.gym_id === gymId))
      .map((s) => ({
        student: s,
        status: graduationStatus(progressOf.get(s.id), ranks.data ?? [], studentSince(s), today, {
          track: trackOf(s),
          birthDate: s.birth_date,
          graduationOn: schedule.data?.[trackOf(s)],
        }),
      }))
      .sort(
        (a, b) =>
          Number(b.status.eligible) - Number(a.status.eligible) ||
          Number(b.status.skipReady) - Number(a.status.skipReady) ||
          Number(b.status.configured) - Number(a.status.configured) ||
          a.status.missingClasses + a.status.missingMonths * 8 - (b.status.missingClasses + b.status.missingMonths * 8) ||
          a.student.name.localeCompare(b.student.name, 'pt-BR'),
      )
  }, [students.data, progress.data, ranks.data, schedule.data, gymId, today])

  const eligible = rows.filter((r) => r.status.eligible).length

  return (
    <Page title="Graduação" kicker={`${eligible} ${eligible === 1 ? 'aluno apto' : 'alunos aptos'}`} back>
      <NextGraduation schedule={schedule.data} today={today} />
      <GymChips gyms={gyms.data ?? []} value={gymId} onChange={setGymId} />
      {students.isPending || progress.isPending || ranks.isPending ? (
        <Loading />
      ) : rows.length === 0 ? (
        <EmptyState title="Nenhum aluno ativo" />
      ) : (
        <ul className="space-y-1.5">
          {rows.map(({ student, status }) => (
            <li key={student.id}>
              <Link href={`/aluno?id=${student.id}`} className="block rounded-lg border border-line px-3 py-2.5 active:bg-tint">
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate font-medium text-text">{student.name}</span>
                  {status.current ? <RankBand colors={status.current.colors} className="w-10" /> : null}
                  {status.skipTo ? <Badge tone="gold">{status.skipReady ? 'Direto' : 'Pode pular'}</Badge> : null}
                  {status.eligible ? <Badge tone="success">Apto</Badge> : !status.next ? <Badge>Grau máximo</Badge> : !status.configured ? <Badge>Sem requisito</Badge> : null}
                </div>
                {status.next ? (
                  <>
                    {status.byAge ? (
                      <p className="mt-1.5 text-xs text-dim">
                        Infantil{status.ageThisYear != null ? ` · completa ${status.ageThisYear} anos este ano` : ''}
                        {status.configured && !status.eligible ? ` · ${missingLabel(status)}` : ''}
                        {` → ${status.next.name}`}
                      </p>
                    ) : <>
                    {status.needed != null ? <ProgressBar value={Math.min(status.count, status.needed)} max={status.needed || 1} className="mt-2 h-1.5" /> : null}
                    <p className="mt-1.5 text-xs text-dim">
                      {status.needed != null ? `${status.count}/${status.needed} treinos` : `${status.count} treinos`}
                      {status.monthsNeeded != null ? ` · ${status.monthsElapsed}/${status.monthsNeeded} meses` : ''}
                      {status.configured && !status.eligible ? ` · ${missingLabel(status)}` : ''}
                      {status.skipReady && status.skipTo
                        ? ` → direto ${status.skipTo.name} (ou ${status.next.name})`
                        : ` → ${status.next.name}${status.skipTo ? ` ou ${status.skipTo.name}` : ''}`}
                    </p>
                    </>}
                  </>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Page>
  )
}


/**
 * Datas da próxima graduação da equipe (todas as academias juntas), uma para adulto e outra para infantil.
 * Com data futura, os meses (e a idade, no infantil) são calculados até ela; os treinos são os de hoje.
 */
function NextGraduation({ schedule, today }: { schedule: GraduationSchedule | undefined; today: string }) {
  const save = useSave(
    ({ track, date }: { track: RankTrack; date: string | null }) => setGraduationDate(db(), track, date),
    [keys.graduationSchedule],
    () => toast('Data da graduação salva'),
  )
  if (!schedule) return null
  return (
    <Card className="mb-4 p-3">
      <p className="kicker">Próxima graduação</p>
      <div className="mt-2 space-y-2">
        {RANK_TRACKS.map((track) => {
          const date = schedule[track] ?? ''
          const past = !!date && date <= today
          return (
            <div key={track} className="grid grid-cols-[minmax(0,1fr)_9.5rem] items-center gap-2">
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-text">{TRACK_LABEL[track]}</span>
                {date ? (
                  <button type="button" className="text-xs text-dim underline underline-offset-2" onClick={() => save.mutate({ track, date: null })}>
                    {past ? `Já passou (${formatDateBR(date)}) · limpar` : 'Limpar data'}
                  </button>
                ) : (
                  <span className="block text-xs text-dim">Sem data: calcula para hoje</span>
                )}
              </span>
              <DateInput
                value={date}
                min={today}
                aria-label={`Data da próxima graduação ${TRACK_LABEL[track].toLowerCase()}`}
                onChange={(e) => save.mutate({ track, date: e.target.value || null })}
              />
            </div>
          )
        })}
      </div>
      <p className="mt-2 text-xs text-dim">Vale para todas as academias. Com a data marcada, os meses de cada aluno contam até o dia da graduação; os treinos são os registrados até hoje.</p>
    </Card>
  )
}
