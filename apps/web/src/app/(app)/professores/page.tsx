'use client'

import { createInstructorInvite, deleteInstructorInvite, formatDateBR, instructorInviteUrl, keys, listInstructorInvites, type InstructorInvite } from '@kog/core'
import { Badge, Button, Card, EmptyState } from '@kog/ui'
import { useQuery } from '@tanstack/react-query'
import { Copy, MessageCircle, UserPlus } from 'lucide-react'
import { Section } from '@/components/common'
import { Loading, Page } from '@/components/shell'
import { formatDateTimeBR } from '@/components/student-account'
import { useSave } from '@/lib/queries'
import { db } from '@/lib/supabase'
import { toast, toastError } from '@/lib/toast'

const isOpen = (i: InstructorInvite) => !i.used_at && new Date(i.expires_at).getTime() > Date.now()

export default function InvitesPage() {
  const invites = useQuery({ queryKey: keys.instructorInvites, queryFn: () => listInstructorInvites(db()), networkMode: 'online' })
  const create = useSave(() => createInstructorInvite(db()), [keys.instructorInvites], () => toast('Convite gerado'))
  const remove = useSave((token: string) => deleteInstructorInvite(db(), token), [keys.instructorInvites], () => toast('Convite cancelado'))

  const list = invites.data ?? []
  const open = list.filter(isOpen)
  const past = list.filter((i) => !isOpen(i))

  return (
    <Page title="Convidar professor" kicker="Acesso de professor ao app" back="/mais">
      <Card className="p-4">
        <p className="text-sm text-soft">
          Gere um convite e mande para o professor. Pelo link ele cria a conta (ou entra, se já tiver) e passa a usar o app como
          professor. Depois ele cadastra a academia dele, os alunos e a grade. Ele <strong className="text-text">não vê</strong> as suas academias
          nem os seus alunos.
        </p>
        <Button block className="mt-3" loading={create.isPending} onPress={() => create.mutate()}>
          <UserPlus className="size-4" /> Gerar convite
        </Button>
        <p className="mt-2 text-xs text-dim">Cada convite vale para uma pessoa e por 7 dias.</p>
      </Card>

      {invites.isPending ? (
        <Loading />
      ) : invites.isError ? (
        <EmptyState title="Sem conexão">Os convites precisam de internet.</EmptyState>
      ) : (
        <>
          <Section title={`Convites abertos (${open.length})`}>
            {open.length === 0 ? (
              <EmptyState title="Nenhum convite aberto" />
            ) : (
              <div className="space-y-2">
                {open.map((i) => (
                  <OpenInvite key={i.token} invite={i} onCancel={() => window.confirm('Cancelar este convite? O link para de funcionar.') && remove.mutate(i.token)} />
                ))}
              </div>
            )}
          </Section>

          {past.length > 0 ? (
            <Section title="Anteriores">
              <Card className="divide-y divide-line">
                {past.map((i) => (
                  <div key={i.token} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
                    <span className="text-soft">Gerado em {formatDateBR(i.created_at.slice(0, 10))}</span>
                    {i.used_at ? <Badge tone="success">Usado em {formatDateBR(i.used_at.slice(0, 10))}</Badge> : <Badge>Vencido</Badge>}
                  </div>
                ))}
              </Card>
            </Section>
          ) : null}
        </>
      )}
    </Page>
  )
}

function OpenInvite({ invite, onCancel }: { invite: InstructorInvite; onCancel: () => void }) {
  const url = instructorInviteUrl(window.location.origin, invite.token)
  const message = `Oi! Este é o seu convite para usar o app da King of Glory como professor: ${url}\nO link vale até ${formatDateTimeBR(invite.expires_at)} e só pode ser usado uma vez.`

  async function copy() {
    try {
      await navigator.clipboard.writeText(url)
      toast('Convite copiado')
    } catch (error) {
      toastError(error)
    }
  }

  return (
    <Card className="p-3">
      <p className="truncate rounded border border-line bg-surface-2 px-3 py-2 font-mono text-xs text-soft">{url}</p>
      <p className="mt-1.5 text-xs text-dim">Vale até {formatDateTimeBR(invite.expires_at)}</p>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <a
          href={`https://wa.me/?text=${encodeURIComponent(message)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="bg-gold-gradient inline-flex h-12 items-center justify-center gap-2 rounded px-3 text-sm font-bold uppercase tracking-[0.08em] text-ink shadow-gold"
        >
          <MessageCircle className="size-4" /> WhatsApp
        </a>
        <Button variant="ghost" onPress={() => void copy()}><Copy className="size-4" /> Copiar</Button>
      </div>
      <Button variant="plain" size="sm" className="mt-1 text-danger" onPress={onCancel}>Cancelar convite</Button>
    </Card>
  )
}
