// Texto da notificação. Sem dependências, para poder ser testado fora do Deno.

export interface OpenClass {
  start_time: string | null
  title: string
  gym: string
}

export interface PlanClass extends OpenClass {
  /** Nulo quando a aula da grade ainda não foi gerada (o app não foi aberto hoje). */
  class_id: string | null
}

export interface PushMessage {
  title: string
  body: string
  url: string
  tag: string
}

const label = (c: OpenClass) => [c.start_time, c.gym].filter(Boolean).join(' ')

function joinList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? ''
  return `${items.slice(0, -1).join(', ')} e ${items[items.length - 1]}`
}

/** Um aviso por lembrete; a tag faz um novo aviso do mesmo lembrete substituir o anterior. */
export function reminderMessage(reminderId: string, classes: OpenClass[]): PushMessage {
  const one = classes.length === 1
  return {
    title: one ? 'Falta fazer a chamada' : `Falta fazer ${classes.length} chamadas`,
    body: one
      ? `A aula de hoje (${label(classes[0]!)}) ainda está sem chamada.`
      : `Aulas de hoje sem chamada: ${joinList(classes.map(label))}.`,
    url: '/',
    tag: `kog-reminder-${reminderId}`,
  }
}

/** Lembrete do plano de aula: um aviso por professor por dia; tocar abre o plano (uma aula) ou a tela Hoje. */
export function lessonPlanMessage(profileId: string, classes: PlanClass[]): PushMessage {
  const one = classes.length === 1
  const only = one ? classes[0]! : null
  return {
    title: one ? 'Falta o plano de aula' : `Faltam ${classes.length} planos de aula`,
    body: only
      ? `Faça e envie o plano da aula de hoje (${label(only)}).`
      : `Aulas de hoje sem plano: ${joinList(classes.map(label))}.`,
    url: only?.class_id ? `/aula?id=${only.class_id}&aba=plano` : '/',
    tag: `kog-plan-${profileId}`,
  }
}

export interface PlanReview {
  class_id: string
  /** YYYY-MM-DD */
  date: string
  start_time: string | null
  gym: string
  status: 'approved' | 'changes_requested'
  note: string | null
  reviewer_name: string | null
}

const shortDate = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`
const clip = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s)

/** Revisão do mestre no plano compartilhado; tocar abre o plano da aula. */
export function planReviewMessage(r: PlanReview): PushMessage {
  const who = r.reviewer_name?.trim() || 'O mestre'
  const aula = [shortDate(r.date), r.start_time, r.gym].filter(Boolean).join(' ')
  const approved = r.status === 'approved'
  const note = r.note?.trim() ? `: “${clip(r.note.trim(), 140)}”` : '.'
  return {
    title: approved ? 'Plano de aula aprovado' : 'Ajustes no plano de aula',
    body: approved
      ? `${who} aprovou o plano da aula ${aula}${note}`
      : `${who} pediu ajustes no plano da aula ${aula}${note}`,
    url: `/aula?id=${r.class_id}&aba=plano`,
    tag: `kog-review-${r.class_id}`,
  }
}
