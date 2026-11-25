'use client'

import {
  type AcademyStudent, buildContractCharges, CHARGE_KIND_LABEL, CONTRACT_BILLING_LABEL, type ContractBilling, contractEndFor, contractIssue,
  createContract, ensureSelfPayer, formatBRL, formatDateBR, isMinor, linkGuardian, savePayer, SUGGESTED_DUE_DAYS, todayISO,
} from '@kog/core'
import { Button, DateInput, Field, Input, Select, Textarea } from '@kog/ui'
import { toast, toastError } from '@kog/web-kit'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { useAcademy } from '@/lib/academy'
import { keys, usePayers, usePlans, useStudents } from '@/lib/queries'
import { db } from '@/lib/supabase'
import { Dialog, MoneyInput } from './kit'
import { FormMessage } from './states'

type PayerChoice = 'self' | 'new' | string

export function ContractDialog({ open, onClose, data }: { open: boolean; onClose: () => void; data: AcademyStudent }) {
  const { academy } = useAcademy()
  const queryClient = useQueryClient()
  const plans = usePlans()
  const payers = usePayers()
  const allStudents = useStudents()
  const student = data.student
  const today = todayISO()
  const minor = isMinor(student.birth_date, today)

  const [payer, setPayer] = useState<PayerChoice>(data.guardians[0]?.payer.id ?? (minor ? 'new' : 'self'))
  const [newPayer, setNewPayer] = useState({ name: '', cpf: '', phone: '', email: '', relationship: '' })
  const [planId, setPlanId] = useState('')
  const [billing, setBilling] = useState<ContractBilling>('mensal')
  const [startsOn, setStartsOn] = useState(today)
  const [months, setMonths] = useState(12)
  const [endsOn, setEndsOn] = useState(contractEndFor(today, 12))
  const [dueDay, setDueDay] = useState<number>(10)
  const [customDay, setCustomDay] = useState(false)
  const [amount, setAmount] = useState<number | null>(null)
  const [discount, setDiscount] = useState<number | null>(0)
  const [fee, setFee] = useState<number | null>(0)
  const [notes, setNotes] = useState('')
  const [extra, setExtra] = useState<string[]>([])

  const otherPayers = useMemo(() => {
    const own = new Set(data.guardians.map((g) => g.payer.id))
    return (payers.data ?? []).filter((p) => !own.has(p.id) && p.student_id !== student.id)
  }, [payers.data, data.guardians, student.id])

  function pickPlan(id: string) {
    setPlanId(id)
    const p = plans.data?.find((x) => x.id === id)
    if (!p) return
    setAmount(p.price_cents)
    setFee(p.enrollment_fee_cents)
    setMonths(p.duration_months)
    setEndsOn(contractEndFor(startsOn, p.duration_months))
  }

  const terms = {
    billing,
    startsOn,
    endsOn,
    dueDay,
    amountCents: billing === 'mensal' ? (amount ?? 0) : 0,
    discountCents: billing === 'mensal' ? (discount ?? 0) : 0,
    enrollmentFeeCents: fee ?? 0,
  }
  const issue = contractIssue(terms)
  const drafts = useMemo(() => (issue ? [] : buildContractCharges(terms)), [issue, terms.billing, startsOn, endsOn, dueDay, terms.amountCents, terms.discountCents, terms.enrollmentFeeCents]) // eslint-disable-line react-hooks/exhaustive-deps
  const total = drafts.reduce((s, d) => s + d.amountCents, 0)

  const payerIssue =
    payer === 'new' && newPayer.name.trim().length < 3
      ? 'Informe o nome do responsável.'
      : payer === 'new' && newPayer.cpf && newPayer.cpf.replace(/\D/g, '').length !== 11
        ? 'CPF do responsável deve ter 11 dígitos.'
        : payer === 'self' && minor
          ? 'Aluno menor de idade: escolha ou cadastre o responsável.'
          : null

  const save = useMutation({
    mutationFn: async () => {
      let payerId = payer
      if (payer === 'self') {
        payerId = await ensureSelfPayer(db(), academy.gym_id, student, data.details)
      } else if (payer === 'new') {
        payerId = await savePayer(db(), academy.gym_id, null, {
          name: newPayer.name.trim(),
          cpf: newPayer.cpf.replace(/\D/g, '') || null,
          phone: newPayer.phone.trim() || null,
          email: newPayer.email.trim().toLowerCase() || null,
          notes: null,
        })
        await linkGuardian(db(), student.id, payerId, newPayer.relationship, true)
      }
      return createContract(db(), {
        ...terms,
        payerId,
        planId: planId || null,
        studentIds: [student.id, ...extra],
        notes: notes.trim() || null,
      })
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: keys.all(academy.gym_id) })
      toast(`Matrícula criada com ${drafts.length} ${drafts.length === 1 ? 'cobrança' : 'cobranças'}.`)
      onClose()
    },
    onError: toastError,
  })

  const blocked = Boolean(issue || payerIssue)

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Nova matrícula"
      wide
      footer={
        <>
          <Button variant="plain" onPress={onClose}>
            Cancelar
          </Button>
          <Button disabled={blocked} loading={save.isPending} onPress={() => save.mutate()}>
            Criar matrícula
          </Button>
        </>
      }
    >
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-4">
          <Field label="Quem paga">
            <Select value={payer} onChange={(e) => setPayer(e.target.value)}>
              <option value="self">O próprio aluno ({student.name})</option>
              {data.guardians.map((g) => (
                <option key={g.payer.id} value={g.payer.id}>
                  {g.payer.name} {g.relationship ? `(${g.relationship})` : ''}
                </option>
              ))}
              {otherPayers.length ? (
                <optgroup label="Outros responsáveis da academia">
                  {otherPayers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </optgroup>
              ) : null}
              <option value="new">+ Cadastrar novo responsável</option>
            </Select>
          </Field>
          {payer === 'new' ? (
            <div className="grid gap-3 rounded-lg border border-line bg-surface p-3 sm:grid-cols-2">
              <Field label="Nome do responsável" className="sm:col-span-2">
                <Input value={newPayer.name} onChange={(e) => setNewPayer({ ...newPayer, name: e.target.value })} />
              </Field>
              <Field label="Parentesco">
                <Input placeholder="Mãe, pai, avó…" value={newPayer.relationship} onChange={(e) => setNewPayer({ ...newPayer, relationship: e.target.value })} />
              </Field>
              <Field label="CPF">
                <Input inputMode="numeric" value={newPayer.cpf} onChange={(e) => setNewPayer({ ...newPayer, cpf: e.target.value })} />
              </Field>
              <Field label="WhatsApp">
                <Input inputMode="tel" value={newPayer.phone} onChange={(e) => setNewPayer({ ...newPayer, phone: e.target.value })} />
              </Field>
              <Field label="E-mail">
                <Input type="email" value={newPayer.email} onChange={(e) => setNewPayer({ ...newPayer, email: e.target.value })} />
              </Field>
            </div>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Plano" className="sm:col-span-2">
              <Select value={planId} onChange={(e) => pickPlan(e.target.value)}>
                <option value="">Sem plano (valor livre)</option>
                {(plans.data ?? [])
                  .filter((p) => p.active)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} · {formatBRL(p.price_cents)}
                    </option>
                  ))}
              </Select>
            </Field>
            <Field label="Tipo">
              <Select value={billing} onChange={(e) => setBilling(e.target.value as ContractBilling)}>
                {(Object.keys(CONTRACT_BILLING_LABEL) as ContractBilling[]).map((b) => (
                  <option key={b} value={b}>
                    {CONTRACT_BILLING_LABEL[b]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Início">
              <DateInput
                value={startsOn}
                onChange={(e) => {
                  setStartsOn(e.target.value)
                  if (e.target.value) setEndsOn(contractEndFor(e.target.value, months))
                }}
              />
            </Field>
            <Field label="Duração (meses)">
              <Input
                type="number"
                min={1}
                max={60}
                value={months}
                onChange={(e) => {
                  const m = Math.max(1, Math.min(60, Number(e.target.value) || 1))
                  setMonths(m)
                  setEndsOn(contractEndFor(startsOn, m))
                }}
              />
            </Field>
            <Field label="Fim da vigência">
              <DateInput value={endsOn} onChange={(e) => setEndsOn(e.target.value)} />
            </Field>
            <Field label="Dia de vencimento">
              {customDay ? (
                <Input type="number" min={1} max={31} value={dueDay} onChange={(e) => setDueDay(Number(e.target.value))} />
              ) : (
                <Select
                  value={String(dueDay)}
                  onChange={(e) => (e.target.value === 'outro' ? setCustomDay(true) : setDueDay(Number(e.target.value)))}
                >
                  {SUGGESTED_DUE_DAYS.map((d) => (
                    <option key={d} value={d}>
                      Dia {d}
                    </option>
                  ))}
                  <option value="outro">Outro dia…</option>
                </Select>
              )}
            </Field>
          </div>

          {billing === 'mensal' ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Mensalidade">
                <MoneyInput value={amount} onChange={setAmount} required />
              </Field>
              <Field label="Desconto por mês">
                <MoneyInput value={discount} onChange={setDiscount} />
              </Field>
            </div>
          ) : null}
          <Field label="Taxa de matrícula" hint="Vence no início da vigência. Deixe zero se não houver.">
            <MoneyInput value={fee} onChange={setFee} />
          </Field>

          <Field label="Outros alunos no mesmo contrato" hint="Plano família: uma cobrança só, para todos.">
            <Select
              value=""
              onChange={(e) => e.target.value && setExtra((x) => (x.includes(e.target.value) ? x : [...x, e.target.value]))}
            >
              <option value="">Adicionar aluno…</option>
              {(allStudents.data ?? [])
                .filter((s) => s.active && s.id !== student.id && !extra.includes(s.id))
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
            </Select>
          </Field>
          {extra.length ? (
            <ul className="flex flex-wrap gap-2">
              {extra.map((id) => (
                <li key={id}>
                  <button
                    type="button"
                    onClick={() => setExtra((x) => x.filter((y) => y !== id))}
                    className="rounded border border-line px-2 py-1 text-xs font-semibold text-soft hover:border-danger hover:text-danger"
                    title="Remover"
                  >
                    {allStudents.data?.find((s) => s.id === id)?.name} ×
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          <Field label="Observações">
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
        </div>

        <div>
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-dim">Prévia das cobranças</p>
          <div className="mt-2 rounded-lg border border-line bg-surface">
            {issue || payerIssue ? (
              <div className="p-4">
                <FormMessage message={{ text: (payerIssue ?? issue)!, error: true }} />
              </div>
            ) : drafts.length === 0 ? (
              <p className="p-4 text-sm text-soft">
                {billing === 'mensal' ? 'Nenhuma mensalidade cai dentro da vigência.' : `${CONTRACT_BILLING_LABEL[billing]}: não gera mensalidade.`}
              </p>
            ) : (
              <>
                <ul className="max-h-80 divide-y divide-line overflow-y-auto">
                  {drafts.map((d, i) => (
                    <li key={i} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
                      <span className="text-soft">
                        {formatDateBR(d.dueOn)} · {d.kind === 'mensalidade' ? `${d.installment}/${d.installmentsTotal}` : CHARGE_KIND_LABEL[d.kind]}
                      </span>
                      <span className="font-semibold text-text">{formatBRL(d.amountCents)}</span>
                    </li>
                  ))}
                </ul>
                <p className="flex justify-between border-t border-line px-4 py-2.5 text-sm font-bold">
                  <span>
                    {drafts.length} {drafts.length === 1 ? 'cobrança' : 'cobranças'}
                  </span>
                  <span>{formatBRL(total)}</span>
                </p>
              </>
            )}
          </div>
          <p className="mt-2 text-xs text-dim">
            Sem valor proporcional: se o início for depois do dia de vencimento, a primeira mensalidade fica para o mês seguinte. Em
            meses mais curtos, o dia 30/31 vira o último dia do mês.
          </p>
        </div>
      </div>
    </Dialog>
  )
}
