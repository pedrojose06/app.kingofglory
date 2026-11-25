'use client'

import {
  approveStudentRequest, formatDateBR, getGuardianSignature, keys, maskCpf, rejectStudentRequest, reviewGuardianConsent, signFaceUrls,
  type StudentRequest,
} from '@kog/core'
import { Badge, Button, Card, Chip, Input, Sheet, cn } from '@kog/ui'
import { useQuery } from '@tanstack/react-query'
import { Award, Cake, Check, Eye, FileSignature, Mail, Phone, Search, UserPlus, UserRound } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Section } from '@/components/common'
import { useOpenGuardianFile } from '@/components/guardian-term'
import { formatDateTimeBR } from '@/components/student-account'
import { Loading } from '@/components/shell'
import { useGyms, useSave, useStudentRequests, useStudents } from '@/lib/queries'
import { db } from '@/lib/supabase'
import { openSignedGuardianTerm } from '@/lib/guardian-term'
import { toast, toastError } from '@/lib/toast'

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
            <p className="mt-0.5 flex items-center gap-1.5 text-sm text-soft">
              <Award className="size-3.5 shrink-0" /> {rankLabel(r)}
            </p>
            {r.birth_date ? <p className="mt-0.5 flex items-center gap-1.5 text-sm text-soft"><Cake className="size-3.5 shrink-0" /> Nascimento: {formatDateBR(r.birth_date)}</p> : null}
            {r.minor ? (
              <p className="mt-1.5">
                <Badge tone="warning">{r.guardian_term ? 'Menor · termo do responsável para conferir' : 'Menor · sem termo do responsável'}</Badge>
              </p>
            ) : null}
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
        A graduação é o que o aluno informou; aprovado, ela entra no histórico dele (se ele ainda não tiver nenhuma registrada).
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
  // Aluno menor: antes de aprovar, a etapa do termo (abrir, conferir e só então aprovar).
  const [step, setStep] = useState<'pick' | 'term'>('pick')
  const [viewed, setViewed] = useState(false)
  // Termo em papel: o professor diz se o responsável autorizou. Assinado na tela: a resposta vem do termo.
  const [paperImage, setPaperImage] = useState<boolean | null>(null)
  const term = request.minor ? (request.guardian_term ?? null) : null
  const signature = useQuery({
    queryKey: [...keys.studentRequests, 'term', request.id],
    queryFn: () => getGuardianSignature(db(), { requestId: request.id }),
    enabled: term === 'esign',
    networkMode: 'online',
  })
  const esignYes = !!signature.data?.image_authorized && !!signature.data?.face_authorized
  const approve = useSave(
    async () => {
      const studentId = await approveStudentRequest(db(), request.id, choice && choice !== 'new' ? choice : undefined)
      // Termo conferido aqui: já sai aprovado (o professor não precisa conferir de novo).
      if (!term) return true
      try {
        await reviewGuardianConsent(db(), studentId, { approve: true, imageConsent: term === 'esign' ? esignYes : paperImage === true })
        return true
      } catch {
        // Aluno já aprovado; o termo continua "para conferir" na ficha dele.
        return false
      }
    },
    [keys.studentRequests, keys.students, keys.guardianConsents],
    (termOk) => {
      toast(!term ? 'Acesso aprovado' : termOk ? 'Acesso e termo do responsável aprovados' : 'Acesso aprovado. Confira o termo do responsável na ficha do aluno.')
      onClose()
    },
  )
  const canApprove = !term || (viewed && (term === 'esign' ? !!signature.data : paperImage !== null))

  const candidates = useMemo(() => {
    const words = norm(request.name).split(/\s+/).filter((w) => w.length > 2)
    const q = norm(search)
    const score = (name: string) => words.filter((w) => norm(name).includes(w)).length
    return (students.data ?? [])
      .filter((s) => s.gym_id === request.gym_id && !s.profile_id && (!q || norm(s.name).includes(q)))
      .sort((a, b) => score(b.name) - score(a.name) || Number(b.active) - Number(a.active) || a.name.localeCompare(b.name, 'pt-BR'))
  }, [students.data, request, search])

  if (step === 'term') {
    return (
      <Sheet open onClose={() => setStep('pick')} title="Termo do responsável">
        <TermStep
          request={request}
          term={term}
          signature={signature.data ?? null}
          signatureLoading={signature.isPending && term === 'esign'}
          viewed={viewed}
          onViewed={() => setViewed(true)}
          paperImage={paperImage}
          onPaperImage={setPaperImage}
        />
        <div className="mt-4 space-y-2">
          <Button block size="lg" disabled={!canApprove} loading={approve.isPending} onPress={() => approve.mutate()}>
            {choice === 'new' ? 'Cadastrar e aprovar aluno' : 'Aprovar aluno'}
          </Button>
          {!canApprove ? (
            <p className="text-center text-xs text-dim">
              {!viewed ? 'Abra o termo e confira antes de aprovar.' : 'Responda se o responsável autorizou.'}
            </p>
          ) : null}
          <Button variant="plain" block onPress={() => setStep('pick')}>Fechar</Button>
        </div>
      </Sheet>
    )
  }

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
      <Button
        block
        size="lg"
        className="mt-4"
        disabled={!choice}
        loading={approve.isPending}
        onPress={() => (request.minor ? setStep('term') : approve.mutate())}
      >
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

