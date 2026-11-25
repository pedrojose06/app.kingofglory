'use client'

import {
  addMonths, CHARGE_KIND_LABEL, type ChargeKind, type ChargeList, type ChargeOverview, formatBRL, formatDateBR, formatMonth, PAYMENT_METHOD_LABEL,
  payCharge, payCharges, type PaymentMethod, reversePayment, todayISO,
} from '@kog/core'
import { Badge, Button, Card, Chip, DateInput, EmptyState, Field, Input, Select } from '@kog/ui'
import { toast, toastError } from '@kog/web-kit'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Suspense, useState } from 'react'
import { Dialog, MoneyInput, SearchInput } from '@/components/kit'
import { PageHeader } from '@/components/shell'
import { ErrorState, Loading } from '@/components/states'
import { useAcademy } from '@/lib/academy'
import { keys, useAcademyCharges, useActiveStudentIds } from '@/lib/queries'
import { db } from '@/lib/supabase'

const strip = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
const matches = (c: ChargeOverview, term: string) => !term || [...c.student_names, c.payer_name].some((n) => strip(n).includes(term))

const TABS: { id: ChargeList; label: string; hint: string }[] = [
  { id: 'em_aberto', label: 'Em aberto', hint: 'Vencem neste mês e ainda estão no prazo.' },
  { id: 'atrasadas', label: 'Atrasadas', hint: 'Todas com o vencimento passado, de qualquer mês.' },
  { id: 'pagas', label: 'Pagas', hint: 'Pagamentos recebidos no mês.' },
]

export default function ChargesPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Charges />
    </Suspense>
  )
}

