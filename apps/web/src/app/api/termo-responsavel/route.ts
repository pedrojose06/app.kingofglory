import { birthDateIssue, getGuardianSignature, guardianTermFileName, isMinor, type Database } from '@kog/core'
import { createClient } from '@supabase/supabase-js'
import { buildGuardianTermPdf } from '@/lib/guardian-term-pdf'

// Termo do responsável (aluno menor de idade) em PDF, preenchido com nome e nascimento do aluno.
// Termo assinado no app ({ signed: { token } } pelo responsável, ou { signed: { studentId } } pelo professor ou pela
// conta do aluno, com login): sai preenchido com as respostas, a assinatura e o registro da assinatura eletrônica.
// POST (dados no corpo, não na URL nem nos logs de acesso), sem cache. Nada é guardado: o PDF é gerado na memória.
// Sem login (cadastro do aluno) ou professor: usa o nome e a data enviados. Conta de aluno: usa os dados do cadastro
// dele no banco (o corpo é ignorado).

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
function supabase(token?: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  if (!url || !key) return null
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    ...(token ? { global: { headers: { Authorization: `Bearer ${token}` } } } : {}),
  })
}

async function caller(token: string): Promise<Caller> {
  const sb = supabase(token)
  if (!sb) return null
  const user = await sb.auth.getUser(token)
  if (user.error || !user.data.user) return null
  if ((await sb.rpc('is_instructor')).data === true) return { kind: 'instructor' }
  const account = (await sb.rpc('my_student_account')).data as { name?: string; birth_date?: string | null } | null
  if (account?.name) return { kind: 'student', name: account.name, birthDate: account.birth_date ?? null }
  return null
}

/** PDF do termo assinado no app. O banco decide quem pode ver (link válido, professor do aluno ou a conta do aluno). */
async function signedPdf(token: string | undefined, signed: { token?: unknown; studentId?: unknown }): Promise<Response> {
  const by =
    typeof signed.token === 'string' && /^[a-f0-9]{64}$/.test(signed.token)
      ? { token: signed.token }
      : typeof signed.studentId === 'string' && token && /^[0-9a-f-]{36}$/i.test(signed.studentId)
        ? { studentId: signed.studentId }
        : null
  if (!by) return fail(400, 'Dados inválidos.')
  // Pelo link, sem login; pelo aluno, com a sessão de quem pede (o banco confere se é professor dele ou a conta dele).
  const sb = supabase('studentId' in by ? token : undefined)
  if (!sb) return fail(500, 'Servidor sem configuração.')
  const data = await getGuardianSignature(sb, by).catch(() => null)
  if (!data) return fail(404, 'Termo assinado não encontrado.')
  const pdf = await buildGuardianTermPdf({ studentName: data.student_name, birthDate: data.birth_date, signed: data })
  return new Response(new Blob([pdf as Uint8Array<ArrayBuffer>], { type: 'application/pdf' }), {
    headers: {
      ...NO_STORE,
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${guardianTermFileName(data.student_name).replace('.pdf', '-assinado.pdf')}"`,
    },
  })
}

export async function POST(request: Request) {
  const token = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1]
  // Termo assinado no app: lê o corpo antes (o resto da rota também usa o corpo).
  const raw = await request.text()
  let parsed: { name?: unknown; birthDate?: unknown; signed?: { token?: unknown; studentId?: unknown } } | null = null
  try {
    parsed = raw ? JSON.parse(raw) : null
  } catch {
    parsed = null
  }
  if (parsed?.signed && typeof parsed.signed === 'object') return signedPdf(token, parsed.signed)

  // O PDF só repete o que quem pede já sabe (nome e nascimento digitados), então o cadastro sem login também gera.
  const who = token ? await caller(token).catch(() => null) : null

  let name: string
  let birthDate: string
  if (who?.kind === 'student') {
    name = who.name.trim().replace(/\s+/g, ' ')
    birthDate = who.birthDate ?? ''
  } else {
    const body = parsed
    if (!body) return fail(400, 'Dados inválidos.')
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
