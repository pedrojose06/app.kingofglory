'use client'

import {
  type AcademyStudent, type AcademyStudentInput, addGraduation, addStudentBelt, cancelContract, CHARGE_KIND_LABEL, CHARGE_STATE_LABEL,
  chargeTotals, CONTRACT_BILLING_LABEL, contractExtensionCharges, contractExtensionEnd, contractExtensionIssue, contractPeriodState,
  contractTermsOf, type ContractRow, extendContract, formatBRL, formatCpf, formatDateBR, isMinor, isValidCpf,
  graduationStatus, linkGuardian, missingLabel, PAYMENT_METHOD_LABEL, savePayer, saveAcademyStudent, setStudentFaceOptOut, todayISO, unlinkGuardian,
  updateContractNotes,
} from '@kog/core'
import { Badge, Button, Card, DateInput, EmptyState, Field, Input, ProgressBar, RankBand, Select, Textarea } from '@kog/ui'
import { toast, toastError } from '@kog/web-kit'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, MessageCircle, Plus } from 'lucide-react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { ContractDialog } from '@/components/contract-dialog'
import { refreshPhotoReference, StudentAvatar, StudentPhoto } from '@/components/student-photo'
import { ageOn, Dialog, GroupTag, Stat, whatsappLink } from '@/components/kit'
import { ErrorState, FormMessage, Loading } from '@/components/states'
import { useAcademy } from '@/lib/academy'
import {
  keys, useBeltRanks, useClassGroups, useGraduationSchedule, usePayers, useRanks, useStudent, useStudentCharges, useStudentContracts, useStudentProgress,
} from '@/lib/queries'
import { db } from '@/lib/supabase'

export default function StudentPage() {
  return (
    <Suspense fallback={<Loading />}>
      <StudentRoute />
    </Suspense>
  )
}

function StudentRoute() {
  const params = useSearchParams()
  const id = params.get('id') ?? ''
  if (params.get('novo')) return <NewStudent />
  if (!id) return <EmptyState title="Aluno não informado." action={<BackLink />} />
  return <StudentDetail id={id} />
}

function BackLink() {
  return (
    <Link href="/alunos" className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent hover:underline">
      <ArrowLeft className="size-4" /> Alunos
    </Link>
  )
}

function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <Card className="p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-xl uppercase tracking-[0.02em] text-text">{title}</h2>
        {action}
      </div>
      {children}
    </Card>
  )
}

// ── cadastro / edição ─────────────────────────────────────────────────────────

const emptyDetails: AcademyStudentInput['details'] = {
  cpf: null, rg: null, email: null, phone_home: null, cep: null, street: null, number: null, complement: null, district: null, city: null,
  state: null, registered_on: null,
}

function NewStudent() {
  return (
    <>
      <BackLink />
      <h1 className="mt-3 mb-6 font-display text-3xl uppercase leading-none text-text">Novo aluno</h1>
      <StudentForm data={null} />
    </>
  )
}

