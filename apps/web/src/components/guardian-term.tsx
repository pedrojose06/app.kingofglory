'use client'

import {
  formatDateBR, GUARDIAN_CONSENT_ACCEPT, GUARDIAN_CONSENT_LABEL, guardianConsentFileIssue, guardianConsentUrl, guardianTermStatus, keys,
  uploadGuardianConsent, type GuardianConsent, type GuardianConsentStatus, type Student,
} from '@kog/core'
import { Badge, Button, Card, cn } from '@kog/ui'
import { Download, Eye, FileCheck2, FileUp, X } from 'lucide-react'
import { useRef, useState, type ChangeEvent } from 'react'
import { Section } from '@/components/common'
import { downloadGuardianTerm } from '@/lib/guardian-term'
import { useGuardianConsents, useSave, useToday } from '@/lib/queries'
import { db } from '@/lib/supabase'
import { toast, toastError } from '@/lib/toast'

export function GuardianTermBadge({ status }: { status: GuardianConsentStatus }) {
  return <Badge tone={status === 'enviado' ? 'success' : 'warning'}>{GUARDIAN_CONSENT_LABEL[status]}</Badge>
}

/** Situação do termo de cada aluno (id → status), para listas. Maior de idade ou sem data não aparece. */
export function useGuardianTermStatus() {
  const consents = useGuardianConsents()
  const today = useToday()
  const byStudent = new Map((consents.data ?? []).map((c) => [c.student_id, c]))
  return (s: Pick<Student, 'id' | 'birth_date'>) => guardianTermStatus(s, byStudent.get(s.id), today)
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
          Dá para salvar sem o termo: o aluno fica com "Termo pendente" e você envia depois, na ficha. Uso de imagem e
          reconhecimento facial só valem com o termo enviado.
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

/** Card na ficha do aluno menor: situação do termo, baixar, ver (URL assinada curta) e enviar/substituir. */
export function GuardianTermSection({ student, consent }: { student: Student; consent: GuardianConsent | undefined }) {
  const today = useToday()
  const status = guardianTermStatus(student, consent, today)
  const [file, setFile] = useState<File | null>(null)
  const [opening, setOpening] = useState(false)
  const upload = useSave(
    (f: File) => uploadGuardianConsent(db(), { studentId: student.id, fileId: crypto.randomUUID(), file: f }),
    [keys.guardianConsents, keys.students],
    () => {
      setFile(null)
      toast('Termo enviado')
    },
  )
  if (!status) return null

  async function view(path: string) {
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

  return (
    <Section title="Termo do responsável" action={<GuardianTermBadge status={status} />}>
      <Card className="space-y-3 p-3">
        <p className="text-sm text-soft">
          {status === 'enviado' && consent?.uploaded_at
            ? `Termo assinado enviado em ${formatDateBR(consent.uploaded_at.slice(0, 10))}. Marque abaixo o uso de imagem só se o responsável autorizou no termo.`
            : 'Aluno menor de 18 anos sem o termo assinado. Ele treina normalmente; uso de imagem e reconhecimento facial ficam desligados até o envio.'}
        </p>
        <div className="grid grid-cols-2 gap-2">
          {student.birth_date ? <DownloadButton name={student.name} birthDate={student.birth_date} block /> : null}
          {status === 'enviado' && consent?.file_path ? (
            <Button variant="ghost" size="sm" block loading={opening} onPress={() => view(consent.file_path!)}>
              <Eye className="size-4" /> Ver termo
            </Button>
          ) : null}
        </div>
        <FilePicker file={file} onChange={setFile} label={status === 'enviado' ? 'Substituir termo' : 'Enviar termo assinado'} />
        {file ? (
          <Button block loading={upload.isPending} onPress={() => upload.mutate(file)}>Enviar</Button>
        ) : null}
        <p className={cn('text-xs text-dim')}>O arquivo fica em área privada; o link para ver vale 1 minuto e só para professores do aluno.</p>
      </Card>
    </Section>
  )
}
