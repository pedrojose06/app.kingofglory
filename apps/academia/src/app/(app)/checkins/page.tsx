'use client'

import {
  approvePartnerCheckin, CHECKIN_STATUS_LABEL, deletePartnerLink, ensureAcademyClasses, listAcademyClasses, localDateTime, nearestClass,
  PARTNER_LABEL, type PartnerCheckinList, type PartnerCheckinRow, type PartnerLinkRow, rejectPartnerCheckin,
} from '@kog/core'
import { Badge, Button, Chip, EmptyState, Field, Select, Textarea } from '@kog/ui'
import { toast, toastError } from '@kog/web-kit'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { useMemo, useState } from 'react'
import { Dialog } from '@/components/kit'
import { PageHeader } from '@/components/shell'
import { ErrorState, FormMessage, Loading } from '@/components/states'
import { useAcademy } from '@/lib/academy'
import { keys, usePartnerCheckins, usePartnerIntegrations, usePartnerLinks, usePendingCheckinCount, useStudents } from '@/lib/queries'
import { db } from '@/lib/supabase'

type Tab = PartnerCheckinList | 'vinculos'

const STATUS_TONE = { pendente: 'warning', aprovado: 'success', recusado: 'neutral', erro: 'danger' } as const
const REJECT_REASONS = ['Não veio à aula', 'Check-in duplicado', 'Não é aluno da academia'] as const

const dateTimeBR = (iso: string) => {
  const { date, time } = localDateTime(iso)
  const [y, m, d] = date.split('-')
  return `${d}/${m}/${y} às ${time}`
}
const hhmm = (t: string | null) => (t ? t.slice(0, 5) : '')

export default function CheckinsPage() {
  const { academy, isStaff, isAdmin } = useAcademy()
  const [tab, setTab] = useState<Tab>('pendentes')
  const pending = usePendingCheckinCount()
  const integrations = usePartnerIntegrations()

  if (!isStaff) {
    return (
      <>
        <PageHeader kicker={academy.name} title="Check-ins" />
        <EmptyState title="Só a equipe da academia vê os check-ins." />
      </>
    )
  }
  const configured = (integrations.data ?? []).some((i) => i.enabled)

  return (
    <>
      <PageHeader kicker={academy.name} title="Check-ins Gympass / TotalPass" />
      {integrations.isSuccess && !configured ? (
        <div className="mb-4 rounded-lg border border-line bg-surface p-4 text-sm text-soft">
          Nenhum parceiro ligado ainda.{' '}
          {isAdmin ? (
            <>
              Cadastre o código da academia no Gympass em{' '}
              <Link href="/configuracoes" className="text-accent underline">
                Configurações
              </Link>{' '}
              para os check-ins chegarem aqui.
            </>
          ) : (
            'Peça ao administrador para ligar a integração em Configurações.'
          )}
        </div>
      ) : null}
      <div className="mb-4 flex gap-2 overflow-x-auto">
        <Chip active={tab === 'pendentes'} onPress={() => setTab('pendentes')}>
          Pendentes{pending.data ? ` (${pending.data})` : ''}
        </Chip>
        <Chip active={tab === 'historico'} onPress={() => setTab('historico')}>
          Histórico
        </Chip>
        <Chip active={tab === 'vinculos'} onPress={() => setTab('vinculos')}>
          Alunos vinculados
        </Chip>
      </div>
      {tab === 'vinculos' ? <Links /> : <CheckinList list={tab} />}
    </>
  )
}

