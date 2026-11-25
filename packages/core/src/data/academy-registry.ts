// Cadastros do sistema da academia: alunos (ficha completa), modalidades, turmas, faixas, pagadores, planos e contratos.
// Tudo filtrado pela academia (gym_id): quem é de mais de uma academia não mistura os dados.

import { addDays } from '../dates'
import { addMonths, buildContractCharges, type ChargeState, type PaymentMethod, type ContractBilling, type ContractTerms } from '../domain/billing'
import type { Db, Row } from '../types'
import { fetchAll, unwrap } from './util'

export type StudentDetails = Row<'student_details'>
export type Modality = Row<'modalities'>
export type ClassGroup = Row<'class_groups'>
export type BeltRank = Row<'belt_ranks'>
export type StudentBelt = Row<'student_belts'>
export type Payer = Row<'payers'>
export type Plan = Row<'plans'>
export type Contract = Row<'contracts'>

// ── alunos ────────────────────────────────────────────────────────────────────

export interface AcademyStudentRow {
  id: string
  name: string
  phone: string | null
  birth_date: string | null
  active: boolean
  started_on: string | null
  created_at: string
  /** Foto do aluno (bucket student-photos). */
  photo_path: string | null
  /** Turmas atuais (sem data de saída). */
  group_ids: string[]
  /** Só o admin recebe (RLS): null para o professor. */
  cpf: string | null
  email: string | null
  /** Contrato ativo mais recente do aluno (admin). */
  contract: Pick<Contract, 'id' | 'billing' | 'status' | 'ends_on' | 'amount_cents' | 'discount_cents' | 'due_day' | 'review_needed'> | null
}

export async function listAcademyStudents(db: Db, gymId: string): Promise<AcademyStudentRow[]> {
  const [students, members, details, contracts] = await Promise.all([
    fetchAll((a, b) =>
      db.from('students').select('id, name, phone, birth_date, active, started_on, created_at, photo_path').eq('gym_id', gymId).order('name').range(a, b),
    ),
    fetchAll((a, b) => db.from('class_group_members').select('student_id, group_id, left_on').eq('gym_id', gymId).range(a, b)),
    fetchAll((a, b) => db.from('student_details').select('student_id, cpf, email').eq('gym_id', gymId).range(a, b)),
    fetchAll((a, b) =>
      db
        .from('contracts')
        .select('id, billing, status, ends_on, amount_cents, discount_cents, due_day, review_needed, created_at, contract_students(student_id)')
        .eq('gym_id', gymId)
        .neq('status', 'cancelado')
        .order('created_at', { ascending: false })
        .range(a, b),
    ),
  ])
  const groups = new Map<string, string[]>()
  for (const m of members) if (!m.left_on) groups.set(m.student_id, [...(groups.get(m.student_id) ?? []), m.group_id])
  const det = new Map(details.map((d) => [d.student_id, d]))
  const contractOf = new Map<string, AcademyStudentRow['contract']>()
  for (const c of contracts) {
    const { contract_students, created_at: _c, ...rest } = c
    for (const cs of contract_students) if (!contractOf.has(cs.student_id)) contractOf.set(cs.student_id, rest)
  }
  return students.map((s) => ({
    ...s,
    group_ids: groups.get(s.id) ?? [],
    cpf: det.get(s.id)?.cpf ?? null,
    email: det.get(s.id)?.email ?? null,
    contract: contractOf.get(s.id) ?? null,
  }))
}

export interface AcademyStudentInput {
  name: string
  phone: string | null
  birth_date: string | null
  started_on: string | null
  active: boolean
  notes: string | null
  details: Omit<StudentDetails, 'student_id' | 'gym_id' | 'updated_at' | 'external_ref'>
  group_ids: string[]
}

export interface AcademyStudent {
  student: Row<'students'>
  details: StudentDetails | null
  groups: { group_id: string; joined_on: string; left_on: string | null }[]
  belts: (StudentBelt & { rank: BeltRank | null })[]
  graduations: (Row<'student_graduations'> & { rank: Row<'ranks'> | null })[]
  guardians: { payer: Payer; relationship: string | null; legal_guardian: boolean }[]
}

