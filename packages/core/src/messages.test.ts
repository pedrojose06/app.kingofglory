import { describe, expect, it } from 'vitest'
import { fillTemplate, isMoneyField, MESSAGE_TEMPLATE_EXAMPLE, missingFields, templateDefaults, templateFields, whatsappShareLink } from './domain/messages'

describe('mensagens padrão', () => {
  it('acha os campos na ordem, sem repetir', () => {
    expect(templateFields('📅 {Data} ⏰ {Horário} de novo {Data} { Tema }')).toEqual(['Data', 'Horário', 'Tema'])
    expect(templateFields('sem campos {} nem {\nquebra}')).toEqual([])
  })

  it('troca os campos pelos valores e mantém os vazios', () => {
    const body = '📅 {Data}\n💰 Valor: {Valor por aluno} por aluno'
    expect(fillTemplate(body, { Data: '20/11', 'Valor por aluno': 'R$ 15,00' })).toBe('📅 20/11\n💰 Valor: R$ 15,00 por aluno')
    expect(fillTemplate(body, { Data: ' ' })).toBe(body)
    expect(missingFields(body, { Data: '20/11' })).toEqual(['Valor por aluno'])
  })

  it('o exemplo do aulão já vem com todos os valores', () => {
    expect(templateFields(MESSAGE_TEMPLATE_EXAMPLE.body)).toEqual(['Data', 'Horário', 'Valor por aluno', 'Tema do aulão'])
    expect(missingFields(MESSAGE_TEMPLATE_EXAMPLE.body, MESSAGE_TEMPLATE_EXAMPLE.defaults)).toEqual([])
    expect(fillTemplate(MESSAGE_TEMPLATE_EXAMPLE.body, MESSAGE_TEMPLATE_EXAMPLE.defaults)).toContain('💰 Valor: R$ 15,00 por aluno')
  })

  it('reconhece campo de dinheiro e lê os padrões guardados', () => {
    expect(isMoneyField('Valor por aluno')).toBe(true)
    expect(isMoneyField('Data')).toBe(false)
    expect(templateDefaults({ a: 'x', b: 1 })).toEqual({ a: 'x' })
    expect(templateDefaults(null)).toEqual({})
    expect(whatsappShareLink('olá 🥊')).toBe('https://wa.me/?text=ol%C3%A1%20%F0%9F%A5%8A')
  })
})
