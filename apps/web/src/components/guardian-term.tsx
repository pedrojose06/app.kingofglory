'use client'

import {
  formatDateBR, GUARDIAN_CONSENT_ACCEPT, GUARDIAN_CONSENT_LABEL, guardianConsentFileIssue, guardianConsentUrl, guardianTermStatus, keys,
  reviewGuardianConsent, submitMyGuardianConsent, uploadGuardianConsent, type GuardianConsent, type GuardianConsentStatus, type GuardianReview,
  type MyStudentAccount, type Student,
} from '@kog/core'
import { Badge, Button, Card, Chip, Field, Sheet, Textarea } from '@kog/ui'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ChevronRight, Clock, Download, Eye, FileCheck2, FileSignature, FileUp, X } from 'lucide-react'
import { useMemo, useRef, useState, type ChangeEvent } from 'react'
import { Section } from '@/components/common'
import { downloadGuardianTerm } from '@/lib/guardian-term'
import { useGuardianConsents, useGyms, useSave, useStudents, useToday } from '@/lib/queries'
import { db } from '@/lib/supabase'
import { errorMessage, toast, toastError } from '@/lib/toast'

const TONE: Record<GuardianConsentStatus, 'success' | 'warning' | 'gold'> = { pendente: 'warning', em_analise: 'gold', enviado: 'success' }

export function GuardianTermBadge({ status }: { status: GuardianConsentStatus }) {
  return <Badge tone={TONE[status]}>{GUARDIAN_CONSENT_LABEL[status]}</Badge>
}

/** Situação do termo de cada aluno (id → status), para listas. Maior de idade ou sem data não aparece. */
export function useGuardianTermStatus() {
  const consents = useGuardianConsents()
  const today = useToday()
  const byStudent = new Map((consents.data ?? []).map((c) => [c.student_id, c]))
  return (s: Pick<Student, 'id' | 'birth_date'>) => guardianTermStatus(s, byStudent.get(s.id), today)
}

/** Termos enviados por alunos esperando o professor conferir (somam em Pendências). */
export function useGuardianReviews() {
  const consents = useGuardianConsents()
  const students = useStudents()
  const today = useToday()
  return useMemo(() => {
    const byId = new Map((students.data ?? []).map((s) => [s.id, s]))
    return (consents.data ?? []).flatMap((c) => {
      const student = byId.get(c.student_id)
      return student && guardianTermStatus(student, c, today) === 'em_analise' ? [{ student, consent: c }] : []
    })
  }, [consents.data, students.data, today])
}

function DownloadButton({ name, birthDate, block }: { name: string; birthDate: string; block?: boolean }) {
  const [busy, setBusy] = useState(false)
  return (
    <Button
      variant="ghost"
      size="sm"
      block={block}
      loading={busy}
      onPress={async () => {
        if (name.trim().length < 2) return toastError(new Error('Informe o nome do aluno primeiro'))
        setBusy(true)
        try {
          await downloadGuardianTerm({ name, birthDate })
        } catch (error) {
          toastError(error)
        } finally {
          setBusy(false)
        }
      }}
    >
      <Download className="size-4" /> Baixar termo
    </Button>
  )
}

/** Escolha do arquivo do termo assinado, com a validação de tipo e tamanho antes de enviar. */
function FilePicker({ file, onChange, label }: { file: File | null; onChange: (file: File | null) => void; label: string }) {
  const inputRef = useRef<HTMLInputElement>(null)
  function onFile(e: ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files?.[0] ?? null
    e.target.value = ''
    if (!picked) return
    const issue = guardianConsentFileIssue(picked)
    if (issue) return toastError(new Error(issue))
    onChange(picked)
  }
  return (
    <>
      <input ref={inputRef} type="file" accept={GUARDIAN_CONSENT_ACCEPT} hidden onChange={onFile} />
      {file ? (
        <div className="flex items-center gap-2 rounded border border-success px-3 py-2 text-sm">
          <FileCheck2 className="size-4 shrink-0 text-success" />
          <span className="min-w-0 flex-1 truncate text-text">{file.name}</span>
          <span className="shrink-0 text-xs text-dim">{(file.size / 1024 / 1024).toFixed(1)} MB</span>
          <button type="button" aria-label="Tirar arquivo" className="p-1 text-dim" onClick={() => onChange(null)}><X className="size-4" /></button>
        </div>
      ) : (
        <Button variant="ghost" size="sm" block onPress={() => inputRef.current?.click()}>
          <FileUp className="size-4" /> {label}
        </Button>
      )}
    </>
  )
}

