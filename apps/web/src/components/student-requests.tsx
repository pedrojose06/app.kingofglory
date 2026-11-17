'use client'

import { approveStudentRequest, formatDateBR, keys, rejectStudentRequest, signFaceUrls, type StudentRequest } from '@kog/core'
import { Button, Card, Input, Sheet, cn } from '@kog/ui'
import { useQuery } from '@tanstack/react-query'
import { Check, Mail, Phone, Search, UserPlus, UserRound } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Section } from '@/components/common'
import { Loading } from '@/components/shell'
import { useGyms, useSave, useStudentRequests, useStudents } from '@/lib/queries'
import { db } from '@/lib/supabase'
import { toast } from '@/lib/toast'

const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()

/**
 * Pedidos de acesso de alunos que criaram conta sem link (escolheram o professor e a academia).
 * Fica em Pendências; some quando não há pedido.
 */
export function StudentRequestsSection() {
  const requests = useStudentRequests()
  const gyms = useGyms()
  const [approving, setApproving] = useState<StudentRequest | null>(null)
  const reject = useSave((id: string) => rejectStudentRequest(db(), id), [keys.studentRequests], () => toast('Pedido recusado'))
  const gymName = (id: string) => gyms.data?.find((g) => g.id === id)?.name ?? 'Academia'
  const list = requests.data ?? []
  const paths = list.map((r) => r.photo_path)
  const faces = useQuery({
    queryKey: [...keys.studentRequests, 'faces', paths.join(',')],
    queryFn: () => signFaceUrls(db(), paths),
    enabled: paths.length > 0,
    staleTime: 30 * 60_000,
    gcTime: 50 * 60_000, // URLs assinadas valem 1h
  })
  if (list.length === 0) return null

  return (
    <Section title={list.length === 1 ? '1 pedido de acesso de aluno' : `${list.length} pedidos de acesso de alunos`}>
      <div className="space-y-2">
        {list.map((r) => (
          <Card key={r.id} className="p-3">
            <div className="flex items-start gap-3">
              <Face url={faces.data?.[r.photo_path]} name={r.name} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold text-text">{r.name}</p>
                <p className="text-xs font-bold uppercase tracking-[0.08em] text-accent">{gymName(r.gym_id)}</p>
              </div>
              <span className="shrink-0 text-xs text-dim">{formatDateBR(r.created_at.slice(0, 10))}</span>
            </div>
            <p className="mt-1.5 flex items-center gap-1.5 truncate text-sm text-soft"><Mail className="size-3.5 shrink-0" /> {r.email}</p>
            {r.phone ? <p className="mt-0.5 flex items-center gap-1.5 text-sm text-soft"><Phone className="size-3.5 shrink-0" /> {r.phone}</p> : null}
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button variant="ghost" className="text-danger" loading={reject.isPending && reject.variables === r.id}
                onPress={() => window.confirm(`Recusar o pedido de ${r.name}?`) && reject.mutate(r.id)}>
                Recusar
              </Button>
              <Button onPress={() => setApproving(r)}><Check className="size-4" /> Aprovar</Button>
            </div>
          </Card>
        ))}
      </div>
      <p className="mt-2 text-xs text-dim">
        O aluno escolheu você e a academia ao criar a conta. Diga qual aluno da sua lista é esse login, cadastre como novo ou recuse.
        Aprovado, ele aceita o uso de imagem (LGPD) e passa a ver as presenças.
      </p>
      {approving ? <ApproveSheet request={approving} faceUrl={faces.data?.[approving.photo_path]} gymName={gymName(approving.gym_id)} onClose={() => setApproving(null)} /> : null}
    </Section>
  )
}

/** Escolhe qual aluno (da academia do pedido, ainda sem conta) é esse login, ou cria um aluno novo. */
function ApproveSheet({ request, faceUrl, gymName, onClose }: { request: StudentRequest; faceUrl?: string; gymName: string; onClose: () => void }) {
  const students = useStudents()
  const [search, setSearch] = useState('')
  const [choice, setChoice] = useState<string | 'new' | null>(null)
  const approve = useSave(
    () => approveStudentRequest(db(), request.id, choice && choice !== 'new' ? choice : undefined),
    [keys.studentRequests, keys.students],
    () => {
      toast('Acesso aprovado')
      onClose()
    },
  )

  const candidates = useMemo(() => {
    const words = norm(request.name).split(/\s+/).filter((w) => w.length > 2)
    const q = norm(search)
    const score = (name: string) => words.filter((w) => norm(name).includes(w)).length
    return (students.data ?? [])
      .filter((s) => s.gym_id === request.gym_id && !s.profile_id && (!q || norm(s.name).includes(q)))
      .sort((a, b) => score(b.name) - score(a.name) || Number(b.active) - Number(a.active) || a.name.localeCompare(b.name, 'pt-BR'))
  }, [students.data, request, search])

  return (
    <Sheet open onClose={onClose} title={`Quem é ${request.name.split(/\s+/)[0]}?`}>
      {faceUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={faceUrl} alt={`Foto de ${request.name}`} className="mx-auto mb-3 size-32 rounded-full object-cover ring-1 ring-line-strong" />
      ) : null}
      <p className="mb-3 text-sm text-dim">Alunos de {gymName} que ainda não têm conta. Os nomes parecidos aparecem primeiro.</p>
      <button
        type="button"
        onClick={() => setChoice('new')}
        className={cn('mb-2 flex w-full items-center gap-3 rounded-lg border px-3 py-3 text-left', choice === 'new' ? 'border-accent bg-tint' : 'border-line')}
      >
        <UserPlus className="size-5 shrink-0 text-accent" />
        <span className="min-w-0 flex-1">
          <span className="block font-medium text-text">Aluno novo</span>
          <span className="block truncate text-xs text-dim">Cadastrar “{request.name}” em {gymName}</span>
        </span>
        {choice === 'new' ? <Check className="size-5 text-accent" /> : null}
      </button>
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faint" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar aluno" className="pl-9" />
      </div>
      <div className="mt-2 max-h-72 divide-y divide-line overflow-y-auto rounded-lg border border-line">
        {students.isPending ? (
          <Loading />
        ) : candidates.length === 0 ? (
          <p className="p-3 text-sm text-dim">Nenhum aluno sem conta encontrado.</p>
        ) : (
          candidates.map((s) => (
            <button key={s.id} type="button" onClick={() => setChoice(s.id)} className={cn('flex w-full items-center gap-3 px-3 py-2.5 text-left', choice === s.id && 'bg-tint')}>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-text">{s.name}</span>
                {!s.active ? <span className="block text-xs text-dim">inativo</span> : null}
              </span>
              {choice === s.id ? <Check className="size-5 text-accent" /> : null}
            </button>
          ))
        )}
      </div>
      <Button block size="lg" className="mt-4" disabled={!choice} loading={approve.isPending} onPress={() => approve.mutate()}>
        {choice === 'new' ? 'Cadastrar e aprovar' : 'Aprovar acesso'}
      </Button>
    </Sheet>
  )
}

/** Foto de rosto enviada no cadastro (toque abre maior). */
function Face({ url, name }: { url?: string; name: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => url && setOpen(true)} className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-2 ring-1 ring-line-strong">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {url ? <img src={url} alt={`Foto de ${name}`} className="size-full object-cover" /> : <UserRound className="size-6 text-faint" />}
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title={name}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {url ? <img src={url} alt={`Foto de ${name}`} className="w-full rounded" /> : null}
      </Sheet>
    </>
  )
}
