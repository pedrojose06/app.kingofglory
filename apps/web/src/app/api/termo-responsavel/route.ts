import { birthDateIssue, guardianTermFileName, isMinor, type Database } from '@kog/core'
import { createClient } from '@supabase/supabase-js'
import { buildGuardianTermPdf } from '@/lib/guardian-term-pdf'

// Termo do responsável (aluno menor de idade) em PDF, preenchido com nome e nascimento do aluno.
// POST (dados no corpo, não na URL nem nos logs de acesso), para professor ou para o próprio aluno logado, sem cache.
// Nada é guardado: o PDF é gerado na memória e devolvido.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'no-store, private', 'X-Content-Type-Options': 'nosniff' }

function fail(status: number, message: string) {
  return Response.json({ error: message }, { status, headers: NO_STORE })
}

type Caller = { kind: 'instructor' } | { kind: 'student'; name: string; birthDate: string | null } | null

/**
 * Quem pede o termo: professor (gera com os dados enviados) ou aluno logado (gera com os dados dele, do banco;
 * o corpo é ignorado, então um aluno não gera termo de outra pessoa).
 */
async function caller(token: string): Promise<Caller> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  if (!url || !key) return null
  const sb = createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
  const user = await sb.auth.getUser(token)
  if (user.error || !user.data.user) return null
  if ((await sb.rpc('is_instructor')).data === true) return { kind: 'instructor' }
  const account = (await sb.rpc('my_student_account')).data as { name?: string; birth_date?: string | null } | null
  if (account?.name) return { kind: 'student', name: account.name, birthDate: account.birth_date ?? null }
  return null
}

export async function POST(request: Request) {
  const token = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1]
  if (!token) return fail(401, 'Entre na sua conta.')
  const who = await caller(token).catch(() => null)
  if (!who) return fail(403, 'Só o professor ou o próprio aluno podem gerar o termo.')

  let name: string
  let birthDate: string
  if (who.kind === 'student') {
    name = who.name.trim().replace(/\s+/g, ' ')
    birthDate = who.birthDate ?? ''
  } else {
    let body: { name?: unknown; birthDate?: unknown }
    try {
      body = await request.json()
    } catch {
      return fail(400, 'Dados inválidos.')
    }
    name = typeof body.name === 'string' ? body.name.trim().replace(/\s+/g, ' ') : ''
    birthDate = typeof body.birthDate === 'string' ? body.birthDate : ''
  }
  if (name.length < 2 || name.length > 120) return fail(400, 'Informe o nome do aluno.')
  const issue = birthDateIssue(birthDate)
  if (issue) return fail(400, issue)
  if (!isMinor(birthDate)) return fail(400, 'O termo do responsável é só para aluno menor de 18 anos.')

  const pdf = await buildGuardianTermPdf({ studentName: name, birthDate })
  return new Response(new Blob([pdf as Uint8Array<ArrayBuffer>], { type: 'application/pdf' }), {
    headers: {
      ...NO_STORE,
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${guardianTermFileName(name)}"`,
    },
  })
}