/** Abre o arquivo do termo por URL assinada de curta duração. */
function useOpenGuardianFile() {
  const [opening, setOpening] = useState(false)
  async function open(path: string) {
    // Abre a aba antes do await: no iPhone, window.open depois de uma espera é bloqueado.
    const tab = window.open('', '_blank')
    setOpening(true)
    try {
      const url = await guardianConsentUrl(db(), path)
      if (tab) tab.location.href = url
      else window.location.href = url
    } catch (error) {
      tab?.close()
      toastError(error)
    } finally {
      setOpening(false)
    }
  }
  return { open, opening }
}

/**
 * Etapa extra do cadastro quando o aluno é menor de 18 anos: baixar o termo preenchido e, se já tiver, anexar o
 * termo assinado. O arquivo só sobe ao salvar o aluno; sem ele o cadastro fica com "Termo pendente".
 */
export function GuardianTermStep({ name, birthDate, file, onFileChange }: {
  name: string
  birthDate: string
  file: File | null
  onFileChange: (file: File | null) => void
}) {
  return (
    <Card className="space-y-3 border-warning p-3">
      <div>
        <p className="text-sm font-bold text-text">Aluno menor de idade: termo do responsável</p>
        <p className="mt-1 text-xs text-dim">
          Baixe o termo já preenchido, peça ao responsável para assinar e envie aqui (PDF, JPG ou PNG, até 10 MB).
          Dá para salvar sem o termo: o aluno fica com "Termo pendente" e você envia depois, na ficha, ou o próprio aluno
          envia pela conta dele. Uso de imagem e reconhecimento facial só valem com o termo aprovado.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <DownloadButton name={name} birthDate={birthDate} block />
        {file ? null : <FilePicker file={null} onChange={onFileChange} label="Enviar assinado" />}
      </div>
      {file ? <FilePicker file={file} onChange={onFileChange} label="Enviar assinado" /> : null}
    </Card>
  )
}

/** Conferência do termo enviado pelo aluno: ver o arquivo, aprovar (com a resposta do responsável) ou recusar. */
export function GuardianReviewSheet({ student, consent, open, onClose }: {
  student: Student
  consent: GuardianConsent
  open: boolean
  onClose: () => void
}) {
  const file = useOpenGuardianFile()
  const [image, setImage] = useState<boolean | null>(null)
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState('')
  const review = useSave(
    (r: GuardianReview) => reviewGuardianConsent(db(), student.id, r),
    [keys.guardianConsents, keys.students],
    () => {
      onClose()
      setImage(null)
      setRejecting(false)
      setReason('')
    },
  )
  const send = (r: GuardianReview) =>
    review.mutate(r, { onSuccess: () => toast(r.approve ? 'Termo aprovado' : 'Termo recusado: o aluno vai ver o motivo') })

  return (
    <Sheet open={open} onClose={onClose} title="Conferir termo">
      <div className="space-y-4">
        <div>
          <p className="font-bold text-text">{student.name}</p>
          <p className="text-xs text-dim">
            {student.birth_date ? `Nascimento ${formatDateBR(student.birth_date)} · ` : ''}
            {consent.uploaded_at ? `enviado em ${formatDateBR(consent.uploaded_at.slice(0, 10))}` : ''}
          </p>
        </div>
        {consent.file_path ? (
          <Button variant="ghost" block loading={file.opening} onPress={() => file.open(consent.file_path!)}>
            <Eye className="size-4" /> Ver termo enviado
          </Button>
        ) : null}
        <p className="text-sm text-soft">
          Confira se é o termo do aluno, se tem nome e CPF do responsável, local e data e a assinatura.
        </p>

        {!rejecting ? (
          <>
            <Field label="O responsável autorizou uso de imagem e reconhecimento facial?" hint="Marque Sim só se ele marcou Sim nas duas linhas do termo.">
              <div className="flex gap-2">
                <Chip active={image === true} onPress={() => setImage(true)}>Sim</Chip>
                <Chip active={image === false} onPress={() => setImage(false)}>Não</Chip>
              </div>
            </Field>
            <Button block disabled={image === null} loading={review.isPending} onPress={() => send({ approve: true, imageConsent: image === true })}>
              Aprovar termo
            </Button>
            <Button variant="plain" block onPress={() => setRejecting(true)}>Recusar termo</Button>
          </>
        ) : (
          <>
            <Field label="O que o aluno precisa corrigir?" hint="O aluno vê esta mensagem e envia outro arquivo.">
              <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex.: falta a assinatura do responsável" />
            </Field>
            <Button variant="danger" block disabled={!reason.trim()} loading={review.isPending} onPress={() => send({ approve: false, reason })}>
              Recusar termo
            </Button>
            <Button variant="plain" block onPress={() => setRejecting(false)}>Voltar</Button>
          </>
        )}
      </div>
    </Sheet>
  )
}

