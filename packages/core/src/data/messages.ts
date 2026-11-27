// Mensagens padrão da academia (textos prontos para os grupos do WhatsApp).

import type { Db, Row } from '../types'
import { unwrap } from './util'

export type MessageTemplate = Row<'message_templates'>

export interface MessageTemplateInput {
  title: string
  body: string
  defaults: Record<string, string>
}

export async function listMessageTemplates(db: Db, gymId: string): Promise<MessageTemplate[]> {
  return unwrap(await db.from('message_templates').select('*').eq('gym_id', gymId).order('title'))
}

export async function saveMessageTemplate(db: Db, gymId: string, id: string | null, input: MessageTemplateInput): Promise<void> {
  if (id) unwrap(await db.from('message_templates').update(input).eq('id', id))
  else unwrap(await db.from('message_templates').insert({ ...input, gym_id: gymId }))
}

/** Guarda os valores usados no último envio como padrão do próximo. */
export async function saveMessageDefaults(db: Db, id: string, defaults: Record<string, string>): Promise<void> {
  unwrap(await db.from('message_templates').update({ defaults }).eq('id', id))
}

export async function deleteMessageTemplate(db: Db, id: string): Promise<void> {
  unwrap(await db.from('message_templates').delete().eq('id', id))
}