export async function getAcademyStudent(db: Db, id: string): Promise<AcademyStudent | null> {
  const student = unwrap(await db.from('students').select('*').eq('id', id).maybeSingle())
  if (!student) return null
  const [details, groups, belts, graduations, guardians] = await Promise.all([
    db.from('student_details').select('*').eq('student_id', id).maybeSingle(),
    db.from('class_group_members').select('group_id, joined_on, left_on').eq('student_id', id),
    db.from('student_belts').select('*, rank:belt_ranks(*)').eq('student_id', id).order('graduated_at', { ascending: false }),
    db.from('student_graduations').select('*, rank:ranks(*)').eq('student_id', id).order('graduated_at', { ascending: false }),
    db.from('student_guardians').select('relationship, legal_guardian, payer:payers(*)').eq('student_id', id),
  ])
  return {
    student,
    details: unwrap(details),
    groups: unwrap(groups),
    belts: unwrap(belts),
    graduations: unwrap(graduations),
    guardians: unwrap(guardians).flatMap((g) => (g.payer ? [{ payer: g.payer, relationship: g.relationship, legal_guardian: g.legal_guardian }] : [])),
  }
}

/** Cria ou atualiza o aluno, a ficha e as turmas (sair de uma turma guarda a data de saída). Devolve o id. */
export async function saveAcademyStudent(db: Db, gymId: string, id: string | null, input: AcademyStudentInput, today: string): Promise<string> {
  const base = {
    name: input.name.trim(),
    phone: input.phone?.trim() || null,
    birth_date: input.birth_date || null,
    // started_on é obrigatório no banco (padrão: hoje); só vai quando informado.
    ...(input.started_on ? { started_on: input.started_on } : {}),
    active: input.active,
    notes: input.notes?.trim() || null,
  }
  const studentId = id
    ? (unwrap(await db.from('students').update(base).eq('id', id)), id)
    : unwrap<{ id: string }>(await db.from('students').insert({ ...base, gym_id: gymId }).select('id').single()).id

  unwrap(await db.from('student_details').upsert({ ...input.details, student_id: studentId, gym_id: gymId }, { onConflict: 'student_id' }))

  const current = unwrap(await db.from('class_group_members').select('group_id, left_on').eq('student_id', studentId))
  const want = new Set(input.group_ids)
  for (const m of current) {
    if (want.has(m.group_id) && m.left_on) {
      unwrap(await db.from('class_group_members').update({ left_on: null, joined_on: today }).eq('student_id', studentId).eq('group_id', m.group_id))
    } else if (!want.has(m.group_id) && !m.left_on) {
      unwrap(await db.from('class_group_members').update({ left_on: today }).eq('student_id', studentId).eq('group_id', m.group_id))
    }
  }
  const known = new Set(current.map((m) => m.group_id))
  const add = [...want].filter((g) => !known.has(g)).map((group_id) => ({ group_id, student_id: studentId, gym_id: gymId, joined_on: today }))
  if (add.length) unwrap(await db.from('class_group_members').insert(add))
  return studentId
}

// ── modalidades, turmas e faixas ──────────────────────────────────────────────

export async function listModalities(db: Db, gymId: string): Promise<Modality[]> {
  return unwrap(await db.from('modalities').select('*').eq('gym_id', gymId).order('name'))
}

export async function saveModality(
  db: Db,
  gymId: string,
  id: string | null,
  input: Pick<Modality, 'name' | 'belt_system' | 'color' | 'active'>,
): Promise<void> {
  if (id) unwrap(await db.from('modalities').update(input).eq('id', id))
  else unwrap(await db.from('modalities').insert({ ...input, gym_id: gymId }))
}

export interface ClassGroupRow extends ClassGroup {
  members: number
}

export async function listClassGroups(db: Db, gymId: string): Promise<ClassGroupRow[]> {
  const [groups, members] = await Promise.all([
    db.from('class_groups').select('*').eq('gym_id', gymId).order('name'),
    fetchAll((a, b) => db.from('class_group_members').select('group_id').eq('gym_id', gymId).is('left_on', null).range(a, b)),
  ])
  const count = new Map<string, number>()
  for (const m of members) count.set(m.group_id, (count.get(m.group_id) ?? 0) + 1)
  return unwrap(groups).map((g) => ({ ...g, members: count.get(g.id) ?? 0 }))
}

export type ClassGroupInput = Pick<ClassGroup, 'name' | 'modality_id' | 'color' | 'capacity' | 'min_age' | 'max_age' | 'notes' | 'active'>

export async function saveClassGroup(db: Db, gymId: string, id: string | null, input: ClassGroupInput): Promise<void> {
  if (id) unwrap(await db.from('class_groups').update(input).eq('id', id))
  else unwrap(await db.from('class_groups').insert({ ...input, gym_id: gymId }))
}

export async function listBeltRanks(db: Db): Promise<BeltRank[]> {
  return unwrap(await db.from('belt_ranks').select('*').order('track').order('position'))
}

export async function addStudentBelt(
  db: Db,
  input: { student_id: string; belt_rank_id: string; degrees: number; graduated_at: string; notes?: string | null },
): Promise<void> {
  unwrap(await db.from('student_belts').insert({ ...input, notes: input.notes ?? null }))
}

