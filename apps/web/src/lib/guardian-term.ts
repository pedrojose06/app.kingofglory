import { guardianTermFileName, type GuardianSignatureRef } from '@kog/core'
import { db } from './supabase'

async function fetchTerm(body: unknown, withSession: boolean): Promise<Blob> {
  const token = withSession ? (await db().auth.getSession()).data.session?.access_token : undefined
  const res = await fetch('/api/termo-responsavel', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
    cache: 'no-store',
  })
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: string } | null
    throw new Error(data?.error ?? 'Não foi possível gerar o termo.')
  }
  return res.blob()
}

function save(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  try {
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    document.body.appendChild(a)
    a.click()
    a.remove()
  } finally {
    // Dá tempo ao navegador de começar o download antes de liberar o arquivo.
    window.setTimeout(() => URL.revokeObjectURL(url), 30_000)
  }
}

/**
 * Gera o termo do responsável no servidor (/api/termo-responsavel) e baixa o PDF. Exige conexão.
 * Funciona sem login (cadastro do aluno). Para a conta do aluno, o servidor usa o nome e o nascimento do cadastro dele.
 */
export async function downloadGuardianTerm(input: { name: string; birthDate: string }): Promise<void> {
  save(await fetchTerm({ name: input.name, birthDate: input.birthDate }, true), guardianTermFileName(input.name))
}

/**
 * Baixa o termo assinado no app (preenchido, com a assinatura e o registro). Pelo link do responsável (`token`) ou
 * pelo aluno (`studentId`, com a sessão do professor ou da conta do aluno).
 */
export async function downloadSignedGuardianTerm(by: GuardianSignatureRef, studentName: string): Promise<void> {
  const blob = await fetchTerm({ signed: by }, !('token' in by))
  save(blob, guardianTermFileName(studentName).replace('.pdf', '-assinado.pdf'))
}

/**
 * Abre o termo assinado no app numa aba nova (para o professor ler antes de aprovar). A aba abre antes da espera:
 * no iPhone, window.open depois de um await é bloqueado. No Android (o Chrome não mostra PDF numa aba) ou sem aba
 * (bloqueada), baixa o arquivo, que abre no leitor de PDF do aparelho.
 */
export async function openSignedGuardianTerm(by: { studentId: string } | { requestId: string }, studentName: string): Promise<void> {
  const android = /Android/i.test(navigator.userAgent)
  const tab = android ? null : window.open('', '_blank')
  try {
    const blob = await fetchTerm({ signed: by }, true)
    if (!tab) return save(blob, guardianTermFileName(studentName).replace('.pdf', '-assinado.pdf'))
    const url = URL.createObjectURL(blob)
    tab.location.href = url
    window.setTimeout(() => URL.revokeObjectURL(url), 5 * 60_000)
  } catch (error) {
    tab?.close()
    throw error
  }
}