function CheckinList({ list }: { list: PartnerCheckinList }) {
  const checkins = usePartnerCheckins(list)
  const [approving, setApproving] = useState<PartnerCheckinRow | null>(null)
  const [rejecting, setRejecting] = useState<PartnerCheckinRow | null>(null)

  if (checkins.isPending) return <Loading />
  if (checkins.isError) return <ErrorState error={checkins.error} onRetry={() => checkins.refetch()} />
  if (checkins.data.length === 0) {
    return list === 'pendentes' ? (
      <EmptyState title="Nenhum check-in esperando.">
        Os check-ins de alunos vinculados, dentro do horário de uma aula, são aprovados sozinhos e já entram como presença.
      </EmptyState>
    ) : (
      <EmptyState title="Nenhum check-in resolvido ainda." />
    )
  }

  return (
    <>
      <ul className="space-y-3">
        {checkins.data.map((c) => (
          <li key={c.id} className="rounded-lg border border-line bg-surface p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="gold">{PARTNER_LABEL[c.provider]}</Badge>
                  <Badge tone={STATUS_TONE[c.status]}>{CHECKIN_STATUS_LABEL[c.status]}</Badge>
                  <span className="text-xs text-dim">{dateTimeBR(c.checked_in_at)}</span>
                </div>
                <p className="mt-2 font-semibold text-text">
                  {c.student?.name ?? c.external_name ?? 'Usuário sem nome'}
                  {c.student && c.external_name && c.external_name !== c.student.name ? (
                    <span className="font-normal text-dim"> · no {PARTNER_LABEL[c.provider]}: {c.external_name}</span>
                  ) : null}
                </p>
                <p className="text-xs text-dim">
                  {c.external_email ? `${c.external_email} · ` : ''}ID {c.external_id}
                </p>
                {c.klass ? (
                  <p className="mt-1 text-sm text-soft">
                    Aula: {c.klass.title} {hhmm(c.klass.start_time)}
                  </p>
                ) : null}
                {c.reason ? <p className={`mt-1 text-sm ${c.status === 'erro' ? 'text-danger' : 'text-soft'}`}>{c.reason}</p> : null}
                {!c.student && c.suggested ? <p className="mt-1 text-sm text-accent">Mesmo e-mail de: {c.suggested.name}</p> : null}
                {list === 'historico' ? (
                  <p className="mt-1 text-xs text-dim">
                    {c.status === 'aprovado' && !c.decided_at ? 'Aprovado automaticamente' : c.decider ? `Por ${c.decider.name}` : 'Decidido pela equipe'}
                  </p>
                ) : null}
              </div>
              {list === 'pendentes' ? (
                <div className="flex shrink-0 gap-2">
                  <Button variant="ghost" size="sm" onPress={() => setRejecting(c)}>
                    Recusar
                  </Button>
                  <Button size="sm" onPress={() => setApproving(c)}>
                    {c.status === 'erro' ? 'Tentar de novo' : 'Aprovar'}
                  </Button>
                </div>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
      {approving ? <ApproveDialog checkin={approving} onClose={() => setApproving(null)} /> : null}
      {rejecting ? <RejectDialog checkin={rejecting} onClose={() => setRejecting(null)} /> : null}
    </>
  )
}

function ApproveDialog({ checkin, onClose }: { checkin: PartnerCheckinRow; onClose: () => void }) {
  const { academy } = useAcademy()
  const queryClient = useQueryClient()
  const students = useStudents()
  const { date } = localDateTime(checkin.checked_in_at)
  const classes = useQuery({
    queryKey: keys.classes(academy.gym_id, date, date),
    queryFn: async () => {
      await ensureAcademyClasses(db(), academy.gym_id, date, date).catch(() => undefined)
      return listAcademyClasses(db(), academy.gym_id, date, date)
    },
  })
  const [studentId, setStudentId] = useState(checkin.student?.id ?? checkin.suggested?.id ?? '')
  const [classId, setClassId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const dayClasses = useMemo(() => (classes.data ?? []).filter((c) => c.status !== 'cancelled'), [classes.data])
  const chosenClass = classId ?? checkin.class_id ?? nearestClass(dayClasses, checkin.checked_in_at)?.id ?? ''
  const options = useMemo(
    () => [...(students.data ?? [])].sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name, 'pt-BR')),
    [students.data],
  )

  const approve = useMutation({
    mutationFn: () => approvePartnerCheckin(db(), { id: checkin.id, studentId, classId: chosenClass || null }),
    onSuccess: async () => {
      toast('Check-in aprovado e presença lançada.')
      onClose()
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'Não foi possível aprovar.'),
    onSettled: () => queryClient.invalidateQueries({ queryKey: keys.checkins(academy.gym_id) }),
  })

  return (
    <Dialog
      open
      onClose={onClose}
      title="Aprovar check-in"
      footer={
        <>
          <Button variant="plain" onPress={onClose}>Cancelar</Button>
          <Button loading={approve.isPending} disabled={!studentId} onPress={() => approve.mutate()}>
            Aprovar
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-soft">
          {checkin.external_name ?? 'Usuário'} fez check-in no {PARTNER_LABEL[checkin.provider]} em {dateTimeBR(checkin.checked_in_at)}. A
          aprovação confirma o check-in no {PARTNER_LABEL[checkin.provider]} e lança a presença.
        </p>
        <Field label="Aluno" hint={checkin.student ? undefined : 'Fica vinculado: os próximos check-ins dele entram sozinhos.'}>
          {students.isPending ? (
            <Loading />
          ) : (
            <Select value={studentId} onChange={(e) => setStudentId(e.target.value)}>
              <option value="">Escolha o aluno…</option>
              {options.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                  {s.active ? '' : ' (inativo)'}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Aula">
          {classes.isPending ? (
            <Loading />
          ) : (
            <Select value={chosenClass} onChange={(e) => setClassId(e.target.value)}>
              <option value="">Sem aula (presença avulsa)</option>
              {dayClasses.map((c) => (
                <option key={c.id} value={c.id}>
                  {hhmm(c.start_time)} · {c.title}
                </option>
              ))}
            </Select>
          )}
        </Field>
        {error ? <FormMessage message={{ text: error, error: true }} /> : null}
      </div>
    </Dialog>
  )
}

function RejectDialog({ checkin, onClose }: { checkin: PartnerCheckinRow; onClose: () => void }) {
  const { academy } = useAcademy()
  const queryClient = useQueryClient()
  const [reason, setReason] = useState('')
  const reject = useMutation({
    mutationFn: () => rejectPartnerCheckin(db(), checkin.id, reason),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: keys.checkins(academy.gym_id) })
      toast('Check-in recusado.')
      onClose()
    },
    onError: toastError,
  })
  return (
    <Dialog
      open
      onClose={onClose}
      title="Recusar check-in"
      footer={
        <>
          <Button variant="plain" onPress={onClose}>Cancelar</Button>
          <Button variant="ghost" loading={reject.isPending} disabled={!reason.trim()} onPress={() => reject.mutate()}>
            Recusar
          </Button>
        </>
      }
    >
      <p className="mb-3 text-sm text-soft">O check-in não é confirmado no {PARTNER_LABEL[checkin.provider]} e não vira presença.</p>
      <div className="mb-3 flex flex-wrap gap-2">
        {REJECT_REASONS.map((r) => (
          <Chip key={r} active={reason === r} onPress={() => setReason(r)}>
            {r}
          </Chip>
        ))}
      </div>
      <Field label="Motivo">
        <Textarea value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
    </Dialog>
  )
}

function Links() {
  const { academy } = useAcademy()
  const queryClient = useQueryClient()
  const links = usePartnerLinks()
  const remove = useMutation({
    mutationFn: (link: PartnerLinkRow) => deletePartnerLink(db(), link),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: keys.partnerLinks(academy.gym_id) })
      toast('Vínculo removido.')
    },
    onError: toastError,
  })
  if (links.isPending) return <Loading />
  if (links.isError) return <ErrorState error={links.error} onRetry={() => links.refetch()} />
  if (links.data.length === 0) {
    return <EmptyState title="Nenhum aluno vinculado.">O vínculo é criado na primeira aprovação manual do check-in de cada aluno.</EmptyState>
  }
  return (
    <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
      {links.data.map((l) => (
        <li key={`${l.provider}:${l.external_id}`} className="flex items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <p className="font-semibold text-text">{l.student?.name ?? 'Aluno removido'}</p>
            <p className="text-xs text-dim">
              {PARTNER_LABEL[l.provider as keyof typeof PARTNER_LABEL]} · ID {l.external_id}
            </p>
          </div>
          <Button
            variant="plain"
            size="sm"
            loading={remove.isPending && remove.variables === l}
            onPress={() => {
              if (window.confirm(`Desvincular ${l.student?.name ?? 'este aluno'}? O próximo check-in vai pedir aprovação.`)) remove.mutate(l)
            }}
          >
            Desvincular
          </Button>
        </li>
      ))}
    </ul>
  )
}
