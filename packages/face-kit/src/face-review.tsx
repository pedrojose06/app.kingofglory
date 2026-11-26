'use client'

// Revisão dos rostos de uma foto do treino. Para cada rosto o app pergunta "Esta pessoa é Fulano? (87%)" e o
// professor confirma, escolhe outro aluno ou ignora. Nada vira presença sem essa resposta (a aprovação automática
// existe só preparada: profiles.face_auto_approve_min, nulo = desligada, sem tela).

import {
  formatConfidence, normalizeName, shouldAddReference, shouldAutoApprove, suggestForFaces, type AttendanceStatus,
  type FaceDecisionItem, type FaceDecisionKind, type FaceSuggestion, type StoredReference, type Student,
} from '@kog/core'
import { Badge, Button, Card, EmptyState, Input, ProgressBar, Sheet } from '@kog/ui'
import { Check, ScanFace, UserRoundSearch, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { cropFace, normalizeBox, type AnalyzedPhoto, type FaceProgress } from './engine'

export interface FaceReviewTarget {
  photoId: string
  classId: string
  gymId: string
}

/**
 * Presença avulsa: não há aula nem foto guardada. As respostas não vão para o banco; os confirmados só voltam para
 * a tela da avulsa, que registra a presença do jeito de sempre.
 */
export interface FaceReviewWalkIn {
  walkIn: true
  onApply: (studentIds: string[]) => void
}

interface Decision {
  kind: FaceDecisionKind
  studentId: string | null
}

/** O que o professor respondeu numa foto: cada app grava do seu jeito (fila offline no app do professor, direto no banco na academia). */
export interface FaceReviewSave {
  target: FaceReviewTarget
  /** Decisões por rosto (as com `embedding` viram referência do aluno). */
  items: FaceDecisionItem[]
  /** Referências novas, para valerem já na próxima foto. */
  added: StoredReference[]
  /** Alunos que o professor confirmou e que ainda não estavam presentes: a presença deve ser marcada pelo rosto. */
  toMark: string[]
}

export interface FaceReviewProps {
  target: FaceReviewTarget | FaceReviewWalkIn | null
  /** Progresso da análise (enquanto não há resultado). */
  progress: FaceProgress | null
  result: AnalyzedPhoto | null
  error: string | null
  /** Alunos que podem ser reconhecidos: da academia, ativos e com consentimento de imagem. */
  students: readonly Student[]
  refs: readonly StoredReference[]
  statusOf: ReadonlyMap<string, AttendanceStatus>
  autoApproveMin: number | null | undefined
  /** Linha extra embaixo do nome (ex.: a academia do aluno, quando o professor dá aula em mais de uma). */
  detailOf?: (studentId: string) => string | undefined
  /** Chamado ao salvar (com pelo menos uma resposta); o app grava e avisa. A janela fecha em seguida. */
  onSave: (save: FaceReviewSave) => void
  onClose: () => void
}

const STAGE_LABEL: Record<FaceProgress['stage'], string> = {
  download: 'Baixando o reconhecimento facial (só na primeira vez)',
  detect: 'Procurando rostos na foto',
  embed: 'Lendo os rostos',
  signup: 'Lendo as fotos do cadastro dos alunos',
}

export function FaceReview({ target, progress, result, error, students, refs, statusOf, autoApproveMin, detailOf, onSave, onClose }: FaceReviewProps) {
  const [crops, setCrops] = useState<string[]>([])
  const [decisions, setDecisions] = useState<Map<number, Decision>>(new Map())
  const [picking, setPicking] = useState<number | null>(null)

  const byId = useMemo(() => new Map(students.map((s) => [s.id, s])), [students])
  const usable = useMemo(() => refs.filter((r) => byId.has(r.student_id)), [refs, byId])
  const suggestions: FaceSuggestion[] = useMemo(
    () => (result ? suggestForFaces(result.faces.map((f) => f.embedding), usable) : []),
    [result, usable],
  )

  // Recortes (em memória) e decisões iniciais quando chega o resultado.
  useEffect(() => {
    if (!result) return
    let urls: string[] = []
    let cancelled = false
    void Promise.all(result.faces.map((f) => cropFace(result.canvas, f.box))).then((list) => {
      urls = list
      if (cancelled) list.forEach((u) => u.startsWith('blob:') && URL.revokeObjectURL(u))
      else setCrops(list)
    })
    const initial = new Map<number, Decision>()
    suggestions.forEach((s, i) => {
      if (s.student_id && shouldAutoApprove(s.confidence, autoApproveMin)) initial.set(i, { kind: 'auto', studentId: s.student_id })
    })
    setDecisions(initial)
    setPicking(null)
    return () => {
      cancelled = true
      urls.forEach((u) => u.startsWith('blob:') && URL.revokeObjectURL(u))
      setCrops([])
    }
    // As sugestões dependem só do resultado e das referências carregadas junto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result])

  const decide = (i: number, d: Decision | null) => {
    setDecisions((prev) => {
      const next = new Map(prev)
      if (d) next.set(i, d)
      else next.delete(i)
      return next
    })
    setPicking(null)
  }

  const taken = new Map<string, number>()
  for (const [i, d] of decisions) if (d.studentId) taken.set(d.studentId, i)

  function save() {
    if (!target || !result) return
    if ('walkIn' in target) {
      const ids = [...decisions.values()].flatMap((d) => (d.studentId ? [d.studentId] : []))
      target.onApply(ids)
      return onClose()
    }
    const items: FaceDecisionItem[] = []
    const added: StoredReference[] = []
    const now = new Date().toISOString()
    for (const [i, d] of decisions) {
      const face = result.faces[i]
      const sug = suggestions[i]
      if (!face || !sug) continue
      const existing = [...refs, ...added].filter((r) => r.student_id === d.studentId).map((r) => r.vector)
      const learn = d.studentId != null && shouldAddReference(face.embedding, existing, d.kind)
      const embeddingId = learn ? crypto.randomUUID() : undefined
      items.push({
        photo_id: target.photoId,
        face_index: i,
        bbox: normalizeBox(face.box, result.width, result.height),
        suggested_student_id: sug.student_id,
        score: sug.student_id ? Math.round(sug.confidence * 1000) / 1000 : null,
        student_id: d.studentId,
        decision: d.kind,
        ...(learn && embeddingId ? { embedding_id: embeddingId, embedding: face.embedding.map((v) => Math.round(v * 1e6) / 1e6) } : {}),
      })
      if (learn && embeddingId && d.studentId) added.push({ id: embeddingId, student_id: d.studentId, vector: face.embedding, created_at: now })
    }
    if (items.length === 0) return onClose()
    const toMark = [
      ...new Set(
        items.flatMap((item) => {
          if (!item.student_id) return []
          const current = statusOf.get(item.student_id)
          return current === 'present' || current === 'late' ? [] : [item.student_id]
        }),
      ),
    ]
    onSave({ target, items, added, toMark })
    onClose()
  }

  function close() {
    // Rostos reconhecidos sem resposta não são salvos: sem este aviso, fechar a revisão descartava o reconhecimento em
    // silêncio (comum quando o professor já tinha feito a chamada à mão antes da foto).
    const unanswered = result ? suggestions.filter((s, i) => s.student_id && !decisions.has(i)).length : 0
    const message =
      decisions.size > 0
        ? 'Sair sem salvar as respostas?'
        : unanswered > 0
          ? `${unanswered} ${unanswered === 1 ? 'aluno reconhecido ainda não foi confirmado' : 'alunos reconhecidos ainda não foram confirmados'}. Sair sem salvar?`
          : null
    if (message && !window.confirm(message)) return
    onClose()
  }

  const marked = [...decisions.values()].filter((d) => d.studentId).length
  const walkIn = !!target && 'walkIn' in target
  const faces = result?.faces ?? []
  // Primeiro os rostos com sugestão (do mais provável ao menos), depois os "Quem é?" da esquerda para a direita.
  const order = faces
    .map((_, i) => i)
    .sort((a, b) => Number(!!suggestions[b]?.student_id) - Number(!!suggestions[a]?.student_id) || (suggestions[a]?.student_id ? (suggestions[b]?.confidence ?? 0) - (suggestions[a]?.confidence ?? 0) : a - b))

  return (
    <Sheet open={!!target} onClose={close} title="Presença pelo rosto">
      {error ? (
        <EmptyState title="Não deu para reconhecer os rostos">{error}</EmptyState>
      ) : !result ? (
        <div className="py-6 text-center">
          <ScanFace className="mx-auto size-10 text-accent" />
          <p className="mt-3 text-sm text-soft">{progress ? STAGE_LABEL[progress.stage] : 'Preparando…'}</p>
          {progress && progress.total > 0 ? (
            <>
              <ProgressBar value={progress.done} max={progress.total} className="mx-auto mt-3 max-w-64" />
              {progress.stage === 'download' ? (
                <p className="mt-1 text-xs text-dim">{mb(progress.done)} de {mb(progress.total)} MB · depois funciona offline</p>
              ) : null}
            </>
          ) : null}
        </div>
      ) : faces.length === 0 ? (
        <EmptyState title="Nenhum rosto encontrado">Funciona melhor com a turma de frente, rostos sem sombra e a foto não muito longe.</EmptyState>
      ) : (
        <>
          <p className="mb-3 text-sm text-soft">
            {faces.length} {faces.length === 1 ? 'rosto encontrado' : 'rostos encontrados'}.{' '}
            {walkIn
              ? 'Confirme quem é cada um: os confirmados ficam marcados na lista, e você registra a avulsa como sempre.'
              : 'Confirme quem é cada um: a presença só é marcada depois da sua resposta.'}
          </p>
          <div className="space-y-2">
            {order.map((i) => (
              <FaceCard
                key={i}
                crop={crops[i]}
                suggestion={suggestions[i]!}
                decision={decisions.get(i)}
                picking={picking === i}
                byId={byId}
                students={students}
                takenBy={(id) => {
                  const at = taken.get(id)
                  return at != null && at !== i
                }}
                statusOf={statusOf}
                detailOf={detailOf}
                walkIn={walkIn}
                onDecide={(d) => decide(i, d)}
                onPick={() => setPicking(picking === i ? null : i)}
              />
            ))}
          </div>
          <div className="sticky bottom-[calc(-1rem-env(safe-area-inset-bottom))] -mx-4 -mb-[calc(1rem+env(safe-area-inset-bottom))] mt-4 border-t border-line bg-bg px-4 pt-3 pb-[calc(1rem+env(safe-area-inset-bottom))]">
            <Button block onPress={save} disabled={decisions.size === 0}>
              {walkIn
                ? marked > 0 ? `Marcar ${marked} ${marked === 1 ? 'aluno' : 'alunos'} na lista` : 'Fechar'
                : marked > 0 ? `Salvar e marcar ${marked} ${marked === 1 ? 'presença' : 'presenças'}` : 'Salvar respostas'}
            </Button>
            <p className="mt-1.5 text-center text-xs text-dim">
              {walkIn ? 'A foto não é guardada: o reconhecimento roda só no seu celular.' : 'Rostos sem resposta não são salvos. Sem sinal, envia depois.'}
            </p>
          </div>
        </>
      )}
    </Sheet>
  )
}

const mb = (bytes: number) => (bytes / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1, minimumFractionDigits: 1 })

interface CardProps {
  crop: string | undefined
  suggestion: FaceSuggestion
  decision: Decision | undefined
  picking: boolean
  byId: ReadonlyMap<string, Student>
  students: readonly Student[]
  takenBy: (studentId: string) => boolean
  statusOf: ReadonlyMap<string, AttendanceStatus>
  detailOf: ((studentId: string) => string | undefined) | undefined
  walkIn: boolean
  onDecide: (d: Decision | null) => void
  onPick: () => void
}

function FaceCard({ crop, suggestion, decision, picking, byId, students, takenBy, statusOf, detailOf, walkIn, onDecide, onPick }: CardProps) {
  const suggested = suggestion.student_id ? byId.get(suggestion.student_id) : undefined
  const chosen = decision?.studentId ? byId.get(decision.studentId) : undefined
  const already = (id: string) => statusOf.get(id) === 'present' || statusOf.get(id) === 'late'

  return (
    <Card className="p-3">
      <div className="flex gap-3">
        <div className="size-20 shrink-0 overflow-hidden rounded bg-surface-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {crop ? <img src={crop} alt="Rosto encontrado na foto" className="size-full object-cover" /> : null}
        </div>
        <div className="min-w-0 flex-1">
          {decision ? (
            <>
              {decision.kind === 'ignored' ? (
                <Badge>Ignorado</Badge>
              ) : (
                <Badge tone="success">{decision.kind === 'auto' ? 'Aprovado automaticamente' : 'Confirmado'}</Badge>
              )}
              {chosen ? <p className="mt-1.5 truncate font-bold text-text">{chosen.name}</p> : null}
              {chosen && detailOf?.(chosen.id) ? <p className="truncate text-xs text-dim">{detailOf(chosen.id)}</p> : null}
              {chosen && already(chosen.id) ? <p className="text-xs text-dim">{walkIn ? 'Já estava marcado na lista' : 'Já estava presente'}</p> : null}
              <button type="button" onClick={() => onDecide(null)} className="mt-1 block text-xs font-bold uppercase tracking-[0.08em] text-accent">
                Desfazer
              </button>
            </>
          ) : suggested ? (
            <>
              <p className="text-sm text-soft">Esta pessoa é</p>
              <p className="font-bold leading-snug text-text">
                {suggested.name}? <span className="font-normal text-accent">({formatConfidence(suggestion.confidence)})</span>
              </p>
              {detailOf?.(suggested.id) ? <p className="truncate text-xs text-dim">{detailOf(suggested.id)}</p> : null}
              {already(suggested.id) ? <p className="text-xs text-dim">{walkIn ? 'Já está marcado na lista' : 'Já está presente na chamada'}</p> : null}
            </>
          ) : (
            <>
              <p className="font-bold text-text">Quem é?</p>
              <p className="text-xs text-dim">
                {students.length === 0
                  ? 'Nenhum aluno autorizou o reconhecimento.'
                  : walkIn ? 'Escolha o aluno na lista.' : 'Escolha o aluno: o app aprende com a sua resposta.'}
              </p>
            </>
          )}
        </div>
      </div>

      {!decision ? (
        <div className="mt-3 grid grid-cols-3 gap-2">
          {suggested ? (
            <Button size="sm" onPress={() => onDecide({ kind: 'confirmed', studentId: suggested.id })} disabled={takenBy(suggested.id)}>
              <Check className="size-4" /> Confirmar
            </Button>
          ) : null}
          <Button size="sm" variant="ghost" onPress={onPick} className={suggested ? '' : 'col-span-2'}>
            {suggested ? 'É outro' : (<><UserRoundSearch className="size-4" /> Escolher aluno</>)}
          </Button>
          <Button size="sm" variant="plain" onPress={() => onDecide({ kind: 'ignored', studentId: null })}>
            <X className="size-4" /> Ignorar
          </Button>
        </div>
      ) : null}

      {picking && !decision ? (
        <StudentPicker
          students={students}
          suggestion={suggestion}
          takenBy={takenBy}
          detailOf={detailOf}
          onPick={(id) => onDecide({ kind: 'corrected', studentId: id })}
        />
      ) : null}
    </Card>
  )
}

function StudentPicker({ students, suggestion, takenBy, detailOf, onPick }: {
  students: readonly Student[]
  suggestion: FaceSuggestion
  takenBy: (id: string) => boolean
  detailOf: ((studentId: string) => string | undefined) | undefined
  onPick: (studentId: string) => void
}) {
  const [query, setQuery] = useState('')
  const score = new Map(suggestion.alternatives.map((a) => [a.student_id, a.confidence]))
  const q = normalizeName(query)
  const list = students
    .filter((s) => s.id !== suggestion.student_id && (!q || normalizeName(s.name).includes(q)))
    .sort((a, b) => (score.get(b.id) ?? -1) - (score.get(a.id) ?? -1) || a.name.localeCompare(b.name, 'pt-BR'))
  return (
    <div className="mt-3 border-t border-line pt-3">
      <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar aluno" aria-label="Buscar aluno" />
      <div className="mt-2 max-h-56 divide-y divide-line overflow-y-auto rounded border border-line">
        {list.length === 0 ? <p className="px-3 py-3 text-sm text-dim">Nenhum aluno encontrado.</p> : null}
        {list.map((s) => {
          const c = score.get(s.id)
          const busy = takenBy(s.id)
          return (
            <button
              key={s.id}
              type="button"
              disabled={busy}
              onClick={() => onPick(s.id)}
              className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-sm text-text active:bg-tint disabled:opacity-40"
            >
              <span className="min-w-0">
                <span className="block truncate">{s.name}</span>
                {detailOf?.(s.id) ? <span className="block truncate text-xs text-dim">{detailOf(s.id)}</span> : null}
              </span>
              <span className="shrink-0 text-xs text-dim">{busy ? 'outro rosto' : c != null && c > 0 ? formatConfidence(c) : ''}</span>
            </button>
          )
        })}
      </div>
      <p className="mt-1.5 text-xs text-dim">Só aparecem alunos ativos que autorizaram o uso de imagem.</p>
    </div>
  )
}
