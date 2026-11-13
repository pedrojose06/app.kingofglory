'use client'

import { createClass, formatDayLong, keys } from '@kog/core'
import { Button, Card, EmptyState, Sheet } from '@kog/ui'
import { ChevronRight, MapPinPlus, Plus } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { ClassCard, Section } from '@/components/common'
import { Loading, Page } from '@/components/shell'
import { useClassCounts, useClassesByDate, useGyms, usePendingClasses, useSave, useToday } from '@/lib/queries'
import { db } from '@/lib/supabase'

export default function TodayPage() {
  const today = useToday()
  const router = useRouter()
  const gyms = useGyms()
  const classes = useClassesByDate(today)
  const pending = usePendingClasses()
  const counts = useClassCounts(classes.data)
  const [extraOpen, setExtraOpen] = useState(false)

  const createExtra = useSave(
    (gymId: string) => createClass(db(), { gym_id: gymId, date: today, title: 'Aula extra' }),
    [['classes']],
    (klass) => router.push(`/aula?id=${klass.id}`),
  )

  const gymName = (id: string) => gyms.data?.find((g) => g.id === id)?.name ?? 'Academia'
  const pendingCount = pending.data?.length ?? 0

  return (
    <Page title="Hoje" kicker={formatDayLong(today)}>
      {gyms.isPending || classes.isPending ? (
        <Loading />
      ) : gyms.data?.length === 0 ? (
        <EmptyState title="Comece cadastrando suas academias" action={<Link href="/academias"><Button>Cadastrar academia</Button></Link>}>
          Depois defina a grade semanal: as aulas aparecem aqui sozinhas.
        </EmptyState>
      ) : (
        <>
          {pendingCount > 0 ? (
            <Link href="/pendencias" className="mb-4 block">
              <Card className="flex items-center gap-3 border-line-strong bg-tint p-4">
                <span className="font-display text-3xl text-accent">{pendingCount}</span>
                <span className="flex-1 text-sm font-medium text-soft">
                  {pendingCount === 1 ? 'aula passada sem chamada' : 'aulas passadas sem chamada'}
                </span>
                <span className="text-xs font-bold uppercase tracking-[0.1em] text-accent">Resolver</span>
                <ChevronRight className="size-4 text-accent" />
              </Card>
            </Link>
          ) : null}

          <div className="space-y-2">
            {(classes.data ?? []).map((c) => (
              <ClassCard key={c.id} klass={c} gymName={gymName(c.gym_id)} present={counts.data?.[c.id]} href={`/aula?id=${c.id}`} />
            ))}
            {classes.data?.length === 0 ? (
              <EmptyState title="Sem aulas na grade hoje">Deu aula mesmo assim? Crie uma aula extra.</EmptyState>
            ) : null}
          </div>

          <Section title="Atalhos">
            <div className="grid grid-cols-2 gap-2">
              <Link href="/avulsa">
                <Button variant="ghost" block className="h-14"><MapPinPlus className="size-4" /> Presença avulsa</Button>
              </Link>
              <Button variant="ghost" block className="h-14" onPress={() => (gyms.data?.length === 1 ? createExtra.mutate(gyms.data[0]!.id) : setExtraOpen(true))} loading={createExtra.isPending}>
                <Plus className="size-4" /> Aula extra
              </Button>
            </div>
          </Section>
        </>
      )}

      <Sheet open={extraOpen} onClose={() => setExtraOpen(false)} title="Aula extra em…">
        <div className="space-y-2">
          {(gyms.data ?? []).map((g) => (
            <Button key={g.id} variant="ghost" block onPress={() => { setExtraOpen(false); createExtra.mutate(g.id) }}>{g.name}</Button>
          ))}
        </div>
      </Sheet>
    </Page>
  )
}