function Charges() {
  const params = useSearchParams()
  const { academy, isAdmin } = useAcademy()
  const thisMonth = todayISO().slice(0, 7)
  const [tab, setTab] = useState<ChargeList>(() => TABS.find((t) => t.id === params.get('aba'))?.id ?? 'em_aberto')
  const [month, setMonth] = useState(thisMonth)
  const [withFormer, setWithFormer] = useState(false)
  const [q, setQ] = useState('')
  const [paying, setPaying] = useState<ChargeOverview | null>(null)
  const [reversing, setReversing] = useState<ChargeOverview | null>(null)
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const [payingMany, setPayingMany] = useState(false)

  const open = useAcademyCharges('em_aberto', month)
  const late = useAcademyCharges('atrasadas', month)
  const paid = useAcademyCharges('pagas', month)
  const active = useActiveStudentIds()
  const query = tab === 'em_aberto' ? open : tab === 'atrasadas' ? late : paid

  // A cobrança é de ex-aluno quando nenhum aluno dela está ativo (o DojoWeb deixa essas fora das contas).
  const isCurrent = (c: ChargeOverview) => !active || c.student_ids.some((id) => active.has(id))
  const lateCurrent = (late.data ?? []).filter(isCurrent)
  const former = (late.data?.length ?? 0) - lateCurrent.length
  const term = strip(q.trim())
  const rows = (tab === 'atrasadas' && !withFormer ? lateCurrent : (query.data ?? [])).filter((c) => matches(c, term))
  const total = rows.reduce((sum, c) => sum + (tab === 'pagas' ? (c.paid_cents ?? c.amount_cents) : c.amount_cents), 0)
  const selectable = tab !== 'pagas'
  // Só conta o que está na tela: trocar de aba, buscar outro nome ou a cobrança já baixada tira da seleção.
  const picked = selectable ? rows.filter((c) => selected.has(c.id)) : []
  const pickedTotal = picked.reduce((sum, c) => sum + c.amount_cents, 0)
  const allPicked = rows.length > 0 && picked.length === rows.length
  const toggle = (id: string) => {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelected(next)
  }
  const count = (t: ChargeList) => (t === 'em_aberto' ? open.data?.length : t === 'atrasadas' ? lateCurrent.length : paid.data?.length)

  if (!isAdmin) return <EmptyState title="Só o administrador vê as mensalidades." />

  return (
    <>
      <PageHeader kicker={academy.name} title="Mensalidades" />
      <div className="mb-5 flex gap-1 overflow-x-auto border-b border-line">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            aria-pressed={tab === t.id}
            className={`-mb-px flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-bold whitespace-nowrap ${tab === t.id ? 'border-gold text-accent' : 'border-transparent text-dim hover:text-text'}`}
          >
            {t.label}
            {count(t.id) != null ? (
              <span className={`rounded px-1.5 text-xs ${t.id === 'atrasadas' && count(t.id) ? 'bg-danger-tint text-danger' : 'bg-surface-2 text-soft'}`}>{count(t.id)}</span>
            ) : null}
          </button>
        ))}
      </div>

      <div className="mb-3 max-w-md">
        <SearchInput value={q} onChange={setQ} placeholder="Buscar pelo nome do aluno ou do responsável" />
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {tab !== 'atrasadas' ? (
          <>
            <Button variant="ghost" size="sm" aria-label="Mês anterior" onPress={() => setMonth(addMonths(`${month}-01`, -1).slice(0, 7))}>
              <ChevronLeft className="size-4" />
            </Button>
            <p className="min-w-40 text-center text-sm font-bold text-text capitalize">{formatMonth(month)}</p>
            <Button variant="ghost" size="sm" aria-label="Próximo mês" onPress={() => setMonth(addMonths(`${month}-01`, 1).slice(0, 7))}>
              <ChevronRight className="size-4" />
            </Button>
            {month !== thisMonth ? <Button variant="plain" size="sm" onPress={() => setMonth(thisMonth)}>Este mês</Button> : null}
          </>
        ) : (
          <p className="text-sm text-dim">{TABS[1]!.hint}</p>
        )}
        {tab === 'atrasadas' && former > 0 ? (
          <Chip active={withFormer} onPress={() => setWithFormer(!withFormer)} className="ml-auto">
            Incluir ex-alunos ({former})
          </Chip>
        ) : null}
      </div>

      {query.isPending || !active ? (
        <Loading />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState
          title={
            term
              ? 'Ninguém com esse nome nesta lista.'
              : tab === 'atrasadas'
                ? 'Nenhuma cobrança em atraso.'
                : tab === 'pagas'
                  ? 'Nenhum pagamento neste mês.'
                  : 'Nenhuma cobrança em aberto neste mês.'
          }
        />
      ) : (
        <>
          <div className="mb-2 flex min-h-9 flex-wrap items-center gap-3 text-sm text-dim">
            {selectable ? (
              <label className="flex cursor-pointer items-center gap-2 font-semibold text-soft">
                <input
                  type="checkbox"
                  className="size-4 accent-[var(--kog-gold)]"
                  checked={allPicked}
                  onChange={() => setSelected(allPicked ? new Set() : new Set(rows.map((c) => c.id)))}
                />
                Selecionar {term ? 'todas desta busca' : 'todas'}
              </label>
            ) : null}
            {picked.length > 0 ? (
              <>
                <span className="text-text">
                  <span className="font-bold">{picked.length}</span> {picked.length === 1 ? 'selecionada' : 'selecionadas'} ·{' '}
                  <span className="font-bold">{formatBRL(pickedTotal)}</span>
                </span>
                <Button size="sm" onPress={() => setPayingMany(true)}>Dar baixa {picked.length === 1 ? 'nesta' : `nas ${picked.length}`}</Button>
                <Button variant="ghost" size="sm" onPress={() => setSelected(new Set())}>Limpar</Button>
              </>
            ) : (
              <span>
                {rows.length} {rows.length === 1 ? 'cobrança' : 'cobranças'} · <span className="font-bold text-text">{formatBRL(total)}</span>
              </span>
            )}
          </div>
          <Card className="overflow-hidden">
            <ul className="divide-y divide-line">
              {rows.map((c) => (
                <ChargeRow
                  key={c.id}
                  charge={c}
                  tab={tab}
                  former={!isCurrent(c)}
                  checked={selectable ? selected.has(c.id) : undefined}
                  onToggle={() => toggle(c.id)}
                  onPay={() => setPaying(c)}
                  onReverse={() => setReversing(c)}
                />
              ))}
            </ul>
          </Card>
        </>
      )}
      {payingMany ? (
        <PayManyDialog
          charges={picked}
          onClose={() => setPayingMany(false)}
          onDone={() => {
            setPayingMany(false)
            setSelected(new Set())
          }}
        />
      ) : null}
      {paying ? <PayDialog charge={paying} onClose={() => setPaying(null)} /> : null}
      {reversing ? <ReverseDialog charge={reversing} onClose={() => setReversing(null)} /> : null}
    </>
  )
}

/** Depois de uma baixa ou estorno: as três listas, o painel e a ficha do aluno mudam. */
function useRefreshCharges() {
  const { academy } = useAcademy()
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: keys.all(academy.gym_id) })
}

const METHODS: PaymentMethod[] = ['pix', 'dinheiro', 'credito', 'debito', 'transferencia', 'boleto', 'gympass', 'totalpass', 'outro']

