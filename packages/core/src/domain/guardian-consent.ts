import { isMinor } from './age'

/** Bucket privado do termo assinado. Caminho: `{student_id}/{id}.{ext}`. */
export const GUARDIAN_CONSENT_BUCKET = 'guardian-consents'
export const GUARDIAN_CONSENT_MAX_BYTES = 10 * 1024 * 1024
/** Tipos aceitos → extensão do arquivo guardado. */
export const GUARDIAN_CONSENT_TYPES = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png' } as const
export type GuardianConsentMime = keyof typeof GUARDIAN_CONSENT_TYPES
/** Para o `accept` do campo de arquivo. */
export const GUARDIAN_CONSENT_ACCEPT = 'application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png'
/** URL assinada do termo: curta, só para abrir na hora. */
export const GUARDIAN_CONSENT_URL_SECONDS = 60

/** pendente = sem arquivo; em_analise = o aluno enviou e o professor confere; enviado = aprovado (vale). */
export type GuardianConsentStatus = 'pendente' | 'em_analise' | 'enviado'
export const GUARDIAN_CONSENT_LABEL: Record<GuardianConsentStatus, string> = {
  pendente: 'Termo pendente',
  em_analise: 'Termo para conferir',
  enviado: 'Termo aprovado',
}

const BY_EXTENSION: Record<string, GuardianConsentMime> = { pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png' }

/** Tipo do arquivo pelo MIME ou, se o aparelho não informar, pela extensão. null = não aceito. */
export function guardianConsentMime(file: { type: string; name?: string }): GuardianConsentMime | null {
  if (file.type in GUARDIAN_CONSENT_TYPES) return file.type as GuardianConsentMime
  if (file.type && file.type !== 'application/octet-stream') return null
  const ext = file.name?.split('.').pop()?.toLowerCase() ?? ''
  return BY_EXTENSION[ext] ?? null
}

/** Problema no arquivo do termo assinado, ou null se puder ser enviado. */
export function guardianConsentFileIssue(file: { type: string; size: number; name?: string }): string | null {
  if (!guardianConsentMime(file)) return 'Envie o termo em PDF, JPG ou PNG'
  if (file.size <= 0) return 'O arquivo está vazio'
  if (file.size > GUARDIAN_CONSENT_MAX_BYTES) return 'O arquivo passa de 10 MB'
  return null
}

export const guardianConsentPath = (studentId: string, fileId: string, mime: GuardianConsentMime) =>
  `${studentId}/${fileId}.${GUARDIAN_CONSENT_TYPES[mime]}`

/**
 * Situação do termo do responsável. `null` = não se aplica (maior de idade ou sem data de nascimento).
 * Menor sem registro no banco ainda conta como pendente (o banco cria a linha, mas o cache pode estar atrasado).
 */
export function guardianTermStatus(
  student: { birth_date: string | null },
  consent: { status: string } | null | undefined,
  today: string | Date = new Date(),
): GuardianConsentStatus | null {
  if (consent?.status === 'enviado') return 'enviado'
  if (!isMinor(student.birth_date, today)) return null
  return consent?.status === 'em_analise' ? 'em_analise' : 'pendente'
}

/** Conteúdo do termo em PDF (uma página A4). O web só desenha. */
export const GUARDIAN_TERM = {
  title: 'Termo de Autorização — Aluno Menor de Idade',
  intro: 'Sou o responsável legal pelo aluno menor de idade identificado abaixo. Recusar qualquer autorização não impede o aluno de treinar.',
  identification: {
    heading: 'Aluno e responsável',
    columns: ['Dado', 'Preenchimento'] as const,
    rows: ['Nome do aluno', 'Data de nascimento do aluno', 'Nome do responsável', 'CPF do responsável'] as const,
  },
  authorizations: {
    heading: 'Autorizações',
    columns: ['Autorizo', 'Sim', 'Não'] as const,
    rows: [
      'Uso da imagem do aluno em fotos e vídeos de treino',
      'Reconhecimento facial do aluno, apenas para marcar presença nas aulas',
    ] as const,
    mark: '( )',
  },
  revocation: 'Posso revogar qualquer autorização a qualquer momento, avisando o professor.',
  signature: {
    heading: 'Assinatura',
    columns: ['Campo', 'Preenchimento'] as const,
    rows: ['Local e data', 'Assinatura do responsável legal'] as const,
  },
} as const

/** Nome do arquivo baixado, ex.: termo-responsavel-joao-silva.pdf */
export function guardianTermFileName(studentName: string): string {
  const slug = studentName
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60)
  return `termo-responsavel${slug ? `-${slug}` : ''}.pdf`
}