function StudentForm({ data }: { data: AcademyStudent | null }) {
  const { academy, isAdmin } = useAcademy()
  const router = useRouter()
  const queryClient = useQueryClient()
  const groups = useClassGroups()
  const today = todayISO()
  const initial = (): AcademyStudentInput => ({
    name: data?.student.name ?? '',
    phone: data?.student.phone ?? '',
    birth_date: data?.student.birth_date ?? '',
    started_on: data?.student.started_on ?? today,
    active: data?.student.active ?? true,
    notes: data?.student.notes ?? '',
    details: data?.details
      ? { ...emptyDetails, ...Object.fromEntries(Object.keys(emptyDetails).map((k) => [k, data.details![k as keyof typeof emptyDetails]])) }
      : { ...emptyDetails },
    group_ids: data?.groups.filter((g) => !g.left_on).map((g) => g.group_id) ?? [],
  })
  const [form, setForm] = useState<AcademyStudentInput>(initial)
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null)
  useEffect(() => setForm(initial()), [data]) // eslint-disable-line react-hooks/exhaustive-deps

  const set = <K extends keyof AcademyStudentInput>(k: K, v: AcademyStudentInput[K]) => setForm((f) => ({ ...f, [k]: v }))
  const setD = (k: keyof AcademyStudentInput['details'], v: string) => setForm((f) => ({ ...f, details: { ...f.details, [k]: v || null } }))

  const save = useMutation({
    mutationFn: () => {
      const cpf = (form.details.cpf ?? '').replace(/\D/g, '')
      return saveAcademyStudent(
        db(),
        academy.gym_id,
        data?.student.id ?? null,
        {
          ...form,
          details: {
            ...form.details,
            cpf: cpf || null,
            cep: (form.details.cep ?? '').replace(/\D/g, '') || null,
            email: form.details.email?.trim().toLowerCase() || null,
          },
        },
        today,
      )
    },
    onSuccess: async (id) => {
      await queryClient.invalidateQueries({ queryKey: keys.all(academy.gym_id) })
      toast(data ? 'Cadastro salvo.' : 'Aluno cadastrado.')
      if (!data) router.replace(`/aluno?id=${id}`)
    },
    onError: toastError,
  })

  function submit(e: FormEvent) {
    e.preventDefault()
    const cpf = (form.details.cpf ?? '').replace(/\D/g, '')
    const issue =
      form.name.trim().length < 3
        ? 'Informe o nome completo.'
        : cpf && !isValidCpf(cpf)
          ? 'CPF inválido.'
          : form.birth_date && form.birth_date > today
            ? 'Data de nascimento no futuro.'
            : form.details.cep && form.details.cep.replace(/\D/g, '').length !== 8
              ? 'CEP deve ter 8 dígitos.'
              : null
    setMessage(issue ? { text: issue, error: true } : null)
    if (!issue) save.mutate()
  }

  const disabled = !isAdmin
  return (
    <form onSubmit={submit} className="space-y-6">
      {data ? (
        <Section title="Foto">
          <StudentPhoto student={data.student} />
        </Section>
      ) : null}
      <Section title="Dados pessoais">
        <fieldset disabled={disabled} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Nome completo" className="sm:col-span-2">
            <Input required value={form.name} onChange={(e) => set('name', e.target.value)} />
          </Field>
          <Field label="Nascimento" hint={form.birth_date && isMinor(form.birth_date, today) ? 'Menor de idade: o contrato é do responsável.' : undefined}>
            <DateInput value={form.birth_date ?? ''} onChange={(e) => set('birth_date', e.target.value)} />
          </Field>
          <Field label="CPF">
            <Input inputMode="numeric" value={form.details.cpf ? formatCpf(form.details.cpf) : ''} onChange={(e) => setD('cpf', e.target.value.replace(/\D/g, '').slice(0, 11))} />
          </Field>
          <Field label="RG">
            <Input value={form.details.rg ?? ''} onChange={(e) => setD('rg', e.target.value)} />
          </Field>
          <Field label="WhatsApp">
            <Input inputMode="tel" value={form.phone ?? ''} onChange={(e) => set('phone', e.target.value)} />
          </Field>
          <Field label="Telefone fixo">
            <Input inputMode="tel" value={form.details.phone_home ?? ''} onChange={(e) => setD('phone_home', e.target.value)} />
          </Field>
          <Field label="E-mail">
            <Input type="email" value={form.details.email ?? ''} onChange={(e) => setD('email', e.target.value)} />
          </Field>
          <Field label="Começou a treinar em">
            <DateInput value={form.started_on ?? ''} onChange={(e) => set('started_on', e.target.value)} />
          </Field>
        </fieldset>
      </Section>

      <Section title="Endereço">
        <fieldset disabled={disabled} className="grid gap-4 sm:grid-cols-6">
          <Field label="CEP" className="sm:col-span-2">
            <Input inputMode="numeric" value={form.details.cep ?? ''} onChange={(e) => setD('cep', e.target.value)} />
          </Field>
          <Field label="Rua" className="sm:col-span-4">
            <Input value={form.details.street ?? ''} onChange={(e) => setD('street', e.target.value)} />
          </Field>
          <Field label="Número" className="sm:col-span-2">
            <Input value={form.details.number ?? ''} onChange={(e) => setD('number', e.target.value)} />
          </Field>
          <Field label="Complemento" className="sm:col-span-4">
            <Input value={form.details.complement ?? ''} onChange={(e) => setD('complement', e.target.value)} />
          </Field>
          <Field label="Bairro" className="sm:col-span-3">
            <Input value={form.details.district ?? ''} onChange={(e) => setD('district', e.target.value)} />
          </Field>
          <Field label="Cidade" className="sm:col-span-2">
            <Input value={form.details.city ?? ''} onChange={(e) => setD('city', e.target.value)} />
          </Field>
          <Field label="UF">
            <Input maxLength={2} value={form.details.state ?? ''} onChange={(e) => setD('state', e.target.value.toUpperCase())} />
          </Field>
        </fieldset>
      </Section>

      <Section title="Turmas">
        {groups.isPending ? (
          <Loading />
        ) : (groups.data ?? []).length === 0 ? (
          <EmptyState title="Nenhuma turma cadastrada.">Cadastre as turmas na aba Turmas.</EmptyState>
        ) : (
          <div className="flex flex-wrap gap-2">
            {(groups.data ?? [])
              .filter((g) => g.active || form.group_ids.includes(g.id))
              .map((g) => {
                const on = form.group_ids.includes(g.id)
                return (
                  <button
                    key={g.id}
                    type="button"
                    disabled={disabled}
                    aria-pressed={on}
                    onClick={() => set('group_ids', on ? form.group_ids.filter((x) => x !== g.id) : [...form.group_ids, g.id])}
                    className={`flex items-center gap-2 rounded border px-3 py-2 text-sm font-semibold transition ${on ? 'border-gold bg-tint text-text' : 'border-line text-dim hover:border-line-strong'}`}
                  >
                    <span className="size-2.5 rounded-full" style={{ backgroundColor: g.color ?? 'var(--kog-gold)' }} />
                    {g.name}
                  </button>
                )
              })}
          </div>
        )}
      </Section>

      <Section title="Observações">
        <fieldset disabled={disabled} className="space-y-4">
          <Textarea value={form.notes ?? ''} onChange={(e) => set('notes', e.target.value)} />
          {data ? (
            <label className="flex items-center gap-2 text-sm text-soft">
              <input type="checkbox" checked={form.active} onChange={(e) => set('active', e.target.checked)} className="size-4 accent-[var(--kog-gold)]" />
              Aluno ativo (desmarque para inativar; o histórico continua)
            </label>
          ) : null}
        </fieldset>
      </Section>

      {isAdmin ? (
        <div className="sticky bottom-0 z-10 -mx-4 flex items-center justify-end gap-3 border-t border-line bg-bg/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
          <div className="mr-auto">
            <FormMessage message={message} />
          </div>
          <Button type="submit" loading={save.isPending}>
            {data ? 'Salvar cadastro' : 'Cadastrar aluno'}
          </Button>
        </div>
      ) : null}
    </form>
  )
}

