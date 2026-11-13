import { toCsv } from '../domain/csv'
import { STATUS_LABEL, type Db } from '../types'
import { listGyms } from './gyms'
import { listRanks, listStudents } from './students'
import { fetchAll } from './util'

export interface ExportFile {
  name: string
  content: string
}

/** Cópia completa dos dados em CSV (alunos, presenças, graduações) — o backup do professor. */
export async function exportAll(db: Db): Promise<ExportFile[]> {
  const [gyms, students, ranks, attendance, graduations, classes] = await Promise.all([
    listGyms(db),
    listStudents(db),
    listRanks(db),
    fetchAll((a, b) => db.from('attendance').select('*').order('date').order('id').range(a, b)),
    fetchAll((a, b) => db.from('student_graduations').select('*').order('graduated_at').order('id').range(a, b)),
    fetchAll((a, b) => db.from('classes').select('*').order('date').order('id').range(a, b)),
  ])
  const gym = new Map(gyms.map((g) => [g.id, g.name]))
  const student = new Map(students.map((s) => [s.id, s]))
  const rank = new Map(ranks.map((r) => [r.id, r]))
  const klass = new Map(classes.map((c) => [c.id, c]))

  return [
    {
      name: 'alunos.csv',
      content: toCsv(
        ['id', 'nome', 'academia', 'telefone', 'nascimento', 'ativo', 'consentimento_imagem', 'observacoes'],
        students.map((s) => [s.id, s.name, gym.get(s.gym_id), s.phone, s.birth_date, s.active ? 'sim' : 'não', s.image_consent_at, s.notes]),
      ),
    },
    {
      name: 'presencas.csv',
      content: toCsv(
        ['data', 'aluno', 'academia_do_aluno', 'status', 'local', 'aula', 'origem', 'aluno_id', 'aula_id'],
        attendance.map((a) => {
          const c = a.class_id ? klass.get(a.class_id) : undefined
          return [
            a.date,
            student.get(a.student_id)?.name,
            gym.get(a.gym_id),
            STATUS_LABEL[a.status],
            a.class_id ? gym.get(c?.gym_id ?? a.gym_id) : a.location_label,
            c ? `${c.title} ${c.start_time?.slice(0, 5) ?? ''}`.trim() : 'avulsa',
            a.source,
            a.student_id,
            a.class_id,
          ]
        }),
      ),
    },
    {
      name: 'graduacoes.csv',
      content: toCsv(
        ['data', 'aluno', 'grau', 'nome_do_grau', 'observacoes', 'aluno_id'],
        graduations.map((g) => [g.graduated_at, student.get(g.student_id)?.name, rank.get(g.rank_id)?.grade, rank.get(g.rank_id)?.name, g.notes, g.student_id]),
      ),
    },
  ]
}
