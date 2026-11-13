import { parseDateLoose } from '../dates'
import type { AttendanceStatus, ClassRow, Student } from '../types'
import { parseCsv } from './csv'

/** Uma presença lida do arquivo, já normalizada. Todo parser de formato devolve isto. */
export interface ImportRow {
  studentName: string
  date: string // ISO
  status: AttendanceStatus
}

export interface ParseResult {
  rows: ImportRow[]
  warnings: string[]
  format: 'long' | 'wide' | 'unknown'
}

export const normalizeName = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()

const NAME_COLS = ['aluno', 'nome', 'nome do aluno', 'student', 'name', 'participante']
const DATE_COLS = ['data', 'dia', 'date', 'data da aula']
const STATUS_COLS = ['status', 'presenca', 'situacao', 'frequencia', 'presente', 'attendance']

function parseStatus(raw: string): AttendanceStatus | null {
  const v = normalizeName(raw)
  if (v === '') return null
  if (/^(p|presente|presenca|sim|s|x|1|true|ok|compareceu|present|✓|✔)$/.test(v)) return 'present'
  if (/^(f|falta|faltou|ausente|nao|n|0|false|absent|-)$/.test(v)) return 'absent'
  if (/^(a|atraso|atrasado|late)$/.test(v)) return 'late'
  if (/^(j|fj|justificada|justificado|falta justificada|justified)$/.test(v)) return 'justified'
  return null
}

/**
 * Lê um export de presenças. Enquanto o formato real do InClass não é conhecido, aceita dois layouts:
 *  - "long": uma linha por presença, com colunas de aluno, data e (opcional) status;
 *  - "wide": uma linha por aluno e uma coluna por data, com P/F/X nas células.
 * Para adaptar ao arquivo real, basta trocar esta função — o resto do fluxo usa só ImportRow[].
 */
export function parseAttendanceExport(text: string): ParseResult {
  const table = parseCsv(text)
  const warnings: string[] = []
  const header = table[0]
  if (!header || table.length < 2) return { rows: [], warnings: ['Arquivo vazio ou sem cabeçalho.'], format: 'unknown' }

  const norm = header.map(normalizeName)
  const nameCol = norm.findIndex((h) => NAME_COLS.includes(h))
  const dateCol = norm.findIndex((h) => DATE_COLS.includes(h))
  const rows: ImportRow[] = []

  if (nameCol >= 0 && dateCol >= 0) {
    const statusCol = norm.findIndex((h) => STATUS_COLS.includes(h))
    table.slice(1).forEach((line, i) => {
      const studentName = line[nameCol] ?? ''
      const date = parseDateLoose(line[dateCol] ?? '')
      if (!studentName || !date) {
        warnings.push(`Linha ${i + 2}: aluno ou data inválidos — ignorada.`)
        return
      }
      const status = statusCol >= 0 ? parseStatus(line[statusCol] ?? '') : 'present'
      if (!status) {
        warnings.push(`Linha ${i + 2}: status "${line[statusCol]}" não reconhecido — ignorada.`)
        return
      }
      rows.push({ studentName, date, status })
    })
    return { rows, warnings, format: 'long' }
  }

  const dateCols = header.map((h, i) => ({ i, date: parseDateLoose(h) })).filter((c) => c.date)
  if (dateCols.length > 0) {
    const nameIdx = nameCol >= 0 ? nameCol : 0
    table.slice(1).forEach((line) => {
      const studentName = line[nameIdx] ?? ''
      if (!studentName) return
      for (const { i, date } of dateCols) {
        const status = parseStatus(line[i] ?? '')
        if (status) rows.push({ studentName, date: date!, status })
      }
    })
    return { rows, warnings, format: 'wide' }
  }

  return {
    rows: [],
    warnings: ['Não reconheci as colunas. Esperado: aluno + data (+ status), ou uma coluna por data.'],
    format: 'unknown',
  }
}

export interface ImportPlan {
  /** Nomes de alunos que não existem na academia e serão criados. */
  newStudents: string[]
  /** Datas sem aula na academia; será criada uma aula "Importado" já concluída. */
  newClassDates: string[]
  /** Presenças a gravar (deduplicadas por aluno + data). */
  records: ImportRow[]
  duplicates: number
  presentCount: number
  dateRange: { from: string; to: string } | null
}

/** Compara o arquivo com o que já existe na academia de destino. Função pura — é o que alimenta o preview. */
export function buildImportPlan(
  rows: readonly ImportRow[],
  students: readonly Pick<Student, 'name'>[],
  classes: readonly Pick<ClassRow, 'date' | 'status'>[],
): ImportPlan {
  const known = new Set(students.map((s) => normalizeName(s.name)))
  const classDates = new Set(classes.filter((c) => c.status !== 'cancelled').map((c) => c.date))
  const seen = new Map<string, ImportRow>()
  const newStudents = new Map<string, string>()
  const newClassDates = new Set<string>()
  let duplicates = 0

  for (const row of rows) {
    const nameKey = normalizeName(row.studentName)
    const key = `${nameKey}|${row.date}`
    const prev = seen.get(key)
    if (prev) {
      duplicates += 1
      // Em duplicata, uma presença vence uma falta.
      if (prev.status !== 'present' && row.status === 'present') seen.set(key, row)
      continue
    }
    seen.set(key, row)
    if (!known.has(nameKey) && !newStudents.has(nameKey)) newStudents.set(nameKey, row.studentName.replace(/\s+/g, ' ').trim())
    if (!classDates.has(row.date)) newClassDates.add(row.date)
  }

  const records = [...seen.values()]
  const dates = records.map((r) => r.date).sort()
  return {
    newStudents: [...newStudents.values()].sort((a, b) => a.localeCompare(b, 'pt-BR')),
    newClassDates: [...newClassDates].sort(),
    records,
    duplicates,
    presentCount: records.filter((r) => r.status === 'present' || r.status === 'late').length,
    dateRange: dates.length ? { from: dates[0]!, to: dates[dates.length - 1]! } : null,
  }
}
