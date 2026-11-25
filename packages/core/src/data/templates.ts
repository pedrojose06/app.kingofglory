import type { Json } from '../database.types'
import type { Db } from '../types'
import { unwrap } from './util'

/**
 * Modelo do plano de aula: o esqueleto com que todo plano novo (ainda sem texto) abre. Cada professor pode ter o
 * seu (`lesson_templates`, um por professor); sem modelo salvo vale o padrão da equipe abaixo.
 */

const heading = (text: string) => ({ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text }] })
const empty = { type: 'paragraph' }

/** Esqueleto padrão da equipe: títulos das seções com um parágrafo vazio para preencher em cada uma. */
export const DEFAULT_PLAN_TEMPLATE: Json = {
  type: 'doc',
  content: [
    heading('Objetivo da aula'), empty,
    heading('Aquecimento'), empty,
    heading('Técnica'), empty,
    heading('Combinações / drills'), empty,
    heading('Condicionamento / sparring'), empty,
    heading('Alongamento'), empty,
    heading('Observações'), empty,
  ],
}

export interface PlanTemplate {
  id: string
  content: Json
  updated_at: string
}

/** Modelo salvo do professor logado; null = usa o padrão da equipe. */
export async function getPlanTemplate(db: Db): Promise<PlanTemplate | null> {
  const rows = unwrap(
    await db.from('lesson_templates').select('id, content, updated_at').order('created_at').limit(1),
  )
  return rows[0] ?? null
}

export async function savePlanTemplate(db: Db, id: string | null, content: Json): Promise<void> {
  if (id) unwrap(await db.from('lesson_templates').update({ content: content ?? {} }).eq('id', id))
  else unwrap(await db.from('lesson_templates').insert({ title: 'Plano de aula', content: content ?? {} }))
}

/** Volta ao esqueleto padrão da equipe (apaga o modelo do professor). */
export async function resetPlanTemplate(db: Db): Promise<void> {
  const { data: session } = await db.auth.getSession()
  const userId = session.session?.user.id
  if (!userId) return
  unwrap(await db.from('lesson_templates').delete().eq('owner_id', userId))
}
