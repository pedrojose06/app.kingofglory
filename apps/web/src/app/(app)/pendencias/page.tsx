'use client'

import { Button, EmptyState } from '@kog/ui'
import Link from 'next/link'
import { ClassCard } from '@/components/common'
import { Loading, Page } from '@/components/shell'
import { useGyms, usePendingClasses } from '@/lib/queries'

export default function PendingPage() {
  const gyms = useGyms()
  const pending = usePendingClasses()
  const list = pending.data ?? []
  const gymName = (id: string) => gyms.data?.find((g) => g.id === id)?.name ?? 'Academia'

  return (
    <Page title="Pendências" kicker="Aulas passadas sem chamada">
      {pending.isPending ? (
        <Loading />
      ) : list.length === 0 ? (
        <EmptyState title="Tudo em dia">Nenhuma chamada acumulada.</EmptyState>
      ) : (
        <>
          <Link href={`/aula?id=${list[0]!.id}&fila=1`} className="mb-4 block">
            <Button size="lg" block>Resolver em sequência ({list.length})</Button>
          </Link>
          <div className="space-y-2">
            {list.map((c) => (
              <ClassCard key={c.id} klass={c} gymName={gymName(c.gym_id)} href={`/aula?id=${c.id}&fila=1`} showDate />
            ))}
          </div>
        </>
      )}
    </Page>
  )
}
