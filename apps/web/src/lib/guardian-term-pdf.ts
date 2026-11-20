import { formatDateBR, GUARDIAN_TERM } from '@kog/core'
import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from 'pdf-lib'

// Termo do responsável em PDF A4 de uma página, gerado no servidor com pdf-lib (sem serviço externo).
// O texto vem de GUARDIAN_TERM (@kog/core); aqui só o desenho. Fontes padrão do PDF (Helvetica, WinAnsi):
// cobrem o português, então nada de fonte embutida.

const A4: [number, number] = [595.28, 841.89]
const MARGIN = 56.7 // 2 cm
const CM = 28.35
const BLACK = rgb(0, 0, 0)
const BORDER = 0.75
const PAD_X = 6
const LINE = 1.3 // altura da linha = tamanho da fonte × LINE

interface Fonts {
  regular: PDFFont
  bold: PDFFont
}

/** Tira o que a Helvetica (WinAnsi) não desenha (ex.: emoji), para o nome não derrubar o PDF. */
function encodable(font: PDFFont, text: string): string {
  const supported = new Set(font.getCharacterSet())
  return [...text].filter((ch) => supported.has(ch.codePointAt(0)!)).join('').replace(/\s+/g, ' ').trim()
}

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const lines: string[] = []
  let line = ''
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word
    if (font.widthOfTextAtSize(next, size) <= width || !line) line = next
    else {
      lines.push(line)
      line = word
    }
  }
  if (line) lines.push(line)
  return lines.length ? lines : ['']
}

class Writer {
  y: number
  constructor(readonly page: PDFPage, readonly fonts: Fonts) {
    this.y = page.getHeight() - MARGIN
  }
  get width() {
    return this.page.getWidth() - 2 * MARGIN
  }

  paragraph(text: string, { size = 11, bold = false, center = false, after = 8 } = {}) {
    const font = bold ? this.fonts.bold : this.fonts.regular
    for (const line of wrap(text, font, size, this.width)) {
      this.y -= size
      const x = center ? MARGIN + (this.width - font.widthOfTextAtSize(line, size)) / 2 : MARGIN
      this.page.drawText(line, { x, y: this.y, size, font, color: BLACK })
      this.y -= size * (LINE - 1)
    }
    this.y -= after
  }

  /**
   * Tabela com bordas simples. `widths` em frações da largura útil; `align` por coluna; `heights` = altura mínima
   * de cada linha do corpo (para campos de preencher à mão). Cabeçalho em negrito.
   */
  table(columns: readonly string[], rows: readonly (readonly string[])[], opts: { widths: number[]; align?: ('left' | 'center')[]; heights?: number[]; size?: number }) {
    const size = opts.size ?? 10.5
    const xs = opts.widths.reduce<number[]>((acc, w) => [...acc, acc.at(-1)! + w * this.width], [MARGIN])
    const draw = (cells: readonly string[], font: PDFFont, minHeight: number) => {
      const wrapped = cells.map((c, i) => wrap(c, font, size, xs[i + 1]! - xs[i]! - 2 * PAD_X))
      const textHeight = Math.max(...wrapped.map((l) => l.length)) * size * LINE
      const height = Math.max(minHeight, textHeight + 2 * PAD_X)
      const top = this.y
      wrapped.forEach((lines, i) => {
        const x0 = xs[i]!
        const w = xs[i + 1]! - x0
        this.page.drawRectangle({ x: x0, y: top - height, width: w, height, borderColor: BLACK, borderWidth: BORDER })
        // Texto alinhado ao topo da célula (linha de assinatura fica livre embaixo).
        let ty = top - PAD_X - size
        for (const line of lines) {
          const tw = font.widthOfTextAtSize(line, size)
          const x = opts.align?.[i] === 'center' ? x0 + (w - tw) / 2 : x0 + PAD_X
          this.page.drawText(line, { x, y: ty, size, font, color: BLACK })
          ty -= size * LINE
        }
      })
      this.y -= height
    }
    draw(columns, this.fonts.bold, 0)
    rows.forEach((r, i) => draw(r, this.fonts.regular, opts.heights?.[i] ?? 0.85 * CM))
    this.y -= 14
  }
}

export interface GuardianTermData {
  studentName: string
  /** 'YYYY-MM-DD' */
  birthDate: string
}

export async function buildGuardianTermPdf({ studentName, birthDate }: GuardianTermData): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  // Metadados sem dado do aluno.
  doc.setTitle(GUARDIAN_TERM.title)
  doc.setLanguage('pt-BR')
  doc.setProducer('King of Glory')
  doc.setCreator('King of Glory')

  const fonts: Fonts = { regular: await doc.embedFont(StandardFonts.Helvetica), bold: await doc.embedFont(StandardFonts.HelveticaBold) }
  const w = new Writer(doc.addPage(A4), fonts)
  const t = GUARDIAN_TERM
  const name = encodable(fonts.regular, studentName.trim())

  w.paragraph(t.title, { size: 16, bold: true, center: true, after: 16 })
  w.paragraph(t.intro, { after: 14 })

  w.paragraph(t.identification.heading, { size: 12, bold: true, after: 6 })
  const filled = [name, formatDateBR(birthDate), '', '']
  w.table(t.identification.columns, t.identification.rows.map((label, i) => [label, filled[i]!]), { widths: [0.38, 0.62], heights: [0, 0, 0.95 * CM, 0.95 * CM] })

  w.paragraph(t.authorizations.heading, { size: 12, bold: true, after: 6 })
  w.table(
    t.authorizations.columns,
    t.authorizations.rows.map((label) => [label, t.authorizations.mark, t.authorizations.mark]),
    { widths: [0.72, 0.14, 0.14], align: ['left', 'center', 'center'] },
  )

  w.paragraph(t.revocation, { after: 14 })

  w.paragraph(t.signature.heading, { size: 12, bold: true, after: 6 })
  // Assinatura com cerca de 2 cm de altura.
  w.table(t.signature.columns, t.signature.rows.map((label) => [label, '']), { widths: [0.38, 0.62], heights: [1 * CM, 2 * CM] })

  return doc.save()
}