/** Pendências: termos enviados pelos alunos esperando conferência. */
export function GuardianReviewsSection() {
  const reviews = useGuardianReviews()
  const gyms = useGyms()
  const [open, setOpen] = useState<string | null>(null)
  if (reviews.length === 0) return null
  const current = reviews.find((r) => r.student.id === open)
  return (
    <Section title={reviews.length === 1 ? '1 termo do responsável para conferir' : `${reviews.length} termos do responsável para conferir`}>
      <div className="space-y-2">
        {reviews.map(({ student, consent }) => (
          <button key={student.id} type="button" onClick={() => setOpen(student.id)} className="block w-full text-left">
            <Card className="flex items-center gap-3 p-3 active:bg-tint">
              <FileSignature className="size-5 shrink-0 text-accent" />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-bold text-text">{student.name}</span>
                <span className="block truncate text-xs text-dim">
                  {gyms.data?.find((g) => g.id === student.gym_id)?.name ?? 'Academia'}
                  {consent.uploaded_at ? ` · enviado em ${formatDateBR(consent.uploaded_at.slice(0, 10))}` : ''}
                </span>
              </span>
              <ChevronRight className="size-4 shrink-0 text-faint" />
            </Card>
          </button>
        ))}
      </div>
      {current ? <GuardianReviewSheet student={current.student} consent={current.consent} open onClose={() => setOpen(null)} /> : null}
    </Section>
  )
}

/** Card na ficha do aluno menor: situação do termo, baixar, ver (URL assinada curta), conferir e enviar/substituir. */
export function GuardianTermSection({ student, consent }: { student: Student; consent: GuardianConsent | undefined }) {
  const today = useToday()
  const status = guardianTermStatus(student, consent, today)
  const [file, setFile] = useState<File | null>(null)
  const [reviewOpen, setReviewOpen] = useState(false)
  const viewer = useOpenGuardianFile()
  const upload = useSave(
    (f: File) => uploadGuardianConsent(db(), { studentId: student.id, fileId: crypto.randomUUID(), file: f }),
    [keys.guardianConsents, keys.students],
    () => {
      setFile(null)
      toast('Termo enviado')
    },
  )
  if (!status) return null

  const text =
    status === 'enviado'
      ? `Termo aprovado${consent?.reviewed_at ? ` em ${formatDateBR(consent.reviewed_at.slice(0, 10))}` : ''}. O uso de imagem vale só se o responsável autorizou (marcado abaixo, em Cadastro).`
      : status === 'em_analise'
        ? `O aluno enviou o termo assinado${consent?.uploaded_at ? ` em ${formatDateBR(consent.uploaded_at.slice(0, 10))}` : ''}. Confira e aprove ou recuse.`
        : `Aluno menor de 18 anos sem o termo aprovado. Ele treina normalmente; uso de imagem e reconhecimento facial ficam desligados até a aprovação.${consent?.rejected_reason ? ` Último envio recusado: "${consent.rejected_reason}".` : ''}`

  return (
    <Section title="Termo do responsável" action={<GuardianTermBadge status={status} />}>
      <Card className="space-y-3 p-3">
        <p className="text-sm text-soft">{text}</p>
        {status === 'em_analise' && consent ? (
          <Button block onPress={() => setReviewOpen(true)}><FileSignature className="size-4" /> Conferir termo</Button>
        ) : null}
        <div className="grid grid-cols-2 gap-2">
          {student.birth_date ? <DownloadButton name={student.name} birthDate={student.birth_date} block /> : null}
          {status !== 'pendente' && consent?.file_path ? (
            <Button variant="ghost" size="sm" block loading={viewer.opening} onPress={() => viewer.open(consent.file_path!)}>
              <Eye className="size-4" /> Ver termo
            </Button>
          ) : null}
        </div>
        <FilePicker file={file} onChange={setFile} label={status === 'pendente' ? 'Enviar termo assinado' : 'Substituir termo'} />
        {file ? (
          <Button block loading={upload.isPending} onPress={() => upload.mutate(file)}>Enviar (já aprovado)</Button>
        ) : null}
        <p className="text-xs text-dim">O arquivo fica em área privada; o link para ver vale 1 minuto e só para professores do aluno.</p>
      </Card>
      {status === 'em_analise' && consent ? (
        <GuardianReviewSheet student={student} consent={consent} open={reviewOpen} onClose={() => setReviewOpen(false)} />
      ) : null}
    </Section>
  )
}

