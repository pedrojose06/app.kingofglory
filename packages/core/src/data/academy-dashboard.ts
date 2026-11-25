// Números do painel do sistema da academia: o que termina no mês e
// o progresso dos alunos (para os aptos a graduar). Tudo filtrado pela academia (gym_id).

import { monthRange } from '../domain/report'
import type { Db, StudentProgress } from '../types'
import { fetchAll } from './util'

export interface AcademyDashboardCounts {
  /** Contratos ativos cuja vigência termina no mês. */
  contractsEnding: number
  /** Horários ativos da grade que terminam no mês. */
  schedulesEnding: number
}

async function count(query: PromiseLike<{ count: number | null; error: unknown }>): Promise<number> {
  const { count: n, error } = await query
  if (error) throw error
  return n ?? 0
}

/** Contadores do painel (só o administrador enxerga os contratos pela RLS). */
export async function getAcademyDashboardCounts(db: Db, gymId: string, today: string): Promise<AcademyDashboardCounts> {
  const { from, to } = monthRange(today.slice(0, 7), 1)
  const head = { count: 'exact', head: true } as const
  const [contractsEnding, schedulesEnding] = await Promise.all([
    count(db.from('contracts').select('id', head).eq('gym_id', gymId).eq('status', 'ativo').gte('ends_on', from).lte('ends_on', to)),
    count(db.from('class_schedules').select('id', head).eq('gym_id', gymId).eq('active', true).gte('ends_on', from).lte('ends_on', to)),
  ])
  return { contractsEnding, schedulesEnding }
}

/** Presenças e treinos desde a última graduação de todos os alunos da academia (view `student_progress`). */
export async function listAcademyProgress(db: Db, gymId: string): Promise<StudentProgress[]> {
  const rows = await fetchAll((a, b) => db.from('student_progress').select('*').eq('gym_id', gymId).order('student_id').range(a, b))
  return rows as StudentProgress[]
}
