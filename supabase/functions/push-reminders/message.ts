// Texto da notificação. Sem dependências, para poder ser testado fora do Deno.

export interface OpenClass {
  start_time: string | null
  title: string
  gym: string
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