function rankLabel(r: StudentRequest): string {
  if (!r.rank_name) return 'Sem graduação'
  const track = r.rank_track === 'infantil' ? ' (infantil)' : ''
  return `${r.rank_name}${track}${r.graduated_at ? ` · desde ${formatDateBR(r.graduated_at)}` : ''}`
}

/** Etapa do termo na aprovação do aluno menor: aviso, abrir o termo (PDF ou arquivo) e as respostas do responsável. */
function TermStep({ request, term, signature, signatureLoading, viewed, onViewed, paperImage, onPaperImage }: {
  request: StudentRequest
  term: 'esign' | 'file' | null
  signature: Awaited<ReturnType<typeof getGuardianSignature>>
  signatureLoading: boolean
  viewed: boolean
  onViewed: () => void
  paperImage: boolean | null
  onPaperImage: (v: boolean) => void
}) {
  const first = request.name.split(/\s+/)[0]
  const file = useOpenGuardianFile()
  const [opening, setOpening] = useState(false)

  async function open() {
    if (term === 'file' && request.guardian_file_path) {
      if (await file.open(request.guardian_file_path)) onViewed()
      return
    }
    setOpening(true)
    try {
      await openSignedGuardianTerm({ requestId: request.id }, request.name)
      onViewed()
    } catch (error) {
      toastError(error)
    } finally {
      setOpening(false)
    }
  }

  if (!term) {
    return (
      <div className="space-y-3">
        <div className="flex items-start gap-3 rounded-lg border border-warning p-3">
          <FileSignature className="mt-0.5 size-5 shrink-0 text-warning" />
          <p className="text-sm text-text">
            {first} é menor de idade e o termo do responsável não veio no cadastro. Você pode aprovar: o termo fica pendente e o
            uso de imagem e o reconhecimento facial ficam desligados até ele ser enviado e aprovado.
          </p>
        </div>
      </div>
    )
  }

  const yesNo = (v: boolean | undefined) => (v ? 'Autorizou' : 'Não autorizou')
  return (
    <div className="space-y-3">
      <div className="flex items-start gap-3 rounded-lg border border-warning p-3">
        <FileSignature className="mt-0.5 size-5 shrink-0 text-warning" />
        <p className="text-sm text-text">
          {first} é menor de idade. Antes de aprovar, você precisa abrir e conferir o termo de autorização
          {term === 'esign' ? ' que o responsável assinou na tela, no cadastro.' : ' assinado pelo responsável, enviado no cadastro.'}
        </p>
      </div>

      <Button variant={viewed ? 'ghost' : 'gold'} block loading={opening || file.opening} onPress={() => void open()}>
        <Eye className="size-4" /> {viewed ? 'Abrir o termo de novo' : 'Abrir termo'}
      </Button>
      {viewed ? <p className="flex items-center justify-center gap-1.5 text-xs text-success"><Check className="size-3.5" /> Termo aberto</p> : null}

      {term === 'esign' ? (
        signatureLoading ? (
          <Loading />
        ) : signature ? (
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded border border-line p-3 text-sm">
            <dt className="text-dim">Responsável</dt>
            <dd className="min-w-0 text-text">{signature.guardian_name} ({signature.guardian_relationship})</dd>
            <dt className="text-dim">CPF</dt>
            <dd className="text-text">{maskCpf(signature.guardian_cpf)}</dd>
            <dt className="text-dim">Uso de imagem</dt>
            <dd className={signature.image_authorized ? 'text-success' : 'text-danger'}>{yesNo(signature.image_authorized)}</dd>
            <dt className="text-dim">Reconhecimento</dt>
            <dd className={signature.face_authorized ? 'text-success' : 'text-danger'}>{yesNo(signature.face_authorized)}</dd>
            <dt className="text-dim">Assinado</dt>
            <dd className="min-w-0 text-text">{formatDateTimeBR(signature.signed_at)}, {signature.signed_place}</dd>
          </dl>
        ) : (
          <p className="text-sm text-danger">Não foi possível carregar o termo. Confira a internet.</p>
        )
      ) : (
        <div>
          <p className="text-sm text-text">O responsável autorizou uso de imagem e reconhecimento facial?</p>
          <p className="text-xs text-dim">Marque Sim só se ele marcou Sim nas duas linhas do termo.</p>
          <div className="mt-2 flex gap-2">
            <Chip active={paperImage === true} onPress={() => onPaperImage(true)}>Sim</Chip>
            <Chip active={paperImage === false} onPress={() => onPaperImage(false)}>Não</Chip>
          </div>
        </div>
      )}
      <p className="text-xs text-dim">Aprovando aqui, o aluno e o termo saem aprovados juntos.</p>
    </div>
  )
}
