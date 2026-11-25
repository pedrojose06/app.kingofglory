// Check-ins dos apps parceiros (Gympass/Wellhub e TotalPass): rótulos e regras simples usadas na tela.
// As regras da aprovação automática ficam no banco (partner_checkin_receive).

import { TIME_ZONE, todayISO } from '../dates'

export type PartnerProvider = 'gympass' | 'totalpass'
export type PartnerCheckinStatus = 'pendente' | 'aprovado' | 'recusado' | 'erro'

export const PARTNER_PROVIDERS: readonly PartnerProvider[] = ['gympass', 'totalpass']

export const PARTNER_LABEL: Record<PartnerProvider, string> = { gympass: 'Gympass', totalpass: 'TotalPass' }

/** O que falta para cada parceiro funcionar de ponta a ponta. */
export const PARTNER_READY: Record<PartnerProvider, boolean> = { gympass: true, totalpass: false }

export const CHECKIN_STATUS_LABEL: Record<PartnerCheckinStatus, string> = {
  pendente: 'Pendente',
  aprovado: 'Aprovado',
  recusado: 'Recusado',
  erro: 'Erro na validação',
}

const timeFmt = new Intl.DateTimeFormat('pt-BR', { timeZone: TIME_ZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })

/** Dia ('YYYY-MM-DD') e hora ('HH:MM') de um instante em São Paulo. */
export function localDateTime(iso: string): { date: string; time: string } {
  const d = new Date(iso)
  return { date: todayISO(d), time: timeFmt.format(d) }
}

const minutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number)
  return (h ?? 0) * 60 + (m ?? 0)
}

/** Aula do dia do check-in com início mais perto do horário (para já vir escolhida na aprovação manual). */
export function nearestClass<T extends { id: string; date: string; start_time: string | null; status?: string }>(
  classes: readonly T[],
  checkedInAt: string,
): T | null {
  const { date, time } = localDateTime(checkedInAt)
  const at = minutes(time)
  let best: T | null = null
  let bestDiff = Infinity
  for (const c of classes) {
    if (c.date !== date || !c.start_time || c.status === 'cancelled') continue
    const diff = Math.abs(minutes(c.start_time) - at)
    if (diff < bestDiff) {
      best = c
      bestDiff = diff
    }
  }
  return best
}

/** Endereço do webhook a cadastrar no parceiro. */
export function partnerWebhookUrl(supabaseUrl: string, provider: PartnerProvider): string {
  return `${supabaseUrl.replace(/\/+$/, '')}/functions/v1/partner-checkins/${provider}`
}
