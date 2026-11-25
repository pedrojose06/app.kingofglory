'use client'

import {
  ACADEMY_ROLE_HINT, ACADEMY_ROLE_LABEL, ACADEMY_ROLES, type AcademyInvite, type AcademyRole, academyInviteLink, academyInviteStatus,
  cancelAcademyInvite, createAcademyInvite, isValidEmail, listAcademyInvites, listAcademyMembers, normalizeEmail, setAcademyMemberRole,
  updateAcademy,
} from '@kog/core'
import { Badge, Button, Card, EmptyState, Field, Input, Select } from '@kog/ui'
import { toast, toastError, useAuth } from '@kog/web-kit'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Copy, MessageCircle, Share2 } from 'lucide-react'
import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { PageHeader } from '@/components/shell'
import { ErrorState, Loading } from '@/components/states'
import { academyKeys, useAcademy } from '@/lib/academy'
import { db } from '@/lib/supabase'

const STATUS_TONE = { aberto: 'gold', aceito: 'success', cancelado: 'neutral', vencido: 'warning' } as const
const STATUS_LABEL = { aberto: 'Aguardando', aceito: 'Aceito', cancelado: 'Cancelado', vencido: 'Vencido' } as const
const dateBR = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })

export default function SettingsPage() {
  const { academy, isAdmin } = useAcademy()
  if (!isAdmin) {
    return (
      <>
        <PageHeader kicker={academy.name} title="Configurações" />
        <EmptyState title="Só o administrador da academia acessa as configurações." />
      </>
    )
  }
  return (
    <>
      <PageHeader kicker={academy.name} title="Configurações" />
      <div className="grid gap-6 xl:grid-cols-2">
        <div className="space-y-6">
          <AcademyForm />
          <Members />
        </div>
        <Invites />
      </div>
    </>
  )
}

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <Card className="p-5">
      <h2 className="font-display text-xl uppercase tracking-[0.02em] text-text">{title}</h2>
      {description ? <p className="mt-1 text-sm text-dim">{description}</p> : null}
      <div className="mt-4">{children}</div>
    </Card>
  )
}

function AcademyForm() {
  const { academy } = useAcademy()
  const queryClient = useQueryClient()
  const [name, setName] = useState(academy.name)
  const [address, setAddress] = useState(academy.address ?? '')
  useEffect(() => {
    setName(academy.name)
    setAddress(academy.address ?? '')
  }, [academy.name, academy.address])

  const save = useMutation({
    mutationFn: () => updateAcademy(db(), academy.gym_id, { name, address }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['academia', 'minhas'] })
      toast('Dados da academia salvos.')
    },
    onError: toastError,
  })
  const changed = name.trim() !== academy.name || address.trim() !== (academy.address ?? '')

  return (
    <Section title="Academia">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          save.mutate()
        }}
      >
        <Field label="Nome">
          <Input required value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Endereço" hint="Opcional. Vai aparecer nos contratos.">
          <Input value={address} onChange={(e) => setAddress(e.target.value)} />
        </Field>
        <Button type="submit" disabled={!changed || !name.trim()} loading={save.isPending}>
          Salvar
        </Button>
      </form>
    </Section>
  )
}

function Members() {
  const { academy } = useAcademy()
  const { session } = useAuth()
  const queryClient = useQueryClient()
  const members = useQuery({ queryKey: academyKeys.members(academy.gym_id), queryFn: () => listAcademyMembers(db(), academy.gym_id) })

  const change = useMutation({
    mutationFn: ({ profileId, role }: { profileId: string; role: AcademyRole | null }) => setAcademyMemberRole(db(), academy.gym_id, profileId, role),
    onSuccess: async (_d, { role }) => {
      await queryClient.invalidateQueries({ queryKey: ['academia'] })
      toast(role ? 'Papel alterado.' : 'Acesso removido.')
    },
    onError: toastError,
  })

  return (
    <Section title="Pessoas com acesso" description="Quem entra no sistema da academia e o que cada um vê.">
      {members.isPending ? (
        <Loading />
      ) : members.isError ? (
        <ErrorState error={members.error} onRetry={() => members.refetch()} />
      ) : members.data.length === 0 ? (
        <EmptyState title="Ninguém com acesso ainda." />
      ) : (
        <ul className="divide-y divide-line">
          {members.data.map((m) => {
            const me = m.profile_id === session?.user.id
            return (
              <li key={m.profile_id} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-text">
                    {m.name || 'Sem nome'} {me ? <span className="text-xs font-normal text-dim">(você)</span> : null}
                  </p>
                  <p className="text-xs text-dim">Desde {dateBR(m.created_at)}</p>
                </div>
                <Select
                  aria-label={`Papel de ${m.name}`}
                  className="h-10 w-auto min-w-44 text-sm"
                  value={m.role}
                  disabled={change.isPending}
                  onChange={(e) => change.mutate({ profileId: m.profile_id, role: e.target.value as AcademyRole })}
                >
                  {ACADEMY_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {ACADEMY_ROLE_LABEL[r]}
                    </option>
                  ))}
                </Select>
                <Button
                  variant="danger"
                  size="sm"
                  disabled={change.isPending}
                  onPress={() => {
                    if (window.confirm(me ? 'Remover o SEU acesso a esta academia?' : `Remover o acesso de ${m.name || 'este membro'}?`)) {
                      change.mutate({ profileId: m.profile_id, role: null })
                    }
                  }}
                >
                  Remover
                </Button>
              </li>
            )
          })}
        </ul>
      )}
    </Section>
  )
}

