'use client'

import { graduationStatus, missingLabel } from '@kog/core'
import { Badge, EmptyState, ProgressBar, RankBand } from '@kog/ui'
import Link from 'next/link'
import { useMemo, useState } from 'react'
import { GymChips, studentSince } from '@/components/common'
import { Loading, Page } from '@/components/shell'
import { useGyms, useProgress, useRanks, useStudents, useToday } from '@/lib/queries'

export default function GraduationPage() {
  const today = useToday()
  const gyms = useGyms()
  const students = useStudents()
  const ranks = useRanks()
  const progress = useProgress()
  const [gymId, setGymId] = useState<string | null>(null)

  const rows = useMemo(() => {
    const progressOf = new Map((progress.data ?? []).map((p) => [p.student_id, p]))
    return (students.data ?? [])
      .filter((s) => s.active && (!gymId || s.gym_id === gymId))
      .map((s) => ({ student: s, status: graduationStatus(progressOf.get(s.id), ranks.data ?? [], studentSince(s), today) }))
      .sort(
        (a, b) =>
          Number(b.status.eligible) - Number(a.status.eligible) ||
          Number(b.status.configured) - Number(a.status.configured) ||
          a.status.missingClasses + a.status.missingMonths * 8 - (b.status.missingClasses + b.status.missingMonths * 8) ||
          a.student.name.localeCompare(b.student.name, 'pt-BR'),
      )
  }, [students.data, progress.data, ranks.data, gymId, today])

  const eligible = rows.filter((r) => r.status.eligible).length

  return (
    <Page title="Graduação" kicker={`${eligible} ${eligible === 1 ? 'aluno apto' : 'alunos aptos'}`} back>
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
                  {status.skipTo ? <Badge tone="gold">Pode pular</Badge> : null}
                  {status.eligible ? <Badge tone="success">Apto</Badge> : !status.next ? <Badge>Grau máximo</Badge> : !status.configured ? <Badge>Sem requisito</Badge> : null}
                </div>
                {status.next ? (
                  <>
                    {status.needed != null ? <ProgressBar value={Math.min(status.count, status.needed)} max={status.needed || 1} className="mt-2 h-1.5" /> : null}
                    <p className="mt-1.5 text-xs text-dim">
                      {status.needed != null ? `${status.count}/${status.needed} treinos` : `${status.count} treinos`}
                      {status.monthsNeeded != null ? ` · ${status.monthsElapsed}/${status.monthsNeeded} meses` : ''}
                      {status.configured && !status.eligible ? ` · ${missingLabel(status)}` : ''}
                      {` → ${status.next.name}${status.skipTo ? ` ou ${status.skipTo.name}` : ''}`}
                    </p>
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