export async function deleteStudentBelt(db: Db, id: string): Promise<void> {
  unwrap(await db.from('student_belts').delete().eq('id', id))
}

// ── pagadores e responsáveis ──────────────────────────────────────────────────

export interface PayerRow extends Payer {
  students: { id: string; name: string; relationship: string | null }[]
}

export async function listPayers(db: Db, gymId: string): Promise<PayerRow[]> {
  const rows = await fetchAll((a, b) =>
    db
      .from('payers')
      .select('*, student_guardians(relationship, student:students(id, name))')
      .eq('gym_id', gymId)
      .order('name')
      .range(a, b),
  )
  return rows.map(({ student_guardians, ...p }) => ({
    ...p,
    students: student_guardians.flatMap((g) => (g.student ? [{ ...g.student, relationship: g.relationship }] : [])),
  }))
}

export type PayerInput = Pick<Payer, 'name' | 'cpf' | 'email' | 'phone' | 'notes'>

export async function savePayer(db: Db, gymId: string, id: string | null, input: PayerInput): Promise<string> {
  if (id) {
    unwrap(await db.from('payers').update(input).eq('id', id))
    return id
  }
  return unwrap<{ id: string }>(await db.from('payers').insert({ ...input, gym_id: gymId }).select('id').single()).id
}

export async function linkGuardian(db: Db, studentId: string, payerId: string, relationship: string | null, legalGuardian = true): Promise<void> {
  unwrap(
    await db
      .from('student_guardians')
      .upsert({ student_id: studentId, payer_id: payerId, relationship: relationship?.trim() || null, legal_guardian: legalGuardian }),
  )
}

export async function unlinkGuardian(db: Db, studentId: string, payerId: string): Promise<void> {
  unwrap(await db.from('student_guardians').delete().eq('student_id', studentId).eq('payer_id', payerId))
}

/** Pagador que é o próprio aluno (maior de idade pagando a própria matrícula). Cria se não existir. */
export async function ensureSelfPayer(db: Db, gymId: string, student: { id: string; name: string; phone: string | null }, details: Pick<StudentDetails, 'cpf' | 'email'> | null): Promise<string> {
  const found = unwrap<{ id: string } | null>(await db.from('payers').select('id').eq('gym_id', gymId).eq('student_id', student.id).maybeSingle())
  if (found) return found.id
  return unwrap<{ id: string }>(
    await db
      .from('payers')
      .insert({ gym_id: gymId, student_id: student.id, name: student.name, phone: student.phone, cpf: details?.cpf ?? null, email: details?.email ?? null })
      .select('id')
      .single(),
  ).id
}

// ── planos ────────────────────────────────────────────────────────────────────

export async function listPlans(db: Db, gymId: string): Promise<Plan[]> {
  return unwrap(await db.from('plans').select('*').eq('gym_id', gymId).order('active', { ascending: false }).order('name'))
}

export type PlanInput = Pick<Plan, 'name' | 'description' | 'price_cents' | 'duration_months' | 'enrollment_fee_cents' | 'active'>

export async function savePlan(db: Db, gymId: string, id: string | null, input: PlanInput): Promise<void> {
  if (id) unwrap(await db.from('plans').update(input).eq('id', id))
  else unwrap(await db.from('plans').insert({ ...input, gym_id: gymId }))
}

// ── contratos de matrícula ────────────────────────────────────────────────────

export interface ContractRow extends Contract {
  payer: Pick<Payer, 'id' | 'name'> | null
  plan: Pick<Plan, 'id' | 'name'> | null
  students: { id: string; name: string }[]
}

const CONTRACT_SELECT = '*, payer:payers(id, name), plan:plans(id, name), contract_students(student:students(id, name))'

function toContractRow(c: { contract_students: { student: { id: string; name: string } | null }[] } & Omit<ContractRow, 'students'>): ContractRow {
  const { contract_students, ...rest } = c
  return { ...rest, students: contract_students.flatMap((cs) => (cs.student ? [cs.student] : [])) }
}

export async function listContracts(db: Db, gymId: string): Promise<ContractRow[]> {
  const rows = await fetchAll((a, b) => db.from('contracts').select(CONTRACT_SELECT).eq('gym_id', gymId).order('created_at', { ascending: false }).range(a, b))
  return rows.map(toContractRow)
}

export async function listStudentContracts(db: Db, studentId: string): Promise<ContractRow[]> {
  const ids = unwrap(await db.from('contract_students').select('contract_id').eq('student_id', studentId)).map((r) => r.contract_id)
  if (ids.length === 0) return []
  const rows = unwrap(await db.from('contracts').select(CONTRACT_SELECT).in('id', ids).order('starts_on', { ascending: false }))
  return rows.map(toContractRow)
}

