// Mensagens padrão da academia (grupos do WhatsApp). Regras puras (sem banco).
//
// O texto é fixo; os trechos que mudam a cada envio são campos entre chaves: {Data}, {Horário}, {Valor por aluno}.

/** Campo entre chaves: até 40 caracteres, sem chaves nem quebra de linha. */
const FIELD = /\{([^{}\n]{1,40})\}/g

/** Nomes dos campos do texto, na ordem em que aparecem (sem repetir). */
export function templateFields(body: string): string[] {
  const seen = new Set<string>()
  for (const m of body.matchAll(FIELD)) {
    const name = m[1]!.trim()
    if (name) seen.add(name)
  }
  return [...seen]
}

/** Monta a mensagem trocando cada campo pelo valor. Campo sem valor fica como está ({Data}) para chamar atenção. */
export function fillTemplate(body: string, values: Readonly<Record<string, string>>): string {
  return body.replace(FIELD, (whole, raw: string) => {
    const value = values[raw.trim()]?.trim()
    return value ? value : whole
  })
}

/** Campos do texto ainda sem valor. */
export function missingFields(body: string, values: Readonly<Record<string, string>>): string[] {
  return templateFields(body).filter((f) => !values[f]?.trim())
}

/** Campo de valor em dinheiro (o app mostra o campo em reais). */
export const isMoneyField = (name: string) => /valor|pre[çc]o|taxa|mensalidade/i.test(name)

/** Valores padrão guardados (jsonb) → só os textos. */
export function templateDefaults(defaults: unknown): Record<string, string> {
  if (!defaults || typeof defaults !== 'object' || Array.isArray(defaults)) return {}
  return Object.fromEntries(Object.entries(defaults).filter((e): e is [string, string] => typeof e[1] === 'string'))
}

/** Link que abre o WhatsApp com o texto pronto (a pessoa escolhe o grupo). */
export const whatsappShareLink = (text: string) => `https://wa.me/?text=${encodeURIComponent(text)}`

/** Mensagem de exemplo (aulão de graduação), para começar. */
export const MESSAGE_TEMPLATE_EXAMPLE = {
  title: 'Aulão de graduação',
  body: `🥊 *AULÃO DE GRADUAÇÃO – KING OF GLORY ACADEMY* 🥊

📅 {Data}
⏰ {Horário}
💰 Valor: {Valor por aluno} por aluno
Tema do aulão: {Tema do aulão}

⚠️ *ATENÇÃO, EQUIPE!*

Esse aulão será muito importante para todos que desejam graduar, pois tivemos mudanças significativas na nossa metodologia de ensino e precisamos alinhar e atualizar todos sobre essas alterações.

👊 Professores e instrutores: é fundamental a presença de vocês para aprenderem as atualizações e repassarem corretamente o conteúdo aos seus alunos.

🥋 Alunos que não irão graduar também são muito bem-vindos! Será uma excelente oportunidade para aprender, aprimorar as técnicas e acompanhar as mudanças da nossa metodologia.

Contamos com a presença e o comprometimento de todos para mantermos nossa equipe alinhada e fortalecermos cada vez mais o padrão de ensino da King of Glory Academy!`,
  defaults: {
    Data: 'Sexta-feira (feriado) 20/11',
    Horário: 'Das 08 às 10h',
    'Valor por aluno': 'R$ 15,00',
    'Tema do aulão': 'Clinch específico para cada graduação e escola de combate.',
  } as Record<string, string>,
}
