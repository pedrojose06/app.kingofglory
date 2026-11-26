import { describe, expect, it } from 'vitest'
import { minutesSinceClassStart } from './dates'

describe('minutesSinceClassStart', () => {
  // 25/11/2026 21:10 em São Paulo (UTC-3) = 26/11 00:10 UTC.
  const now = new Date('2026-11-26T00:10:00Z')

  it('conta pelo relógio de São Paulo, inclusive virando o dia em UTC', () => {
    expect(minutesSinceClassStart('2026-11-25', '19:30:00', now)).toBe(100)
    expect(minutesSinceClassStart('2026-11-25', '20:10', now)).toBe(60)
  })

  it('é negativo antes da aula e funciona para dias anteriores', () => {
    expect(minutesSinceClassStart('2026-11-25', '22:00', now)).toBe(-50)
    expect(minutesSinceClassStart('2026-11-24', '21:10', now)).toBe(24 * 60)
  })

  it('sem horário não dá para saber', () => {
    expect(minutesSinceClassStart('2026-11-25', null, now)).toBeNull()
  })
})
