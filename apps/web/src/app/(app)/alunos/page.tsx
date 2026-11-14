'use client'

import { normalizeName, ranksOfTrack, trackOf } from '@kog/core'
import { Button, Card, Chip, EmptyState, Input, RankBand } from '@kog/ui'
import { Award, ChevronRight, Plus, Search } from 'lucide-react'
import Link from 'next/link'
import { useMemo, useState } from 'react'
import { GymChips } from '@/components/common'
import { Loading, Page } from '@/components/shell'
import { StudentForm } from '@/components/student-form'
import { useGyms, useProgress, useRanks, useStudents } from '@/lib/queries'

export default function StudentsPage() {
  const gyms = useGyms()
  const students = useStudents()
  const ranks = useRanks()
  const progress = useProgress()
  const [gymId, setGymId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [showInactive, setShowInactive] = useState(false)
  const [formOpen, setFormOpen] = useState(false)

  const progressOf = useMemo(() => new Map((progress.data ?? []).map((p) => [p.student_id, p])), [progress.data])
  const rankOf = useMemo(() => new Map((ranks.data ?? []).map((r) => [r.id, r])), [ranks.data])
  const white = useMemo(
    () => ({ adulto: ranksOfTrack(ranks.data ?? [], 'adulto')[0], infantil: ranksOfTrack(ranks.data ?? [], 'infantil')[0] }),
    [ranks.data],
  )

  const visible = useMemo(() => {
    const q = normalizeName(search)
    return (students.data ?? []).filter((s) => s.active !== showInactive && (!gymId || s.gym_id === gymId) && (!q || normalizeName(s.name).includes(q)))
  }, [students.data, gymId, search, showInactive])

  const noGyms = gyms.data?.length === 0

  return (
    <Page
      title="Alunos"
      kicker={`${visible.length} ${showInactive ? 'inativos' : 'ativos'}`}
      actions={!noGyms ? <Button size="sm" onPress={() => setFormOpen(true)}><Plus className="size-4" /> Novo</Button> : null}
    >
      <Link href="/graduacao" className="mb-4 block">
        <Card className="flex items-center gap-3 p-3.5 active:bg-tint">
          <Award className="size-5 text-accent" />
          <span className="flex-1 text-sm font-bold text-text">Graduação: quem está apto</span>
          <ChevronRight className="size-4 text-faint" />
        </Card>
      </Link>

      <GymChips gyms={gyms.data ?? []} value={gymId} onChange={setGymId} />
      <div className="mb-3 flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faint" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar aluno" className="pl-9" type="search" />
        </div>
        <Chip active={showInactive} onPress={() => setShowInactive((v) => !v)} className="h-12">Inativos</Chip>
      </div>

      {students.isPending ? (
        <Loading />
      ) : noGyms ? (
        <EmptyState title="Cadastre uma academia primeiro" action={<Link href="/academias"><Button>Cadastrar academia</Button></Link>} />
      ) : visible.length === 0 ? (
        <EmptyState title={showInactive ? 'Nenhum aluno inativo' : 'Nenhum aluno'} action={!showInactive ? <Button onPress={() => setFormOpen(true)}>Cadastrar aluno</Button> : undefined} />
      ) : (
        <ul className="space-y-1.5">
          {visible.map((s) => {
            const p = progressOf.get(s.id)
            const rank = (p?.current_rank_id ? rankOf.get(p.current_rank_id) : undefined) ?? white[trackOf(s)]
            return (
              <li key={s.id}>
                <Link href={`/aluno?id=${s.id}`} className="flex min-h-14 items-center gap-3 rounded-lg border border-line px-3 py-2 active:bg-tint">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-text">{s.name}</span>
                    <span className="block truncate text-xs text-dim">
                      {rank ? `${rank.grade}º grau${trackOf(rank) === 'infantil' ? ' infantil' : ''} · ` : ''}
                      {p?.last_graduated_at ? `${p.attendance_since} treinos desde a graduação · ${p.attendance_total} no total` : `${p?.attendance_total ?? 0} treinos`}
                    </span>
                  </span>
                  {rank ? <RankBand colors={rank.colors} /> : null}
                  <ChevronRight className="size-4 shrink-0 text-faint" />
                </Link>
              </li>
            )
          })}
        </ul>
      )}

      <StudentForm open={formOpen} onClose={() => setFormOpen(false)} gyms={gyms.data ?? []} ranks={ranks.data ?? []} defaultGymId={gymId} />
    </Page>
  )
}
