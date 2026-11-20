import { guardianTermFileName } from '@kog/core'
import { db } from './supabase'

/**
 * Gera o termo do responsável no servidor (/api/termo-responsavel) e baixa o PDF. Exige conexão.
 * Para a conta do aluno, o servidor usa o nome e o nascimento do cadastro dele (os enviados são ignorados).
 */
export async function downloadGuardianTerm(input: { name: string; birthDate: string }): Promise<void> {
  const { data } = await db().auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('Entre na sua conta.')
  const res = await fetch('/api/termo-responsavel', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ name: input.name, birthDate: input.birthDate }),
    cache: 'no-store',
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null
    throw new Error(body?.error ?? 'Não foi possível gerar o termo.')
  }
  const url = URL.createObjectURL(await res.blob())
  try {
    const a = document.createElement('a')
    a.href = url
    a.download = guardianTermFileName(input.name)
    document.body.appendChild(a)
    a.click()
    a.remove()
  } finally {
    // Dá tempo ao navegador de começar o download antes de liberar o arquivo.
    window.setTimeout(() => URL.revokeObjectURL(url), 30_000)
  }
}
