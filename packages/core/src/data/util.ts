import type { PostgrestError } from '@supabase/supabase-js'

/** Desembrulha a resposta do PostgREST, lançando o erro (o TanStack Query espera exceções). */
export function unwrap<T>(res: { data: T | null; error: PostgrestError | null }): T {
  if (res.error) throw res.error
  return res.data as T
}

const PAGE = 1000

/** O PostgREST limita a 1000 linhas por resposta; isto busca todas as páginas. */
export async function fetchAll<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: PostgrestError | null }>,
): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += PAGE) {
    const rows = unwrap(await page(from, from + PAGE - 1)) ?? []
    out.push(...rows)
    if (rows.length < PAGE) return out
  }
}

export function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}
