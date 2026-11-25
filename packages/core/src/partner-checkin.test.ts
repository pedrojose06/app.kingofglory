import { describe, expect, it } from 'vitest'
import { localDateTime, nearestClass, partnerWebhookUrl } from './domain/partner-checkin'

describe('check-ins Gympass/TotalPass', () => {
  it('converte o horário para São Paulo', () => {
    expect(localDateTime('2026-12-01T21:40:00Z')).toEqual({ date: '2026-12-01', time: '18:40' })
    expect(localDateTime('2026-12-02T02:30:00Z')).toEqual({ date: '2026-12-01', time: '23:30' })
  })

  it('escolhe a aula do dia mais perto do check-in', () => {
    const classes = [
      { id: 'manha', date: '2026-12-01', start_time: '07:00:00' },
      { id: 'noite', date: '2026-12-01', start_time: '19:00:00' },
      { id: 'cancelada', date: '2026-12-01', start_time: '18:30:00', status: 'cancelled' },
      { id: 'outro-dia', date: '2026-12-02', start_time: '18:45:00' },
      { id: 'sem-hora', date: '2026-12-01', start_time: null },
    ]
    expect(nearestClass(classes, '2026-12-01T21:40:00Z')?.id).toBe('noite')
    expect(nearestClass(classes, '2026-12-01T09:00:00Z')?.id).toBe('manha')
    expect(nearestClass(classes, '2026-12-05T21:40:00Z')).toBeNull()
  })

  it('monta o endereço do webhook', () => {
    expect(partnerWebhookUrl('https://abc.supabase.co/', 'gympass')).toBe('https://abc.supabase.co/functions/v1/partner-checkins/gympass')
  })
})