function PayDialog({ charge: c, onClose }: { charge: ChargeOverview; onClose: () => void }) {
  const today = todayISO()
  const refresh = useRefreshCharges()
  const [paidOn, setPaidOn] = useState(today)
  const [amount, setAmount] = useState<number | null>(c.amount_cents)
  const [method, setMethod] = useState<PaymentMethod>('pix')
  const [notes, setNotes] = useState('')
  const pay = useMutation({
    mutationFn: () => payCharge(db(), c.id, { paidOn, amountCents: amount ?? 0, method, notes }),
    onSuccess: async () => {
      await refresh()
      toast('Pagamento registrado.')
      onClose()
    },
    onError: toastError,
  })
  const invalid = amount == null || !paidOn || paidOn > today

  return (
    <Dialog
      open
      onClose={onClose}
      title="Dar baixa"
      footer={
        <>
          <Button variant="ghost" onPress={onClose}>Cancelar</Button>
          <Button onPress={() => pay.mutate()} loading={pay.isPending} disabled={invalid}>Confirmar pagamento</Button>
        </>
      }
    >
      <p className="font-semibold text-text">{c.student_names.join(', ') || c.payer_name}</p>
      <p className="mb-4 text-sm text-dim">
        {CHARGE_KIND_LABEL[c.kind as ChargeKind] ?? c.kind}
        {c.competence ? ` · ${formatMonth(c.competence.slice(0, 7))}` : ''} · {c.due_on >= today ? 'vence' : 'venceu'} {formatDateBR(c.due_on)} · {formatBRL(c.amount_cents)}
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Data do pagamento" hint={paidOn > today ? 'Não pode ser depois de hoje.' : undefined}>
          <DateInput value={paidOn} max={today} onChange={(e) => setPaidOn(e.target.value)} />
        </Field>
        <Field label="Valor pago">
          <MoneyInput value={amount} onChange={setAmount} required />
        </Field>
        <Field label="Forma de pagamento" className="sm:col-span-2">
          <Select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
            {METHODS.map((m) => (
              <option key={m} value={m}>{PAYMENT_METHOD_LABEL[m]}</option>
            ))}
          </Select>
        </Field>
        <Field label="Observação (opcional)" className="sm:col-span-2">
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ex.: pagou na recepção" />
        </Field>
      </div>
    </Dialog>
  )
}

function PayManyDialog({ charges, onClose, onDone }: { charges: ChargeOverview[]; onClose: () => void; onDone: () => void }) {
  const today = todayISO()
  const refresh = useRefreshCharges()
  const [paidOn, setPaidOn] = useState(today)
  const [method, setMethod] = useState<PaymentMethod>('pix')
  const [notes, setNotes] = useState('')
  const total = charges.reduce((sum, c) => sum + c.amount_cents, 0)
  const pay = useMutation({
    mutationFn: () => payCharges(db(), charges.map((c) => c.id), { paidOn, method, notes }),
    onSuccess: async (n) => {
      await refresh()
      toast(n === 1 ? 'Pagamento registrado.' : `${n} pagamentos registrados.`)
      onDone()
    },
    onError: toastError,
  })
  const names = [...new Set(charges.flatMap((c) => (c.student_names.length ? c.student_names : [c.payer_name])))]

  return (
    <Dialog
      open
      onClose={onClose}
      title="Dar baixa em lote"
      footer={
        <>
          <Button variant="ghost" onPress={onClose}>Cancelar</Button>
          <Button onPress={() => pay.mutate()} loading={pay.isPending} disabled={!paidOn || paidOn > today}>
            Confirmar {charges.length} {charges.length === 1 ? 'pagamento' : 'pagamentos'}
          </Button>
        </>
      }
    >
      <p className="font-semibold text-text">{names.length <= 3 ? names.join(', ') : `${names.slice(0, 3).join(', ')} e mais ${names.length - 3}`}</p>
      <p className="mb-3 text-sm text-dim">
        {charges.length} {charges.length === 1 ? 'cobrança' : 'cobranças'} · total <span className="font-bold text-text">{formatBRL(total)}</span>. Cada uma é
        baixada pelo próprio valor; tudo entra junto ou nada entra.
      </p>
      <ul className="mb-4 max-h-40 divide-y divide-line overflow-y-auto rounded border border-line text-sm">
        {charges.map((c) => (
          <li key={c.id} className="flex justify-between gap-3 px-3 py-1.5">
            <span className="truncate text-soft">
              {c.competence ? formatMonth(c.competence.slice(0, 7)) : CHARGE_KIND_LABEL[c.kind as ChargeKind] ?? c.kind}
              {names.length > 1 ? ` · ${c.student_names[0] ?? c.payer_name}` : ''}
            </span>
            <span className="shrink-0 text-text">{formatBRL(c.amount_cents)}</span>
          </li>
        ))}
      </ul>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Data do pagamento">
          <DateInput value={paidOn} max={today} onChange={(e) => setPaidOn(e.target.value)} />
        </Field>
        <Field label="Forma de pagamento">
          <Select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
            {METHODS.map((m) => (
              <option key={m} value={m}>{PAYMENT_METHOD_LABEL[m]}</option>
            ))}
          </Select>
        </Field>
        <Field label="Observação (opcional)" className="sm:col-span-2">
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ex.: quitou os atrasados" />
        </Field>
      </div>
    </Dialog>
  )
}

