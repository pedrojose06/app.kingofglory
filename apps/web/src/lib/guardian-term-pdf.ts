import { formatCpf, formatDateBR, GUARDIAN_SIGN_DECLARATION, GUARDIAN_TERM, type GuardianSignature } from '@kog/core'
import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFImage, type PDFPage } from 'pdf-lib'

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
  table(
    columns: readonly string[],
    rows: readonly (readonly string[])[],
    opts: {
      widths: number[]
      align?: ('left' | 'center')[]
      heights?: number[]
      size?: number
      /** Imagem dentro de uma célula do corpo (ex.: a assinatura), centralizada e sem distorcer. */
      image?: { row: number; col: number; image: PDFImage }
    },
  ) {
    const size = opts.size ?? 10.5
    const xs = opts.widths.reduce<number[]>((acc, w) => [...acc, acc.at(-1)! + w * this.width], [MARGIN])
    const draw = (cells: readonly string[], font: PDFFont, minHeight: number, image?: { col: number; image: PDFImage }) => {
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
      if (image) {
        const x0 = xs[image.col]!
        const w = xs[image.col + 1]! - x0 - 2 * PAD_X
        const h = height - 2 * PAD_X
        const k = Math.min(w / image.image.width, h / image.image.height)
        const iw = image.image.width * k
        const ih = image.image.height * k
        this.page.drawImage(image.image, { x: x0 + PAD_X + (w - iw) / 2, y: top - height + PAD_X + (h - ih) / 2, width: iw, height: ih })
      }
      this.y -= height
    }
    draw(columns, this.fonts.bold, 0)
    rows.forEach((r, i) =>
      draw(r, this.fonts.regular, opts.heights?.[i] ?? 0.85 * CM, opts.image?.row === i ? opts.image : undefined),
    )
    this.y -= 14
  }
}

export interface GuardianTermData {
  studentName: string
  /** 'YYYY-MM-DD' */
  birthDate: string
  /** Termo assinado no app: sai preenchido, com a assinatura e o registro da assinatura eletrônica. */
  signed?: GuardianSignature
}

/** Data e hora de Brasília, ex.: 25/11/2026 às 14:32. */
function dateTimeSP(iso: string): string {
  const parts = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(iso))
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  return `${get('day')}/${get('month')}/${get('year')} às ${get('hour')}:${get('minute')}:${get('second')}`
}

export async function buildGuardianTermPdf({ studentName, birthDate, signed }: GuardianTermData): Promise<Uint8Array> {
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
  const text = (v: string) => encodable(fonts.regular, v)
  const filled = signed
    ? [name, formatDateBR(birthDate), `${text(signed.guardian_name)} (${text(signed.guardian_relationship)})`, formatCpf(signed.guardian_cpf)]
    : [name, formatDateBR(birthDate), '', '']
  w.table(t.identification.columns, t.identification.rows.map((label, i) => [label, filled[i]!]), {
    widths: [0.38, 0.62],
    heights: signed ? [] : [0, 0, 0.95 * CM, 0.95 * CM],
  })

  w.paragraph(t.authorizations.heading, { size: 12, bold: true, after: 6 })
  const answers = signed ? [signed.image_authorized, signed.face_authorized] : [null, null]
  const mark = (answer: boolean | null, yes: boolean) => (answer === null ? t.authorizations.mark : answer === yes ? '(X)' : '( )')
  w.table(
    t.authorizations.columns,
    t.authorizations.rows.map((label, i) => [label, mark(answers[i]!, true), mark(answers[i]!, false)]),
    { widths: [0.72, 0.14, 0.14], align: ['left', 'center', 'center'] },
  )

  w.paragraph(t.revocation, { after: 14 })

  w.paragraph(t.signature.heading, { size: 12, bold: true, after: 6 })
  if (!signed) {
    // Assinatura com cerca de 2 cm de altura.
    w.table(t.signature.columns, t.signature.rows.map((label) => [label, '']), { widths: [0.38, 0.62], heights: [1 * CM, 2 * CM] })
    return doc.save()
  }

  const png = await doc.embedPng(Uint8Array.from(atob(signed.signature_png.split(',')[1] ?? ''), (c) => c.charCodeAt(0)))
  const when = dateTimeSP(signed.signed_at)
  w.table(t.signature.columns, [[t.signature.rows[0], `${text(signed.signed_place)}, ${when.split(' ')[0]}`], [t.signature.rows[1], '']], {
    widths: [0.38, 0.62],
    heights: [0, 2.2 * CM],
    image: { row: 1, col: 1, image: png },
  })

  w.paragraph('Registro da assinatura eletrônica', { size: 10, bold: true, after: 4 })
  const audit = [
    `Assinado eletronicamente no app King of Glory por ${text(signed.guardian_name)}, CPF ${formatCpf(signed.guardian_cpf)}, em ${when} (horário de Brasília).`,
    `Declaração aceita: "${GUARDIAN_SIGN_DECLARATION}"`,
    `IP: ${signed.signed_ip ?? 'não informado'} · Navegador: ${text(signed.signed_user_agent ?? 'não informado').slice(0, 160)}`,
    `Versão do termo: ${signed.term_version} · Código de verificação (SHA-256): ${signed.document_sha256}`,
    'Assinatura eletrônica simples (Lei 14.063/2020, art. 4º, I; MP 2.200-2/2001, art. 10, § 2º).',
  ]
  for (const line of audit) w.paragraph(text(line), { size: 8, after: 2 })

  return doc.save()
}
