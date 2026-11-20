import { birthDateIssue, guardianTermFileName, isMinor, type Database } from '@kog/core'
import { createClient } from '@supabase/supabase-js'
import { buildGuardianTermPdf } from '@/lib/guardian-term-pdf'

// Termo do responsável (aluno menor de idade) em PDF, preenchido com nome e nascimento do aluno.
// POST (dados no corpo, não na URL nem nos logs de acesso), só para professor logado, sem cache em lugar nenhum.
// Nada é guardado: o PDF é gerado na memória e devolvido.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'no-store, private', 'X-Content-Type-Options': 'nosniff' }

function fail(status: number, message: string) {
  return Response.json({ error: message }, { status, headers: NO_STORE })
}

async function isInstructor(token: string): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  if (!url || !key) return false
  const sb = createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
  const user = await sb.auth.getUser(token)
  if (user.error || !user.data.user) return false
  const res = await sb.rpc('is_instructor')
  return res.data === true
}

export async function POST(request: Request) {
  const token = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1]
  if (!token) return fail(401, 'Entre na sua conta de professor.')
  if (!(await isInstructor(token).catch(() => false))) return fail(403, 'Só o professor pode gerar o termo.')

  let body: { name?: unknown; birthDate?: unknown }
  try {
    body = await request.json()
  } catch {
    return fail(400, 'Dados inválidos.')
  }
  const name = typeof body.name === 'string' ? body.name.trim().replace(/\s+/g, ' ') : ''
  const birthDate = typeof body.birthDate === 'string' ? body.birthDate : ''
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
