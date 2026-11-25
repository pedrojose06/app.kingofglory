import { describe, expect, it } from 'vitest'
import { assignGraduationFaces } from './domain/graduation-face'

const m = (student_id: string, cosine: number) => ({ student_id, cosine })

describe('graduação pelo rosto', () => {
  it('cada aluno vai para um rosto só, do par mais parecido para o menos', () => {
    const out = assignGraduationFaces([
      [m('ana', 0.6), m('bia', 0.5)],
      [m('ana', 0.7), m('bia', 0.55)],
    ])
    expect(out[1]?.match?.student_id).toBe('ana')
    expect(out[0]?.match?.student_id).toBe('bia')
    expect(out[0]?.alternatives.map((a) => a.student_id)).toEqual(['ana'])
  })

  it('rosto pouco parecido com todos fica sem sugestão', () => {
    const out = assignGraduationFaces([[m('ana', 0.2)], []])
    expect(out[0]?.match).toBeNull()
    expect(out[0]?.confidence).toBe(0)
    expect(out[0]?.alternatives).toHaveLength(1)
    expect(out[1]?.match).toBeNull()
  })
})
