'use client'

import {
  DEFAULT_STUDENT_LINK_HOURS, STUDENT_LINK_HOURS, formatDateBR, getStudentAccess, keys, revokeStudentAccess, rotateStudentAccess,
  studentPortalUrl, unlinkStudentAccount, type Student,
} from '@kog/core'
import { Badge, Button, Card, Chip } from '@kog/ui'
import { Copy, Link2, MessageCircle, UserCheck } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Section } from '@/components/common'
import { formatDateTimeBR } from '@/components/student-account'
import { useSave } from '@/lib/queries'
import { db } from '@/lib/supabase'
import { toast, toastError } from '@/lib/toast'

/** wa.me exige o número com DDI; telefones brasileiros cadastrados sem o 55 ganham o prefixo. */
function whatsappUrl(phone: string | null, text: string): string {
  let digits = (phone ?? '').replace(/\D/g, '')
  if (digits.length === 10 || digits.length === 11) digits = `55${digits}`
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`
}

const hoursLabel = (h: number) => (h < 48 ? `${h} horas` : `${h / 24} dias`)

/** Link temporário para o aluno ver as próprias presenças e a graduação, e a situação da conta dele no app. */
export function StudentAccessSection({ student }: { student: Student }) {
  const access = useQuery({
    queryKey: keys.studentAccess(student.id),
    queryFn: () => getStudentAccess(db(), student.id),
    networkMode: 'online',
  })
  const [hours, setHours] = useState<number>(DEFAULT_STUDENT_LINK_HOURS)
  const invalidate = [keys.studentAccess(student.id)] as const
  const rotate = useSave((h: number) => rotateStudentAccess(db(), student.id, h), invalidate, () => toast('Link do aluno gerado'))
  const revoke = useSave(() => revokeStudentAccess(db(), student.id), invalidate, () => toast('Link desativado'))
  const unlink = useSave(() => unlinkStudentAccount(db(), student.id), [keys.students], () => toast('Conta desvinculada'))

  const expired = !!access.data && new Date(access.data.expires_at).getTime() <= Date.now()
  const url = access.data && !expired ? studentPortalUrl(window.location.origin, access.data.token) : ''
  const firstName = student.name.trim().split(/\s+/)[0]
  const hasAccount = !!student.profile_id
  const until = access.data ? formatDateTimeBR(access.data.expires_at) : ''
  const message =
    `Oi, ${firstName}! Aqui você acompanha suas presenças e sua graduação na King of Glory: ${url}\n` +
    `O link vale até ${until}.` +
    (hasAccount ? '' : ' Por ele você pode criar sua conta e acessar sempre, sem precisar de link.')

  async function copy() {
    try {
      await navigator.clipboard.writeText(url)
      toast('Link copiado')
    } catch (error) {
      toastError(error)
    }
  }

  const hoursPicker = (
    <div className="mt-3">
      <p className="mb-1.5 text-xs font-bold uppercase tracking-[0.08em] text-dim">Validade do link</p>
      <div className="flex gap-2">
        {STUDENT_LINK_HOURS.map((h) => (
          <Chip key={h} active={hours === h} onPress={() => setHours(h)} className="flex-1">{hoursLabel(h)}</Chip>
        ))}
      </div>
    </div>
  )

  return (
    <Section title="Área do aluno">
      <Card className="p-4">
        <div className="mb-3 flex items-center gap-2 border-b border-line pb-3">
          <UserCheck className={hasAccount ? 'size-5 text-success' : 'size-5 text-faint'} />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-text">{hasAccount ? 'Tem conta no app' : 'Ainda sem conta no app'}</p>
            <p className="text-xs text-dim">
              {!hasAccount
                ? 'O aluno cria a conta pelo link e passa a acessar sem precisar de link.'
                : student.account_consent_at && student.image_consent_at
                  ? `Acessa pela conta · uso de imagem aceito em ${formatDateBR(student.account_consent_at.slice(0, 10))}`
                  : 'Bloqueada até o aluno aceitar o uso de imagem (LGPD) no app.'}
            </p>
          </div>
          {hasAccount ? (
            <Button
              variant="plain"
              size="sm"
              className="text-danger"
              loading={unlink.isPending}
              onPress={() => window.confirm(`Desvincular a conta de ${firstName}? Ele perde o acesso pela conta e volta a depender do link.`) && unlink.mutate()}
            >
              Desvincular
            </Button>
          ) : null}
        </div>

        {access.isPending ? (
          <p className="text-sm text-dim">Carregando…</p>
        ) : access.isError ? (
          <p className="text-sm text-dim">Sem conexão. O link do aluno precisa de internet.</p>
        ) : !access.data || expired ? (
          <>
            <p className="text-sm text-soft">
              {expired
                ? `O último link venceu em ${formatDateTimeBR(access.data!.expires_at)}.`
                : `Gere um link para ${firstName} acompanhar as presenças e a graduação pelo celular, sem senha.`}
            </p>
            {hoursPicker}
            <Button block className="mt-3" loading={rotate.isPending} onPress={() => rotate.mutate(hours)}>
              <Link2 className="size-4" /> {expired ? 'Gerar novo link' : 'Gerar link'}
            </Button>
          </>
        ) : (
          <>
            <p className="truncate rounded border border-line bg-surface-2 px-3 py-2 font-mono text-xs text-soft">{url}</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-dim">
              <Badge tone="gold">Vale até {formatDateTimeBR(access.data.expires_at)}</Badge>
              <span>{access.data.last_seen_at ? `aberto em ${formatDateBR(access.data.last_seen_at.slice(0, 10))}` : 'ainda não foi aberto'}</span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <a
                href={whatsappUrl(student.phone, message)}
                target="_blank"
                rel="noopener noreferrer"
                className="bg-gold-gradient inline-flex h-12 items-center justify-center gap-2 rounded px-3 text-sm font-bold uppercase tracking-[0.08em] text-ink shadow-gold"
              >
                <MessageCircle className="size-4" /> WhatsApp
              </a>
              <Button variant="ghost" onPress={() => void copy()}>
                <Copy className="size-4" /> Copiar
              </Button>
            </div>
            <div className="mt-2 flex justify-between">
              <Button
                variant="plain"
                size="sm"
                loading={rotate.isPending}
                onPress={() => window.confirm('Gerar um novo link (válido por 24 horas)? O link atual para de funcionar.') && rotate.mutate(DEFAULT_STUDENT_LINK_HOURS)}
              >
                Gerar novo link
              </Button>
              <Button
                variant="plain"
                size="sm"
                className="text-danger"
                loading={revoke.isPending}
                onPress={() => window.confirm('Desativar o link? O aluno perde o acesso pelo link até você gerar outro.') && revoke.mutate()}
              >
                Desativar
              </Button>
            </div>
          </>
        )}
      </Card>
      <p className="mt-2 text-xs text-dim">
        Quem tiver o link vê as presenças e a graduação deste aluno até a validade. Telefone e observações não aparecem.
      </p>
    </Section>
  )
}