/**
 * Conta do aluno menor sem o termo aprovado: baixar o termo, enviar o assinado e acompanhar a conferência do
 * professor. Com o termo aprovado, a conta segue para o aceite normal.
 */
export function StudentGuardianScreen({ account, onSignOut }: { account: MyStudentAccount; onSignOut: () => void }) {
  const queryClient = useQueryClient()
  const [file, setFile] = useState<File | null>(null)
  const first = account.name.trim().split(/\s+/)[0]
  const consent = account.guardian_consent
  const status = consent?.status
  const submit = useMutation({
    mutationFn: (f: File) => submitMyGuardianConsent(db(), { studentId: account.student_id, fileId: crypto.randomUUID(), file: f }),
    networkMode: 'online',
    onSuccess: async () => {
      setFile(null)
      await queryClient.invalidateQueries({ queryKey: keys.myStudentAccount })
    },
  })

  if (status === 'enviado' && !account.image_consent_at) {
    return (
      <Card className="p-4">
        <FileSignature className="size-8 text-accent" />
        <p className="mt-3 font-display text-2xl uppercase tracking-[0.02em] text-text">Termo aprovado</p>
        <p className="mt-2 text-sm text-soft">
          Seu professor conferiu o termo. Seu responsável não autorizou o uso de imagem, então a conta no app não fica
          disponível. Você continua treinando normalmente; para ver suas presenças, peça um link ao professor.
        </p>
        <Button variant="plain" block className="mt-3" onPress={onSignOut}>Sair</Button>
      </Card>
    )
  }

  return (
    <Card className="p-4">
      <FileSignature className="size-8 text-accent" />
      <p className="mt-3 font-display text-2xl uppercase tracking-[0.02em] text-text">Autorização do responsável</p>
      <p className="mt-2 text-sm text-soft">
        Oi, {first}! Como você é menor de 18 anos, para usar a conta no app seu responsável precisa assinar o termo de
        autorização. Você continua treinando normalmente enquanto isso.
      </p>

      {status === 'em_analise' ? (
        <div className="mt-4 flex items-start gap-3 rounded-lg border border-line p-3">
          <Clock className="mt-0.5 size-5 shrink-0 text-accent" />
          <div className="text-sm">
            <p className="font-bold text-text">Termo enviado{consent?.uploaded_at ? ` em ${formatDateBR(consent.uploaded_at.slice(0, 10))}` : ''}</p>
            <p className="text-soft">Aguardando o professor conferir. Quando ele aprovar, é só abrir o app de novo.</p>
          </div>
        </div>
      ) : consent?.rejected_reason ? (
        <div className="mt-4 rounded-lg border border-danger p-3 text-sm">
          <p className="font-bold text-danger">O professor pediu para corrigir o termo</p>
          <p className="mt-1 text-text">"{consent.rejected_reason}"</p>
          <p className="mt-1 text-soft">Envie o termo de novo, corrigido.</p>
        </div>
      ) : null}

      <ol className="mt-4 list-decimal space-y-1 pl-5 text-sm text-soft">
        <li>Baixe o termo (já vem com seu nome e data de nascimento).</li>
        <li>Imprima e peça ao seu responsável para preencher e assinar.</li>
        <li>Tire uma foto bem nítida do termo assinado (ou escaneie em PDF) e envie aqui.</li>
      </ol>

      <div className="mt-4 space-y-2">
        <DownloadButton name={account.name} birthDate={account.birth_date ?? ''} block />
        <FilePicker file={file} onChange={setFile} label={status === 'em_analise' ? 'Enviar outro arquivo' : 'Escolher termo assinado'} />
        {file ? (
          <Button block loading={submit.isPending} onPress={() => submit.mutate(file)}>Enviar termo</Button>
        ) : null}
        <p className="text-xs text-dim">PDF, JPG ou PNG, até 10 MB. Só os seus professores veem o arquivo.</p>
        {submit.isError ? <p className="text-sm text-danger">{errorMessage(submit.error)}</p> : null}
      </div>

      <Button variant="plain" block className="mt-3" onPress={onSignOut}>Sair</Button>
    </Card>
  )
}
