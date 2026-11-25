'use client'

import {
  CANDIDATE_STATUS_LABEL, decideGraduationCandidate, formatConfidence, formatDateBR, keys, listMyGraduationCandidates, signGraduationPhotoUrls,
  type MyGraduationCandidate, type Rank,
} from '@kog/core'
import { FaceThumb } from '@kog/face-kit'
import { Badge, Button, Card, RankBand } from '@kog/ui'
import { useQuery } from '@tanstack/react-query'
import { ArrowRight, Check, X } from 'lucide-react'
import { useMemo } from 'react'
import { Section } from '@/components/common'
import { useRanks, useSave } from '@/lib/queries'
import { db } from '@/lib/supabase'
import { toast } from '@/lib/toast'

/**
 * Alunos do professor reconhecidos pelo rosto (ou incluídos pelo nome) numa graduação da equipe. O professor aprova
 * ou não o avanço de grau; aprovado, a graduação entra no histórico do aluno com a data do evento. Se a academia já
 * decidiu, aparece como decidido (o professor ainda pode mudar). Fica em Pendências; some quando não há nada.
 */
export function GraduationApprovalsSection() {
  const candidates = useQuery({ queryKey: keys.graduationCandidates, queryFn: () => listMyGraduationCandidates(db()) })
  const ranks = useRanks()
  const rankById = useMemo(() => new Map((ranks.data ?? []).map((r) => [r.id, r])), [ranks.data])
  const list = candidates.data ?? []
  const paths = [...new Set(list.map((c) => c.storage_path).filter((p): p is string => !!p))].sort()
  const urls = useQuery({
    queryKey: [...keys.graduationCandidates, 'urls', paths.join(',')],
    queryFn: () => signGraduationPhotoUrls(db(), paths),
    enabled: paths.length > 0,
    staleTime: 30 * 60_000,
    gcTime: 50 * 60_000, // URLs assinadas valem 1h
  })
  const decide = useSave(
    ({ id, approve }: { id: string; approve: boolean }) => decideGraduationCandidate(db(), id, approve),
    [keys.graduationCandidates, ['graduations'], keys.progress],
    () => toast('Resposta salva'),
  )

  if (list.length === 0) return null
  const pending = list.filter((c) => c.status === 'pending')
  const decided = list.filter((c) => c.status !== 'pending')

  return (
    <Section title={pending.length === 1 ? '1 graduação para aprovar' : pending.length > 1 ? `${pending.length} graduações para aprovar` : 'Graduações recentes'}>
      <div className="space-y-2">
        {[...pending, ...decided].map((c) => (
          <CandidateCard
            key={c.id}
            c={c}
            url={c.storage_path ? urls.data?.[c.storage_path] : undefined}
            from={c.from_rank_id ? rankById.get(c.from_rank_id) : undefined}
            to={rankById.get(c.to_rank_id)}
            busy={decide.isPending && decide.variables?.id === c.id}
            onDecide={(approve) => decide.mutate({ id: c.id, approve })}
          />
        ))}
      </div>
      <p className="mt-2 text-xs text-dim">
        A academia reconheceu estes alunos nas fotos da graduação. Aprovado, o novo grau entra no histórico do aluno com a data
        da graduação e o contador de treinos recomeça dali.
      </p>
    </Section>
  )
}

function CandidateCard({ c, url, from, to, busy, onDecide }: {
  c: MyGraduationCandidate
  url: string | undefined
  from: Rank | undefined
  to: Rank | undefined
  busy: boolean
  onDecide: (approve: boolean) => void
}) {
  const via = c.decided_via === 'academia' ? ' pela academia' : c.decided_via === 'professor' ? ' por você' : ''
  return (
    <Card className="p-3">
      <div className="flex items-start gap-3">
        <FaceThumb src={url} bbox={c.bbox} size={56} alt={c.student_name} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-bold text-text">{c.student_name}</p>
          <p className="text-xs font-bold uppercase tracking-[0.08em] text-accent">
            Graduação de {formatDateBR(c.held_on)} · {c.host_gym_name}
          </p>
          <p className="mt-0.5 text-xs text-dim">
            {c.source === 'face' && c.score != null ? `Reconhecido pelo rosto (${formatConfidence(c.score)})` : 'Incluído pela academia'}
          </p>
        </div>
        {c.status !== 'pending' ? (
          <Badge tone={c.status === 'approved' ? 'success' : 'danger'}>{CANDIDATE_STATUS_LABEL[c.status]}{via}</Badge>
        ) : null}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-sm">
        {from ? <span className="inline-flex items-center gap-1.5 text-soft"><RankBand colors={from.colors} className="w-6" />{from.name}</span> : <span className="text-dim">Sem graduação</span>}
        <ArrowRight className="size-3.5 text-faint" />
        {to ? <span className="inline-flex items-center gap-1.5 font-semibold text-text"><RankBand colors={to.colors} className="w-6" />{to.name}</span> : null}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button variant="ghost" className="text-danger" disabled={busy || c.status === 'rejected'} onPress={() => onDecide(false)}>
          <X className="size-4" /> Não aprovar
        </Button>
        <Button loading={busy} disabled={c.status === 'approved'} onPress={() => onDecide(true)}>
          <Check className="size-4" /> Aprovar
        </Button>
      </div>
    </Card>
  )
}
