// Fila offline de mutações. Tudo aqui é puro (sem IndexedDB, sem rede): a plataforma cuida da
// persistência e chama `executeBatch` quando há conexão. Toda operação é idempotente no servidor,
// então reenviar depois de uma falha no meio do caminho é seguro.

import type { Json } from '../database.types'
import { addWalkIns, markAttendanceBatch, type AttendanceMark } from '../data/attendance'
import { concludeClass, saveLessonPlan, setClassStatus } from '../data/classes'
import { uploadClassPhoto, type PhotoUpload } from '../data/photos'
import { saveFaceDecisions, type FaceDecisionItem } from '../data/faces'
import { walkInLabel, type Attendance, type AttendanceStatus, type ClassStatus, type Db } from '../types'

export type OutboxOp =
  | { type: 'attendance.mark'; mark: AttendanceMark & { marked_at: string } }
  | { type: 'class.conclude'; classId: string }
  | { type: 'class.status'; classId: string; status: ClassStatus }
  | { type: 'walkin.add'; student_ids: string[]; date: string; location: string; credits?: number; period?: string }
  | { type: 'plan.save'; classId: string; content: Json; updatedAt: string }
  | { type: 'photo.upload'; meta: PhotoUpload; blobKey: string }
  /** Decisões sobre os rostos de uma foto. Vai depois do upload da foto (a fila é em ordem). */
  | { type: 'face.decisions'; classId: string; gymId: string; items: FaceDecisionItem[] }

export interface OutboxItem {
  id: string
  createdAt: string
  op: OutboxOp
  /** Preenchido quando o servidor recusou a operação (erro definitivo, não de rede). */
  error?: string
}

/** Operações com a mesma chave se substituem: só a última marcação/versão precisa ser enviada. */
export function coalesceKey(op: OutboxOp): string | null {
  switch (op.type) {
    case 'attendance.mark':
      return `att:${op.mark.class_id}:${op.mark.student_id}`
    case 'plan.save':
      return `plan:${op.classId}`
    case 'class.status':
    case 'class.conclude':
      return `class:${op.classId}`
    default:
      return null
  }
}

export function enqueue(items: readonly OutboxItem[], item: OutboxItem): OutboxItem[] {
  const key = coalesceKey(item.op)
  const rest = key ? items.filter((i) => coalesceKey(i.op) !== key) : [...items]
  return [...rest, item]
}

/** Próximo lote a enviar: marcações de presença consecutivas vão juntas numa única chamada. */
export function nextBatch(items: readonly OutboxItem[]): OutboxItem[] {
  const pending = items.filter((i) => !i.error)
  const first = pending[0]
  if (!first) return []
  if (first.op.type !== 'attendance.mark') return [first]
  const batch: OutboxItem[] = []
  for (const item of pending) {
    if (item.op.type !== 'attendance.mark') break
    batch.push(item)
  }
  return batch
}

export interface OutboxDeps {
  /** Recupera o arquivo de uma foto enfileirada; null se já não existe. */
  getBlob(key: string): Promise<Blob | null>
}

export async function executeBatch(db: Db, batch: readonly OutboxItem[], deps: OutboxDeps): Promise<void> {
  const first = batch[0]
  if (!first) return
  const op = first.op
  switch (op.type) {
    case 'attendance.mark':
      return markAttendanceBatch(
        db,
        batch.flatMap((i) => (i.op.type === 'attendance.mark' ? [i.op.mark] : [])),
      )
    case 'class.conclude':
      return concludeClass(db, op.classId)
    case 'class.status':
      return setClassStatus(db, op.classId, op.status)
    case 'walkin.add':
      await addWalkIns(db, op)
      return
    case 'plan.save':
      return saveLessonPlan(db, op.classId, op.content, op.updatedAt)
    case 'photo.upload': {
      const blob = await deps.getBlob(op.blobKey)
      if (!blob) return // arquivo local perdido: nada a enviar
      return uploadClassPhoto(db, op.meta, blob)
    }
    case 'face.decisions':
      return saveFaceDecisions(db, op.items)
  }
}

/** Status de presença de uma aula: o que veio do servidor com as marcações pendentes por cima. */
export function overlayAttendance(
  server: readonly Pick<Attendance, 'student_id' | 'status'>[],
  items: readonly OutboxItem[],
  classId: string,
): Map<string, AttendanceStatus> {
  const map = new Map<string, AttendanceStatus>()
  for (const row of server) map.set(row.student_id, row.status)
  for (const { op } of items) {
    if (op.type === 'attendance.mark' && op.mark.class_id === classId) map.set(op.mark.student_id, op.mark.status)
  }
  return map
}

/** Status da aula considerando conclusão/reabertura ainda na fila. */
export function overlayClassStatus(status: ClassStatus, items: readonly OutboxItem[], classId: string): ClassStatus {
  let out = status
  for (const { op } of items) {
    if (op.type === 'class.conclude' && op.classId === classId) out = 'done'
    if (op.type === 'class.status' && op.classId === classId) out = op.status
  }
  return out
}

export function describeOp(op: OutboxOp): string {
  switch (op.type) {
    case 'attendance.mark':
      return 'Marcação de presença'
    case 'class.conclude':
      return 'Conclusão de chamada'
    case 'class.status':
      return 'Alteração de aula'
    case 'walkin.add':
      return `Presença avulsa (${op.student_ids.length}) — ${walkInLabel({ location_label: op.location, walk_in_period: op.period })}${op.credits && op.credits > 1 ? ` · vale ${op.credits}` : ''}`
    case 'plan.save':
      return 'Plano de aula'
    case 'photo.upload':
      return 'Foto do treino'
    case 'face.decisions': {
      const n = op.items.filter((i) => i.student_id).length
      return `Reconhecimento facial — ${n} ${n === 1 ? 'aluno' : 'alunos'}`
    }
  }
}
