'use client'

import { createGym, firstIssue, formatTime, gymInput, keys, WEEKDAYS_SHORT } from '@kog/core'
import { Button, Card, EmptyState, Field, Input, Sheet } from '@kog/ui'
import { ChevronRight, Plus } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Loading, Page } from '@/components/shell'
import { useGyms, useSave, useSchedules } from '@/lib/queries'
import { db } from '@/lib/supabase'

export default function GymsPage() {
  const router = useRouter()
  const gyms = useGyms()
  const schedules = useSchedules()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')

  const create = useSave(
    async () => {
      const parsed = gymInput.safeParse({ name, address })
      if (!parsed.success) throw new Error(firstIssue(parsed.error))
      return createGym(db(), parsed.data)
    },
    [keys.gyms],
    (gym) => {
      setOpen(false)
      setName('')
      setAddress('')
      router.push(`/academia?id=${gym.id}`)
    },
  )

  return (
    <Page title="Academias" back="/mais" actions={<Button size="sm" onPress={() => setOpen(true)}><Plus className="size-4" /> Nova</Button>}>
      {gyms.isPending ? (
        <Loading />
      ) : gyms.data?.length === 0 ? (
        <EmptyState title="Nenhuma academia" action={<Button onPress={() => setOpen(true)}>Cadastrar academia</Button>}>
          Cadastre as academias onde você dá aula.
        </EmptyState>
      ) : (
        <div className="space-y-2">
          {(gyms.data ?? []).map((g) => {
            const grade = (schedules.data ?? []).filter((s) => s.gym_id === g.id)
            return (
              <Link key={g.id} href={`/academia?id=${g.id}`} className="block">
                <Card className="flex items-center gap-3 p-4 active:bg-tint">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold text-text">{g.name}</p>
                    <p className="truncate text-sm text-dim">
                      {grade.length === 0 ? 'Sem grade semanal' : grade.map((s) => `${WEEKDAYS_SHORT[s.weekday]} ${formatTime(s.start_time)}`).join(' · ')}
                    </p>
                  </div>
                  <ChevronRight className="size-4 text-faint" />
                </Card>
              </Link>
            )
          })}
        </div>
      )}

      <Sheet open={open} onClose={() => setOpen(false)} title="Nova academia">
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault()
            create.mutate()
          }}
        >
          <Field label="Nome"><Input value={name} onChange={(e) => setName(e.target.value)} autoFocus required /></Field>
          <Field label="Endereço"><Input value={address} onChange={(e) => setAddress(e.target.value)} /></Field>
          <Button type="submit" block loading={create.isPending}>Salvar e definir grade</Button>
        </form>
      </Sheet>
    </Page>
  )
}