// ── ficha ─────────────────────────────────────────────────────────────────────

function StudentDetail({ id }: { id: string }) {
  const student = useStudent(id)
  const { isAdmin } = useAcademy()
  const groups = useClassGroups()
  const today = todayISO()
  const [tab, setTab] = useState<'ficha' | 'cadastro'>('ficha')

  if (student.isPending) return <Loading label="Carregando aluno…" />
  if (student.isError) return <ErrorState error={student.error} onRetry={() => student.refetch()} />
  const data = student.data
  if (!data) return <EmptyState title="Aluno não encontrado." action={<BackLink />} />
  const s = data.student
  const currentGroups = data.groups.filter((g) => !g.left_on)

  return (
    <>
      <BackLink />
      <div className="mt-3 mb-5 flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-center gap-4">
          <StudentAvatar path={s.photo_path} name={s.name} className="size-16" />
          <div>
          <h1 className="font-display text-3xl uppercase leading-none text-text">{s.name}</h1>
          <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-dim">
            {s.birth_date ? `${ageOn(s.birth_date, today)} anos · nasc. ${formatDateBR(s.birth_date)}` : 'Nascimento pendente'}
            {isMinor(s.birth_date, today) ? <Badge tone="gold">Menor</Badge> : null}
            {!s.active ? <Badge tone="danger">Inativo</Badge> : null}
            {currentGroups.map((g) => {
              const grp = groups.data?.find((x) => x.id === g.group_id)
              return grp ? <GroupTag key={g.group_id} name={grp.name} color={grp.color} /> : null
            })}
          </p>
          </div>
        </div>
        {s.phone ? (
          <a href={whatsappLink(s.phone)} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-2 rounded border border-line-strong px-3 text-xs font-bold uppercase tracking-[0.08em] text-accent">
            <MessageCircle className="size-4" /> {s.phone}
          </a>
        ) : null}
      </div>

      {isAdmin ? (
        <div className="mb-6 flex gap-1 border-b border-line">
          {(['ficha', 'cadastro'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`-mb-px border-b-2 px-3 py-2.5 text-sm font-bold ${tab === t ? 'border-gold text-accent' : 'border-transparent text-dim hover:text-text'}`}
            >
              {t === 'ficha' ? 'Matrícula e financeiro' : 'Dados cadastrais'}
            </button>
          ))}
        </div>
      ) : null}

      {tab === 'cadastro' || !isAdmin ? (
        isAdmin ? (
          <StudentForm data={data} />
        ) : (
          <div className="space-y-6">
            <AttendanceSection data={data} />
            <GraduationSection data={data} />
          </div>
        )
      ) : (
        <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
          <div className="space-y-6">
            <ContractsSection data={data} />
            <ChargesSection studentId={s.id} />
          </div>
          <div className="space-y-6">
            <AttendanceSection data={data} />
            <GraduationSection data={data} />
            <GuardiansSection data={data} />
            <FaceSection data={data} />
          </div>
        </div>
      )}
    </>
  )
}

// ── presenças e próxima graduação ─────────────────────────────────────────────

/**
 * Quantas presenças o aluno tem e quanto falta para o próximo grau de muay thai (mesma conta do app do professor:
 * treinos desde a última graduação, tabela de requisitos de cada grau e data marcada da próxima graduação).
 */
