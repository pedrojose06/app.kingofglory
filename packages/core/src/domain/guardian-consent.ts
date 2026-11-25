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

// ── Assinatura eletrônica no app ──────────────────────────────────────────────

/**
 * Versão do texto do termo (GUARDIAN_TERM). Fica gravada com cada assinatura e entra no código de verificação:
 * mudou o texto, mude a versão.
 */
export const GUARDIAN_TERM_VERSION = '2026-11-25'
/** Página pública em que o responsável assina (o código vai no #, que não chega ao servidor nem aos logs). */
export const GUARDIAN_SIGN_PATH = '/termo'
export const guardianSignUrl = (origin: string, token: string) => `${origin}${GUARDIAN_SIGN_PATH}#${token}`

export const GUARDIAN_RELATIONSHIPS = ['Mãe', 'Pai', 'Avó', 'Avô', 'Tutor legal'] as const

/** Texto da declaração que o responsável marca antes de assinar. */
export const GUARDIAN_SIGN_DECLARATION =
  'Declaro que sou o responsável legal pelo aluno, que as informações acima são verdadeiras e que concordo em assinar este termo eletronicamente.'

/** Só os dígitos do CPF. */
export const cpfDigits = (cpf: string) => cpf.replace(/\D/g, '')

/** CPF com os dois dígitos verificadores certos (e não todos iguais). Mesma regra de public.is_valid_cpf. */
export function isValidCpf(cpf: string): boolean {
  const d = cpfDigits(cpf)
  if (!/^\d{11}$/.test(d) || /^(\d)\1{10}$/.test(d)) return false
  const nums = [...d].map(Number)
  const check = (len: number) => {
    let sum = 0
    for (let i = 0; i < len; i++) sum += nums[i]! * (len + 1 - i)
    const r = (sum * 10) % 11
    return r === 10 ? 0 : r
  }
  return check(9) === nums[9] && check(10) === nums[10]
}

/** Máscara enquanto digita: 000.000.000-00. */
export function formatCpf(cpf: string): string {
  const d = cpfDigits(cpf).slice(0, 11)
  return d
    .replace(/^(\d{3})(\d)/, '$1.$2')
    .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d{1,2})$/, '.$1-$2')
}

/** CPF parcialmente escondido para telas (o PDF mostra inteiro): ***.982.247-** */
export function maskCpf(cpf: string): string {
  const d = cpfDigits(cpf)
  return d.length === 11 ? `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**` : '***'
}

export interface GuardianSignForm {
  guardianName: string
  guardianCpf: string
  relationship: string
  image: boolean | null
  face: boolean | null
  place: string
  /** data:image/png;base64,... (vazio = não assinou) */
  signature: string
  declaration: boolean
}

/** Primeiro problema do formulário de assinatura, ou null. Mesmas regras de public.sign_guardian_term. */
export function guardianSignFormIssue(f: GuardianSignForm): string | null {
  const name = f.guardianName.trim().replace(/\s+/g, ' ')
  if (name.length < 5 || name.length > 120 || !/\S+\s+\S+/.test(name)) return 'Informe o nome completo do responsável.'
  if (!isValidCpf(f.guardianCpf)) return 'CPF do responsável inválido.'
  const rel = f.relationship.trim()
  if (rel.length < 2 || rel.length > 40) return 'Informe o parentesco com o aluno.'
  if (f.image === null || f.face === null) return 'Responda às duas autorizações.'
  const place = f.place.trim()
  if (place.length < 2 || place.length > 80) return 'Informe a cidade.'
  if (!f.signature.startsWith('data:image/png;base64,')) return 'Assine no quadro antes de enviar.'
  if (!f.declaration) return 'Marque a declaração de responsável legal.'
  return null
}

/** Dados do termo assinado no app (o que o PDF mostra). */
export interface GuardianSignature {
  student_name: string
  birth_date: string
  gym_name: string
  status: GuardianConsentStatus
  signed_at: string
  guardian_name: string
  guardian_cpf: string
  guardian_relationship: string
  image_authorized: boolean
  face_authorized: boolean
  signed_place: string
  signature_png: string
  signed_ip: string | null
  signed_user_agent: string | null
  term_version: string
  document_sha256: string
}