function ReverseDialog({ charge: c, onClose }: { charge: ChargeOverview; onClose: () => void }) {
  const refresh = useRefreshCharges()
  const [reason, setReason] = useState('')
  const reverse = useMutation({
    mutationFn: () => reversePayment(db(), c.id, reason),
    onSuccess: async () => {
      await refresh()
      toast('Baixa desfeita: a cobrança voltou a ficar em aberto.')
      onClose()
    },
    onError: toastError,
  })
  return (
    <Dialog
      open
      onClose={onClose}
      title="Desfazer baixa"
      footer={
        <>
          <Button variant="ghost" onPress={onClose}>Voltar</Button>
          <Button onPress={() => reverse.mutate()} loading={reverse.isPending} disabled={!reason.trim()}>Desfazer</Button>
        </>
      }
    >
      <p className="mb-4 text-sm text-soft">
        O pagamento de <span className="font-semibold text-text">{c.student_names.join(', ') || c.payer_name}</span> (
        {formatBRL(c.paid_cents ?? c.amount_cents)} em {c.paid_on ? formatDateBR(c.paid_on) : '—'}) fica registrado como estornado e a cobrança
        volta para em aberto ou atrasada.
      </p>
      <Field label="Motivo">
        <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex.: baixa no aluno errado" autoFocus />
      </Field>
    </Dialog>
  )
}

function ChargeRow({ charge: c, tab, former, checked, onToggle, onPay, onReverse }: {
  charge: ChargeOverview
  tab: ChargeList
  former: boolean
  /** undefined = lista sem seleção (Pagas). */
  checked: boolean | undefined
  onToggle: () => void
  onPay: () => void
  onReverse: () => void
}) {
  const names = c.student_names.length > 0 ? c.student_names.join(', ') : c.payer_name
  const what = c.kind === 'avulsa' && c.description ? c.description : CHARGE_KIND_LABEL[c.kind as ChargeKind] ?? c.kind
  const competence = c.competence ? ` · ${formatMonth(c.competence.slice(0, 7))}` : ''
  const installment = c.installment && c.installments_total && c.installments_total > 1 ? ` · ${c.installment}/${c.installments_total}` : ''
  const studentId = c.student_ids[0]
  return (
    <li className={`flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 ${checked ? 'bg-tint' : ''}`}>
      {checked !== undefined ? (
        <input
          type="checkbox"
          className="size-4 shrink-0 cursor-pointer accent-[var(--kog-gold)]"
          checked={checked}
          onChange={onToggle}
          aria-label={`Selecionar ${names}${competence}`}
        />
      ) : null}
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold text-text">
          {studentId ? <Link href={`/aluno?id=${studentId}`} className="hover:underline">{names}</Link> : names}
          {former ? <Badge tone="neutral" className="ml-2">Ex-aluno</Badge> : null}
        </p>
        <p className="mt-0.5 truncate text-xs text-dim">
          {what}
          {competence}
          {installment}
          {c.student_names.length > 0 && !c.student_names.includes(c.payer_name) ? ` · paga: ${c.payer_name}` : ''}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p className="font-bold text-text">{formatBRL(tab === 'pagas' ? (c.paid_cents ?? c.amount_cents) : c.amount_cents)}</p>
        <p className={`mt-0.5 text-xs ${tab === 'atrasadas' ? 'text-danger' : 'text-dim'}`}>
          {tab === 'pagas'
            ? `pago em ${c.paid_on ? formatDateBR(c.paid_on) : '—'}${c.payment_method && c.payment_method !== 'outro' ? ` · ${PAYMENT_METHOD_LABEL[c.payment_method as PaymentMethod] ?? c.payment_method}` : ''}`
            : tab === 'atrasadas'
              ? `venceu ${formatDateBR(c.due_on)} · ${c.days_late} ${c.days_late === 1 ? 'dia' : 'dias'}`
              : `vence ${formatDateBR(c.due_on)}`}
        </p>
      </div>
      {tab === 'pagas' ? (
        <Button variant="ghost" size="sm" onPress={onReverse}>Desfazer</Button>
      ) : (
        <Button size="sm" onPress={onPay}>Dar baixa</Button>
      )}
    </li>
  )
}