export interface NewContract extends ContractTerms {
  payerId: string
  planId: string | null
  studentIds: string[]
  notes?: string | null
}

/** Cria o contrato com as parcelas calculadas por buildContractCharges (tudo numa transação no banco). */
export async function createContract(db: Db, input: NewContract): Promise<string> {
  const drafts = buildContractCharges(input)
  return unwrap(
    await db.rpc('create_contract', {
      p_contract: {
        payer_id: input.payerId,
        plan_id: input.planId,
        billing: input.billing satisfies ContractBilling,
        starts_on: input.startsOn,
        ends_on: input.endsOn,
        due_day: input.dueDay,
        amount_cents: input.amountCents,
        discount_cents: input.discountCents ?? 0,
        enrollment_fee_cents: input.enrollmentFeeCents ?? 0,
        notes: input.notes ?? null,
      },
      p_student_ids: input.studentIds,
      p_charges: drafts.map((d) => ({
        kind: d.kind,
        competence: d.competence,
        due_on: d.dueOn,
        amount_cents: d.amountCents,
        installment: d.installment,
        installments_total: d.installmentsTotal,
        description: d.description,
      })),
    }),
  )
}

/** Cancela o contrato; as cobranças abertas a partir de `from` são canceladas. Devolve quantas. */
export async function cancelContract(db: Db, contractId: string, reason: string, from: string): Promise<number> {
  return unwrap(await db.rpc('cancel_contract', { p_contract_id: contractId, p_reason: reason, p_from: from }))
}

export async function updateContractNotes(db: Db, contractId: string, patch: Pick<Contract, 'notes' | 'review_needed'>): Promise<void> {
  unwrap(await db.from('contracts').update(patch).eq('id', contractId))
}

// ── cobranças de um aluno (visão por aluno) ───────────────────────────────────

export interface ChargeOverview {
  id: string
  contract_id: string | null
  payer_id: string
  kind: string
  description: string | null
  competence: string | null
  due_on: string
  amount_cents: number
  status: string
  state: ChargeState
  days_late: number
  payer_name: string
  student_names: string[]
  student_ids: string[]
  installment: number | null
  installments_total: number | null
  paid_on: string | null
  paid_cents: number | null
  payment_method: string | null
}

export async function listStudentCharges(db: Db, studentId: string): Promise<ChargeOverview[]> {
  return unwrap(
    await db.from('charge_overview').select('*').contains('student_ids', [studentId]).order('due_on', { ascending: false }),
  ) as unknown as ChargeOverview[]
}

// ── mensalidades da academia ──────────────────────────────────────────────────

/** Em aberto: vencem no mês e ainda não venceram. Atrasadas: todas, de qualquer mês. Pagas: pagas no mês. */
export type ChargeList = 'em_aberto' | 'atrasadas' | 'pagas'

/** Cobranças da academia de uma das listas da tela de mensalidades. `month` é 'YYYY-MM'. Só o administrador (RLS). */
export async function listAcademyCharges(db: Db, gymId: string, list: ChargeList, month: string): Promise<ChargeOverview[]> {
  const from = `${month}-01`
  const to = addDays(`${addMonths(from, 1)}`, -1)
  const rows = await fetchAll((a, b) => {
    const q = db.from('charge_overview').select('*').eq('gym_id', gymId)
    const filtered =
      list === 'atrasadas'
        ? q.eq('state', 'atrasada').order('due_on', { ascending: false })
        : list === 'em_aberto'
          ? q.eq('state', 'em_aberto').gte('due_on', from).lte('due_on', to).order('due_on')
          : q.eq('state', 'paga').gte('paid_on', from).lte('paid_on', to).order('paid_on', { ascending: false })
    return filtered.order('id').range(a, b)
  })
  return rows as unknown as ChargeOverview[]
}

export interface PaymentInput {
  paidOn: string
  amountCents: number
  method: PaymentMethod
  notes?: string | null
}

/** Dá baixa na cobrança (pagamento + cobrança paga numa transação). Só o administrador. */
export async function payCharge(db: Db, chargeId: string, input: PaymentInput): Promise<string> {
  return unwrap(
    await db.rpc('pay_charge', {
      p_charge_id: chargeId,
      p_paid_on: input.paidOn,
      p_amount_cents: input.amountCents,
      p_method: input.method,
      p_notes: input.notes ?? undefined,
    }),
  )
}

/** Desfaz uma baixa feita por engano: o pagamento fica estornado com o motivo e a cobrança volta a ficar em aberto. */
export async function reversePayment(db: Db, chargeId: string, reason: string): Promise<void> {
  unwrap(await db.rpc('reverse_payment', { p_charge_id: chargeId, p_reason: reason }))
}