function InviteLinkBox({ email, link, onClose }: { email: string; link: string; onClose: () => void }) {
  const text = `Você foi convidado para o sistema da academia. Crie a sua conta com o e-mail ${email}: ${link}`
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'
  return (
    <div className="space-y-3 rounded border border-gold/50 bg-tint p-4">
      <p className="text-sm font-semibold text-text">Convite criado para {email}</p>
      <p className="text-xs text-soft">
        Envie o link para a pessoa. Ele aparece só agora: se perder, gere um novo (o anterior deixa de valer). Só a conta com este
        e-mail, confirmado, consegue aceitar.
      </p>
      <Input readOnly value={link} onFocus={(e) => e.target.select()} className="h-10 text-sm" />
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          onPress={() =>
            navigator.clipboard.writeText(link).then(
              () => toast('Link copiado.'),
              () => toast('Não foi possível copiar. Selecione o link e copie.', 'error'),
            )
          }
        >
          <Copy className="size-4" /> Copiar
        </Button>
        <a
          href={`https://wa.me/?text=${encodeURIComponent(text)}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-9 items-center gap-2 rounded border border-line-strong px-3 text-xs font-bold uppercase tracking-[0.08em] text-accent"
        >
          <MessageCircle className="size-4" /> WhatsApp
        </a>
        {canShare ? (
          <Button variant="ghost" size="sm" onPress={() => void navigator.share({ text }).catch(() => {})}>
            <Share2 className="size-4" /> Compartilhar
          </Button>
        ) : null}
        <Button variant="plain" size="sm" onPress={onClose}>
          Fechar
        </Button>
      </div>
    </div>
  )
}

function Invites() {
  const { academy } = useAcademy()
  const queryClient = useQueryClient()
  const invites = useQuery({ queryKey: academyKeys.invites(academy.gym_id), queryFn: () => listAcademyInvites(db(), academy.gym_id) })
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<AcademyRole>('professor')
  const [created, setCreated] = useState<{ email: string; link: string } | null>(null)

  const create = useMutation({
    mutationFn: (input: { email: string; role: AcademyRole }) => createAcademyInvite(db(), academy.gym_id, input.email, input.role),
    onSuccess: async (token, input) => {
      setCreated({ email: normalizeEmail(input.email), link: academyInviteLink(window.location.origin, token) })
      setEmail('')
      await queryClient.invalidateQueries({ queryKey: academyKeys.invites(academy.gym_id) })
    },
    onError: toastError,
  })
  const cancel = useMutation({
    mutationFn: (id: string) => cancelAcademyInvite(db(), id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: academyKeys.invites(academy.gym_id) })
      toast('Convite cancelado.')
    },
    onError: toastError,
  })

  function submit(e: FormEvent) {
    e.preventDefault()
    if (!isValidEmail(email)) return toast('Informe um e-mail válido.', 'error')
    create.mutate({ email, role })
  }

  return (
    <Section title="Convites" description="O acesso é sempre por convite para um e-mail. Para trocar o e-mail de alguém, cancele e convide o novo.">
      <form onSubmit={submit} className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
        <Field label="E-mail">
          <Input type="email" required placeholder="nome@exemplo.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Papel">
          <Select value={role} onChange={(e) => setRole(e.target.value as AcademyRole)}>
            {ACADEMY_ROLES.map((r) => (
              <option key={r} value={r}>
                {ACADEMY_ROLE_LABEL[r]}
              </option>
            ))}
          </Select>
        </Field>
        <p className="text-xs text-dim sm:col-span-2">{ACADEMY_ROLE_HINT[role]}</p>
        <Button type="submit" loading={create.isPending} className="sm:col-span-2 sm:justify-self-start">
          Gerar convite
        </Button>
      </form>

      {created ? (
        <div className="mt-4">
          <InviteLinkBox email={created.email} link={created.link} onClose={() => setCreated(null)} />
        </div>
      ) : null}

      <div className="mt-6">
        {invites.isPending ? (
          <Loading />
        ) : invites.isError ? (
          <ErrorState error={invites.error} onRetry={() => invites.refetch()} />
        ) : invites.data.length === 0 ? (
          <EmptyState title="Nenhum convite enviado." />
        ) : (
          <ul className="divide-y divide-line">
            {invites.data.map((inv) => (
              <InviteRow
                key={inv.id}
                invite={inv}
                busy={create.isPending || cancel.isPending}
                onRenew={() => create.mutate({ email: inv.email, role: inv.role })}
                onCancel={() => cancel.mutate(inv.id)}
              />
            ))}
          </ul>
        )}
      </div>
    </Section>
  )
}

function InviteRow({ invite, busy, onRenew, onCancel }: { invite: AcademyInvite; busy: boolean; onRenew: () => void; onCancel: () => void }) {
  const status = academyInviteStatus(invite)
  return (
    <li className="flex flex-wrap items-center gap-3 py-3">
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold text-text">{invite.email}</p>
        <p className="text-xs text-dim">
          {ACADEMY_ROLE_LABEL[invite.role]} · enviado em {dateBR(invite.created_at)}
          {status === 'aberto' ? ` · vale até ${dateBR(invite.expires_at)}` : ''}
        </p>
      </div>
      <Badge tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Badge>
      {status === 'aberto' || status === 'vencido' ? (
        <Button variant="ghost" size="sm" disabled={busy} onPress={onRenew}>
          Novo link
        </Button>
      ) : null}
      {status === 'aberto' ? (
        <Button variant="plain" size="sm" disabled={busy} onPress={onCancel}>
          Cancelar
        </Button>
      ) : null}
    </li>
  )
}
