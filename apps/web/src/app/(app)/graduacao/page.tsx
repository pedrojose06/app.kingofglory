'use client'

import { graduationStatus } from '@kog/core'
import { Badge, EmptyState, ProgressBar, RankBand } from '@kog/ui'
import Link from 'next/link'
import { useMemo, useState } from 'react'
import { GymChips } from '@/components/common'
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
      .map((s) => ({ student: s, status: graduationStatus(progressOf.get(s.id), ranks.data ?? [], s.created_at.slice(0, 10), today) }))
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
                  {status.eligible ? <Badge tone="success">Apto</Badge> : !status.next ? <Badge>Grau máximo</Badge> : !status.configured ? <Badge>Sem requisito</Badge> : null}
                </div>
                {status.next ? (
                  <>
                    {status.needed != null ? <ProgressBar value={status.count} max={status.needed} className="mt-2 h-1.5" /> : null}
                    <p className="mt-1.5 text-xs text-dim">
                      {status.needed != null ? `${status.count}/${status.needed} presenças` : `${status.count} presenças`}
                      {status.monthsNeeded != null ? ` · ${status.monthsElapsed}/${status.monthsNeeded} meses` : ''}
                      {status.configured && !status.eligible
                        ? ` · falta${status.missingClasses > 0 ? ` ${status.missingClasses} aulas` : ''}${status.missingClasses > 0 && status.missingMonths > 0 ? ' e' : ''}${status.missingMonths > 0 ? ` ${status.missingMonths} ${status.missingMonths === 1 ? 'mês' : 'meses'}` : ''}`
                        : ''}
                      {` → ${status.next.name}`}
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