function AttendanceSection({ data }: { data: AcademyStudent }) {
  const s = data.student
  const today = todayISO()
  const progress = useStudentProgress(s.id)
  const ranks = useRanks()
  const schedule = useGraduationSchedule()
  const track = s.track === 'infantil' ? 'infantil' : 'adulto'

  if (progress.isPending || ranks.isPending) return <Section title="Presenças"><Loading /></Section>
  if (progress.isError) return <Section title="Presenças"><ErrorState error={progress.error} onRetry={() => progress.refetch()} /></Section>
  const p = progress.data
  const status = graduationStatus(p ?? undefined, ranks.data ?? [], s.started_on ?? s.created_at.slice(0, 10), today, {
    track,
    birthDate: s.birth_date,
    graduationOn: schedule.data?.[track] ?? null,
  })
  const missing = missingLabel(status)
  const since = status.current ? 'desde a última graduação' : 'desde o início'

  return (
    <Section title="Presenças">
      <div className="grid grid-cols-2 gap-3">
        <Stat label="Presenças no total" value={p?.attendance_total ?? 0} />
        <Stat label={status.current ? 'Desde a graduação' : 'Desde o início'} value={status.count} />
      </div>
      <p className="mt-2 text-xs text-dim">
        {p?.last_attendance_on ? `Último treino em ${formatDateBR(p.last_attendance_on)}.` : 'Nenhum treino registrado ainda.'}
      </p>

      <div className="mt-4 border-t border-line pt-4">
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-dim">Próxima graduação · muay thai</p>
        {!status.next ? (
          <p className="mt-1 text-sm text-soft">{status.current ? 'Já está no último grau.' : 'Sem graus cadastrados.'}</p>
        ) : (
          <>
            <div className="mt-1.5 mb-2 flex items-center justify-between gap-2">
              <p className="flex items-center gap-2 font-semibold text-text">
                <RankBand colors={status.next.colors} />
                {status.next.name}
              </p>
              {status.eligible ? <Badge tone="success">Apto</Badge> : status.configured ? <Badge tone="gold">Em progresso</Badge> : <Badge>Sem requisito</Badge>}
            </div>
            {status.byAge ? (
              <p className="text-sm text-soft">
                {status.ageThisYear != null ? `Completa ${status.ageThisYear} anos este ano` : 'Sem data de nascimento cadastrada'}
                {status.ageNeeded != null ? <span className="text-dim"> · {status.next.name} a partir de {status.ageNeeded}</span> : null}
              </p>
            ) : status.needed != null ? (
              <>
                <ProgressBar value={Math.min(status.count, status.needed)} max={status.needed || 1} />
                <p className="mt-1.5 text-sm text-soft">
                  <strong className="text-text">{status.count}</strong> de {status.needed} treinos <span className="text-dim">{since}</span>
                </p>
              </>
            ) : (
              <p className="text-sm text-soft"><strong className="text-text">{status.count}</strong> treinos {since}</p>
            )}
            {!status.byAge && status.monthsNeeded != null ? (
              <p className="mt-1 text-sm text-soft">
                <strong className="text-text">{status.monthsElapsed}</strong> de {status.monthsNeeded} meses{status.on ? ` em ${formatDateBR(status.on)}` : ''}
              </p>
            ) : null}
            {missing ? <p className="mt-2 text-sm font-semibold text-accent">{missing.charAt(0).toUpperCase() + missing.slice(1)}.</p> : null}
            {status.on ? <p className="mt-1 text-xs text-dim">Próxima graduação marcada para {formatDateBR(status.on)}.</p> : null}
          </>
        )}
      </div>
    </Section>
  )
}

// ── reconhecimento facial ────────────────────────────────────────────────────

/**
 * O contrato de matrícula já autoriza o uso de imagem e o reconhecimento facial: todo aluno entra na presença pelo
 * rosto. Quem pedir para não ser reconhecido fica de fora (e os dados do rosto são apagados na hora).
 */
function FaceSection({ data }: { data: AcademyStudent }) {
  const { academy } = useAcademy()
  const queryClient = useQueryClient()
  const s = data.student
  const optedOut = Boolean(s.face_opt_out_at)
  const set = useMutation({
    mutationFn: async (value: boolean) => {
      await setStudentFaceOptOut(db(), s.id, value)
      // De volta ao reconhecimento: a foto da ficha volta a ser o rosto de referência.
      return value ? false : refreshPhotoReference(s)
    },
    onSuccess: async (fromPhoto, value) => {
      await queryClient.invalidateQueries({ queryKey: keys.all(academy.gym_id) })
      toast(
        value
          ? 'Aluno fora do reconhecimento. Os dados do rosto foram apagados.'
          : fromPhoto
            ? 'Aluno de volta ao reconhecimento facial, com o rosto da foto da ficha.'
            : 'Aluno de volta ao reconhecimento facial.',
      )
    },
    onError: toastError,
  })
  return (
    <Section title="Reconhecimento facial" action={optedOut ? <Badge tone="neutral">Fora</Badge> : <Badge tone="success">Liberado</Badge>}>
      <p className="text-sm text-soft">
        {optedOut
          ? `O aluno pediu para não ser reconhecido pelo rosto (desde ${formatDateBR(s.face_opt_out_at!.slice(0, 10))}). A presença dele é marcada na chamada.`
          : 'Liberado pelo contrato de matrícula, que já traz a autorização de uso de imagem: o aluno pode ser reconhecido nas fotos da turma.'}
      </p>
      <Button
        variant="ghost"
        size="sm"
        className="mt-4"
        loading={set.isPending}
        onPress={() => {
          if (optedOut) set.mutate(false)
          else if (window.confirm(`${s.name} não quer ser reconhecido pelo rosto? Os dados do rosto são apagados na hora (as presenças continuam).`)) set.mutate(true)
        }}
      >
        {optedOut ? 'Liberar de novo' : 'Aluno não quer ser reconhecido'}
      </Button>
    </Section>
  )
}

