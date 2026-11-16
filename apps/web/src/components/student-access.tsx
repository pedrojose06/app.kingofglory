'use client'

import { formatDateBR, getStudentAccess, keys, revokeStudentAccess, rotateStudentAccess, studentPortalUrl, type Student } from '@kog/core'
import { Button, Card } from '@kog/ui'
import { Copy, Link2, MessageCircle } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { Section } from '@/components/common'
import { useSave } from '@/lib/queries'
import { db } from '@/lib/supabase'
import { toast, toastError } from '@/lib/toast'

/** wa.me exige o número com DDI; telefones brasileiros cadastrados sem o 55 ganham o prefixo. */
function whatsappUrl(phone: string | null, text: string): string {
  let digits = (phone ?? '').replace(/\D/g, '')
  if (digits.length === 10 || digits.length === 11) digits = `55${digits}`
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`
}

/** Link secreto para o aluno ver as próprias presenças e a graduação sem login. */
export function StudentAccessSection({ student }: { student: Student }) {
  const access = useQuery({
    queryKey: keys.studentAccess(student.id),
    queryFn: () => getStudentAccess(db(), student.id),
    networkMode: 'online',
  })
  const invalidate = [keys.studentAccess(student.id)] as const
  const rotate = useSave(() => rotateStudentAccess(db(), student.id), invalidate, () => toast('Link do aluno gerado'))
  const revoke = useSave(() => revokeStudentAccess(db(), student.id), invalidate, () => toast('Link desativado'))

  const url = access.data ? studentPortalUrl(window.location.origin, access.data.token) : ''
  const firstName = student.name.trim().split(/\s+/)[0]
  const message = `Oi, ${firstName}! Aqui você acompanha suas presenças e sua graduação na King of Glory: ${url}`

  async function copy() {
    try {
      await navigator.clipboard.writeText(url)
      toast('Link copiado')
    } catch (error) {
      toastError(error)
    }
  }

  return (
    <Section title="Área do aluno">
      <Card className="p-4">
        {access.isPending ? (
          <p className="text-sm text-dim">Carregando…</p>
        ) : access.isError ? (
          <p className="text-sm text-dim">Sem conexão. O link do aluno precisa de internet.</p>
        ) : !access.data ? (
          <>
            <p className="text-sm text-soft">
              Gere um link para {firstName} acompanhar as presenças e a graduação pelo celular, sem senha.
            </p>
            <Button block className="mt-3" loading={rotate.isPending} onPress={() => rotate.mutate()}>
              <Link2 className="size-4" /> Gerar link
            </Button>
          </>
        ) : (
          <>
            <p className="truncate rounded border border-line bg-surface-2 px-3 py-2 font-mono text-xs text-soft">{url}</p>
            <p className="mt-1.5 text-xs text-dim">
              {access.data.last_seen_at ? `Aberto pelo aluno em ${formatDateBR(access.data.last_seen_at.slice(0, 10))}` : 'Ainda não foi aberto'}
              {' · '}gerado em {formatDateBR(access.data.created_at.slice(0, 10))}
            </p>
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
                onPress={() => window.confirm('Gerar um novo link? O link atual para de funcionar.') && rotate.mutate()}
              >
                Gerar novo link
              </Button>
              <Button
                variant="plain"
                size="sm"
                className="text-danger"
                loading={revoke.isPending}
                onPress={() => window.confirm('Desativar o link? O aluno perde o acesso até você gerar outro.') && revoke.mutate()}
              >
                Desativar
              </Button>
            </div>
          </>
        )}
      </Card>
      <p className="mt-2 text-xs text-dim">Quem tiver o link vê as presenças e a graduação deste aluno. Telefone e observações não aparecem.</p>
    </Section>
  )
}
