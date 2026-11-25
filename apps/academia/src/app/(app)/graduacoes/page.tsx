'use client'

import { formatDateBR, TRACK_LABEL, type RankTrack } from '@kog/core'
import { Badge, Button, EmptyState } from '@kog/ui'
import { Award, ChevronRight, Plus } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'
import { GraduationEventDialog } from '@/components/graduation-event-dialog'
import { PageHeader } from '@/components/shell'
import { ErrorState, Loading } from '@/components/states'
import { useAcademy } from '@/lib/academy'
import { useGraduationEvents } from '@/lib/queries'

export default function GraduationEventsPage() {
  const { academy, isAdmin, isStaff } = useAcademy()
  const events = useGraduationEvents()
  const [creating, setCreating] = useState(false)

  if (!isStaff) return <EmptyState title="Sem acesso.">As graduações são da equipe da academia.</EmptyState>

  return (
    <>
      <PageHeader
        kicker={academy.name}
        title="Graduações"
        actions={isAdmin ? <Button onPress={() => setCreating(true)}><Plus className="size-4" /> Nova graduação</Button> : null}
      />
      <p className="mb-6 max-w-2xl text-sm text-dim">
        Cadastre a data de cada graduação e envie as fotos dela. O app reconhece os rostos de alunos de todas as academias da
        equipe (inclusive as parceiras) e propõe o próximo grau de cada um. O professor responsável recebe um aviso para
        aprovar; você também pode aprovar aqui. Quem você pular fica para o professor decidir.
      </p>

      {events.isPending ? (
        <Loading label="Carregando graduações…" />
      ) : events.isError ? (
        <ErrorState error={events.error} onRetry={() => events.refetch()} />
      ) : events.data.length === 0 ? (
        <EmptyState title="Nenhuma graduação cadastrada.">
          {isAdmin ? 'Use “Nova graduação” para cadastrar a data de uma graduação.' : 'O administrador da academia cadastra as graduações.'}
        </EmptyState>
      ) : (
        <ul className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {events.data.map((e) => (
            <li key={e.id}>
              <Link href={`/graduacao?id=${e.id}`} className="flex items-center gap-3 rounded-lg border border-line px-4 py-3 hover:bg-tint">
                <Award className="size-5 shrink-0 text-accent" />
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-text">{formatDateBR(e.held_on)}</p>
                  <p className="truncate text-sm text-dim">{e.title || 'Graduação'}</p>
                </div>
                <Badge>{TRACK_LABEL[e.track as RankTrack]}</Badge>
                <ChevronRight className="size-4 text-faint" />
              </Link>
            </li>
          ))}
        </ul>
      )}

      {creating ? <GraduationEventDialog event={null} onClose={() => setCreating(false)} /> : null}
    </>
  )
}