// ── contratos ────────────────────────────────────────────────────────────────

const PERIOD_LABEL = { vigente: 'Vigente', vencendo: 'Vencendo', vencido: 'Vencido', cancelado: 'Cancelado', suspenso: 'Suspenso', futuro: 'A começar' } as const
const PERIOD_TONE = { vigente: 'success', vencendo: 'warning', vencido: 'danger', cancelado: 'neutral', suspenso: 'neutral', futuro: 'gold' } as const

function ContractsSection({ data }: { data: AcademyStudent }) {
  const contracts = useStudentContracts(data.student.id)
  const [open, setOpen] = useState(false)
  const [cancelling, setCancelling] = useState<ContractRow | null>(null)
  const [extending, setExtending] = useState<ContractRow | null>(null)
  const { academy } = useAcademy()
  const queryClient = useQueryClient()
  const today = todayISO()

  const review = useMutation({
    mutationFn: (c: ContractRow) => updateContractNotes(db(), c.id, { notes: c.notes, review_needed: false }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: keys.all(academy.gym_id) })
      toast('Contrato marcado como revisado.')
    },
    onError: toastError,
  })

  return (
    <Section
      title="Matrícula"
      action={
        <Button size="sm" onPress={() => setOpen(true)}>
          <Plus className="size-4" /> Nova matrícula
        </Button>
      }
    >
      {contracts.isPending ? (
        <Loading />
      ) : contracts.isError ? (
        <ErrorState error={contracts.error} onRetry={() => contracts.refetch()} />
      ) : contracts.data.length === 0 ? (
        <EmptyState title="Sem contrato de matrícula.">Crie a matrícula para gerar as mensalidades.</EmptyState>
      ) : (
        <ul className="space-y-3">
          {contracts.data.map((c) => {
            const period = contractPeriodState(c as ContractRow & { status: 'ativo' | 'suspenso' | 'cancelado' }, today)
            return (
              <li key={c.id} className="rounded-lg border border-line p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={PERIOD_TONE[period]}>{PERIOD_LABEL[period]}</Badge>
                  <Badge tone="neutral">{CONTRACT_BILLING_LABEL[c.billing as keyof typeof CONTRACT_BILLING_LABEL]}</Badge>
                  {c.review_needed ? <Badge tone="gold">Importado: revisar</Badge> : null}
                  <span className="ml-auto text-sm text-dim">
                    {formatDateBR(c.starts_on)} a {formatDateBR(c.ends_on)}
                  </span>
                </div>
                <dl className="mt-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                  <div className="flex justify-between gap-2"><dt className="text-dim">Pagador</dt><dd className="text-right font-semibold">{c.payer?.name}</dd></div>
                  <div className="flex justify-between gap-2"><dt className="text-dim">Plano</dt><dd className="text-right">{c.plan?.name ?? 'Valor livre'}</dd></div>
                  {c.billing === 'mensal' ? (
                    <>
                      <div className="flex justify-between gap-2"><dt className="text-dim">Mensalidade</dt><dd className="text-right font-semibold">{formatBRL(c.amount_cents - c.discount_cents)}{c.discount_cents ? <span className="text-dim"> (desc. {formatBRL(c.discount_cents)})</span> : null}</dd></div>
                      <div className="flex justify-between gap-2"><dt className="text-dim">Vencimento</dt><dd className="text-right">todo dia {c.due_day}</dd></div>
                    </>
                  ) : null}
                  {c.students.length > 1 ? (
                    <div className="flex justify-between gap-2 sm:col-span-2"><dt className="text-dim">Alunos</dt><dd className="text-right">{c.students.map((x) => x.name).join(', ')}</dd></div>
                  ) : null}
                </dl>
                {c.notes ? <p className="mt-2 text-xs text-dim">{c.notes}</p> : null}
                {c.status === 'cancelado' ? (
                  <p className="mt-2 text-xs text-danger">Cancelado: {c.cancel_reason}</p>
                ) : (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {c.review_needed ? (
                      <Button size="sm" variant="ghost" loading={review.isPending} onPress={() => review.mutate(c)}>
                        Marcar como revisado
                      </Button>
                    ) : null}
                    <Button size="sm" variant={period === 'vencendo' || period === 'vencido' ? 'gold' : 'ghost'} onPress={() => setExtending(c)}>
                      Prorrogar contrato
                    </Button>
                    <Button size="sm" variant="plain" onPress={() => setCancelling(c)}>
                      Cancelar contrato
                    </Button>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
      {open ? <ContractDialog open onClose={() => setOpen(false)} data={data} /> : null}
      {cancelling ? <CancelContractDialog contract={cancelling} onClose={() => setCancelling(null)} /> : null}
      {extending ? <ExtendContractDialog contract={extending} onClose={() => setExtending(null)} /> : null}
    </Section>
  )
}

function ExtendContractDialog({ contract, onClose }: { contract: ContractRow; onClose: () => void }) {
  const { academy } = useAcademy()
  const queryClient = useQueryClient()
  const [endsOn, setEndsOn] = useState(() => contractExtensionEnd(contract.ends_on))
  const issue = contractExtensionIssue(contract.ends_on, endsOn)
  const drafts = useMemo(() => (issue ? [] : contractExtensionCharges(contractTermsOf(contract), endsOn)), [issue, contract, endsOn])
  const total = drafts.reduce((s, d) => s + d.amountCents, 0)
  const extend = useMutation({
    mutationFn: () => extendContract(db(), contract, endsOn),
    onSuccess: async (n) => {
      await queryClient.invalidateQueries({ queryKey: keys.all(academy.gym_id) })
      toast(`Contrato prorrogado até ${formatDateBR(endsOn)}. ${n} ${n === 1 ? 'cobrança criada' : 'cobranças criadas'}.`)
      onClose()
    },
    onError: toastError,
  })
  return (
    <Dialog
      open
      onClose={onClose}
      title="Prorrogar contrato"
      footer={
        <>
          <Button variant="plain" onPress={onClose}>Voltar</Button>
          <Button disabled={Boolean(issue)} loading={extend.isPending} onPress={() => extend.mutate()}>
            Prorrogar
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-soft">
          Vigência atual: {formatDateBR(contract.starts_on)} a <strong className="text-text">{formatDateBR(contract.ends_on)}</strong>.
        </p>
        <Field label="Prorrogar até" hint="Sugestão: mais 1 ano. Pode trocar a data.">
          <DateInput value={endsOn} min={contract.ends_on} onChange={(e) => setEndsOn(e.target.value)} />
        </Field>
        {issue ? (
          <FormMessage message={{ text: issue, error: true }} />
        ) : contract.billing !== 'mensal' ? (
          <p className="text-sm text-soft">
            {CONTRACT_BILLING_LABEL[contract.billing as keyof typeof CONTRACT_BILLING_LABEL]}: só muda a vigência, sem mensalidades.
          </p>
        ) : (
          <p className="text-sm text-soft">
            Cria <strong className="text-text">{drafts.length} {drafts.length === 1 ? 'mensalidade' : 'mensalidades'}</strong> de{' '}
            {formatBRL(contract.amount_cents - contract.discount_cents)}
            {drafts.length ? <> (de {formatDateBR(drafts[0]!.dueOn)} a {formatDateBR(drafts.at(-1)!.dueOn)}), total {formatBRL(total)}</> : null}.
          </p>
        )}
      </div>
    </Dialog>
  )
}

function CancelContractDialog({ contract, onClose }: { contract: ContractRow; onClose: () => void }) {
  const { academy } = useAcademy()
  const queryClient = useQueryClient()
  const [reason, setReason] = useState('')
  const [from, setFrom] = useState(todayISO())
  const cancel = useMutation({
    mutationFn: () => cancelContract(db(), contract.id, reason, from),
    onSuccess: async (n) => {
      await queryClient.invalidateQueries({ queryKey: keys.all(academy.gym_id) })
      toast(`Contrato cancelado. ${n} ${n === 1 ? 'cobrança cancelada' : 'cobranças canceladas'}.`)
      onClose()
    },
    onError: toastError,
  })
  return (
    <Dialog
      open
      onClose={onClose}
      title="Cancelar contrato"
      footer={
        <>
          <Button variant="plain" onPress={onClose}>Voltar</Button>
          <Button variant="danger" disabled={!reason.trim()} loading={cancel.isPending} onPress={() => cancel.mutate()}>
            Cancelar contrato
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-soft">
          As cobranças em aberto que vencem a partir da data abaixo são canceladas. As que venceram antes continuam devidas.
        </p>
        <Field label="Motivo">
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex.: mudou de cidade" />
        </Field>
        <Field label="Cancelar cobranças que vencem a partir de">
          <DateInput value={from} onChange={(e) => setFrom(e.target.value)} />
        </Field>
      </div>
    </Dialog>
  )
}

// ── cobranças (visão por aluno) ───────────────────────────────────────────────

const STATE_TONE = { em_aberto: 'gold', atrasada: 'danger', paga: 'success', cancelada: 'neutral' } as const

function ChargesSection({ studentId }: { studentId: string }) {
  const charges = useStudentCharges(studentId)
  const totals = useMemo(() => chargeTotals(charges.data ?? []), [charges.data])
  return (
    <Section title="Mensalidades">
      {charges.isPending ? (
        <Loading />
      ) : charges.isError ? (
        <ErrorState error={charges.error} onRetry={() => charges.refetch()} />
      ) : charges.data.length === 0 ? (
        <EmptyState title="Nenhuma cobrança." />
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Pagas" value={formatBRL(totals.paga.cents)} tone="success" />
            <Stat label="Em aberto" value={formatBRL(totals.em_aberto.cents)} />
            <Stat label="Atrasadas" value={formatBRL(totals.atrasada.cents)} tone={totals.atrasada.count ? 'danger' : undefined} />
          </div>
          <ul className="mt-4 divide-y divide-line">
            {charges.data.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 text-sm">
                <span className="w-24 text-soft">{formatDateBR(c.due_on)}</span>
                <span className="min-w-0 flex-1 truncate text-text">
                  {c.description ?? CHARGE_KIND_LABEL[c.kind as keyof typeof CHARGE_KIND_LABEL]}
                  {c.installment ? <span className="text-dim"> · {c.installment}/{c.installments_total}</span> : null}
                  {c.state === 'paga' && c.paid_on ? (
                    <span className="block text-xs text-dim">
                      Pago em {formatDateBR(c.paid_on)}
                      {c.payment_method && c.payment_method !== 'outro' ? ` · ${PAYMENT_METHOD_LABEL[c.payment_method as keyof typeof PAYMENT_METHOD_LABEL]}` : ''}
                    </span>
                  ) : null}
                  {c.state === 'atrasada' ? <span className="block text-xs text-danger">{c.days_late} dias de atraso</span> : null}
                </span>
                <span className="font-semibold">{formatBRL(c.state === 'paga' ? (c.paid_cents ?? c.amount_cents) : c.amount_cents)}</span>
                <Badge tone={STATE_TONE[c.state]}>{CHARGE_STATE_LABEL[c.state]}</Badge>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-dim">A baixa de pagamento chega na etapa do financeiro (Mensalidades).</p>
        </>
      )}
    </Section>
  )
}

// ── responsáveis ─────────────────────────────────────────────────────────────

function GuardiansSection({ data }: { data: AcademyStudent }) {
  const { academy } = useAcademy()
  const queryClient = useQueryClient()
  const payers = usePayers()
  const [adding, setAdding] = useState(false)
  const [choice, setChoice] = useState('new')
  const [relationship, setRelationship] = useState('')
  const [form, setForm] = useState({ name: '', cpf: '', phone: '', email: '' })
  const minor = isMinor(data.student.birth_date, todayISO())

  const add = useMutation({
    mutationFn: async () => {
      const cpf = form.cpf.replace(/\D/g, '')
      if (choice === 'new' && cpf && !isValidCpf(cpf)) throw new Error('CPF do responsável inválido.')
      const payerId =
        choice === 'new'
          ? await savePayer(db(), academy.gym_id, null, { name: form.name.trim(), cpf: cpf || null, phone: form.phone.trim() || null, email: form.email.trim().toLowerCase() || null, notes: null })
          : choice
      await linkGuardian(db(), data.student.id, payerId, relationship, true)
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: keys.all(academy.gym_id) })
      toast('Responsável vinculado.')
      setAdding(false)
      setForm({ name: '', cpf: '', phone: '', email: '' })
      setRelationship('')
    },
    onError: toastError,
  })
  const remove = useMutation({
    mutationFn: (payerId: string) => unlinkGuardian(db(), data.student.id, payerId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.all(academy.gym_id) }),
    onError: toastError,
  })

  return (
    <Section
      title="Responsáveis"
      action={
        <Button size="sm" variant="ghost" onPress={() => setAdding(true)}>
          <Plus className="size-4" /> Adicionar
        </Button>
      }
    >
      {data.guardians.length === 0 ? (
        <p className="text-sm text-soft">
          {minor ? 'Aluno menor sem responsável cadastrado. O responsável legal assina o contrato.' : 'Nenhum responsável. O próprio aluno responde pelo contrato.'}
        </p>
      ) : (
        <ul className="divide-y divide-line">
          {data.guardians.map((g) => (
            <li key={g.payer.id} className="flex items-start gap-2 py-2.5 text-sm">
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-text">{g.payer.name}</p>
                <p className="text-xs text-dim">
                  {[g.relationship, g.payer.phone, g.payer.cpf ? formatCpf(g.payer.cpf) : null].filter(Boolean).join(' · ') || 'Sem contato'}
                </p>
              </div>
              <button type="button" className="text-xs font-semibold text-dim hover:text-danger" onClick={() => remove.mutate(g.payer.id)}>
                Desvincular
              </button>
            </li>
          ))}
        </ul>
      )}
      <Dialog
        open={adding}
        onClose={() => setAdding(false)}
        title="Adicionar responsável"
        footer={
          <>
            <Button variant="plain" onPress={() => setAdding(false)}>Cancelar</Button>
            <Button disabled={choice === 'new' && form.name.trim().length < 3} loading={add.isPending} onPress={() => add.mutate()}>
              Vincular
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Responsável">
            <Select value={choice} onChange={(e) => setChoice(e.target.value)}>
              <option value="new">+ Cadastrar novo</option>
              {(payers.data ?? [])
                .filter((p) => !p.student_id && !data.guardians.some((g) => g.payer.id === p.id))
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
            </Select>
          </Field>
          {choice === 'new' ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Nome completo" className="sm:col-span-2">
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </Field>
              <Field label="CPF">
                <Input inputMode="numeric" value={form.cpf} onChange={(e) => setForm({ ...form, cpf: e.target.value })} />
              </Field>
              <Field label="WhatsApp">
                <Input inputMode="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </Field>
              <Field label="E-mail" className="sm:col-span-2">
                <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </Field>
            </div>
          ) : null}
          <Field label="Parentesco">
            <Input placeholder="Mãe, pai, avó…" value={relationship} onChange={(e) => setRelationship(e.target.value)} />
          </Field>
        </div>
      </Dialog>
    </Section>
  )
}

// ── graduação ─────────────────────────────────────────────────────────────────

function GraduationSection({ data }: { data: AcademyStudent }) {
  const { academy, isAdmin } = useAcademy()
  const queryClient = useQueryClient()
  const ranks = useRanks()
  const belts = useBeltRanks()
  const [kind, setKind] = useState<'mt' | 'jj' | null>(null)
  const [rankId, setRankId] = useState('')
  const [degrees, setDegrees] = useState(0)
  const [date, setDate] = useState(todayISO())
  const mt = data.graduations[0]
  const jj = data.belts[0]
  const track = data.student.track === 'infantil' ? 'infantil' : 'adulto'

  const save = useMutation({
    mutationFn: async () => {
      if (kind === 'mt') await addGraduation(db(), { student_id: data.student.id, rank_id: rankId, graduated_at: date, notes: null })
      else await addStudentBelt(db(), { student_id: data.student.id, belt_rank_id: rankId, degrees, graduated_at: date })
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: keys.all(academy.gym_id) })
      toast('Graduação registrada.')
      setKind(null)
    },
    onError: toastError,
  })

  const options =
    kind === 'mt'
      ? (ranks.data ?? []).filter((r) => r.track === track).map((r) => ({ id: r.id, label: r.name }))
      : (belts.data ?? []).filter((b) => b.track === track).map((b) => ({ id: b.id, label: b.name }))

  return (
    <Section title="Graduação">
      <div className="space-y-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-dim">Muay Thai</p>
          {mt?.rank ? (
            <div className="mt-1.5 flex items-center gap-3">
              <RankBand colors={mt.rank.colors} />
              <div>
                <p className="font-semibold text-text">{mt.rank.name}</p>
                <p className="text-xs text-dim">{mt.notes?.includes('não informada') ? 'Data não informada (importado)' : `desde ${formatDateBR(mt.graduated_at)}`}</p>
              </div>
            </div>
          ) : (
            <p className="mt-1 text-sm text-soft">Sem graduação registrada.</p>
          )}
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-dim">Jiu-Jitsu</p>
          {jj?.rank ? (
            <div className="mt-1.5 flex items-center gap-3">
              <RankBand colors={jj.rank.colors} />
              <div>
                <p className="font-semibold text-text">
                  {jj.rank.name}
                  {jj.degrees ? ` · ${jj.degrees} ${jj.degrees === 1 ? 'grau' : 'graus'}` : ''}
                </p>
                <p className="text-xs text-dim">{jj.date_unknown ? 'Data não informada (importado)' : `desde ${formatDateBR(jj.graduated_at)}`}</p>
              </div>
            </div>
          ) : (
            <p className="mt-1 text-sm text-soft">Sem faixa registrada.</p>
          )}
        </div>
        {isAdmin ? (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="ghost" onPress={() => { setKind('mt'); setRankId('') }}>Graduar no muay thai</Button>
            <Button size="sm" variant="ghost" onPress={() => { setKind('jj'); setRankId(''); setDegrees(0) }}>Graduar no jiu-jitsu</Button>
          </div>
        ) : null}
      </div>
      <Dialog
        open={kind !== null}
        onClose={() => setKind(null)}
        title={kind === 'mt' ? 'Graduação de muay thai' : 'Faixa de jiu-jitsu'}
        footer={
          <>
            <Button variant="plain" onPress={() => setKind(null)}>Cancelar</Button>
            <Button disabled={!rankId} loading={save.isPending} onPress={() => save.mutate()}>Registrar</Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-dim">Trilha {track === 'infantil' ? 'infantil' : 'adulta'} (pela idade cadastrada do aluno).</p>
          <Field label={kind === 'mt' ? 'Grau' : 'Faixa'}>
            <Select value={rankId} onChange={(e) => setRankId(e.target.value)}>
              <option value="">Escolha…</option>
              {options.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Field>
          {kind === 'jj' ? (
            <Field label="Graus na faixa">
              <Select value={String(degrees)} onChange={(e) => setDegrees(Number(e.target.value))}>
                {[0, 1, 2, 3, 4].map((d) => (
                  <option key={d} value={d}>
                    {d === 0 ? 'Sem grau' : `${d} ${d === 1 ? 'grau' : 'graus'}`}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}
          <Field label="Data da graduação">
            <DateInput value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
        </div>
      </Dialog>
    </Section>
  )
}
