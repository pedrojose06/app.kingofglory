'use client'

import {
  addMonths, CHARGE_KIND_LABEL, type ChargeKind, type ChargeList, type ChargeOverview, formatBRL, formatDateBR, formatMonth, PAYMENT_METHOD_LABEL,
  type PaymentMethod, todayISO,
} from '@kog/core'
import { Badge, Button, Card, Chip, EmptyState } from '@kog/ui'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Suspense, useState } from 'react'
import { PageHeader } from '@/components/shell'
import { ErrorState, Loading } from '@/components/states'
import { useAcademy } from '@/lib/academy'
import { useAcademyCharges, useActiveStudentIds } from '@/lib/queries'

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

  const open = useAcademyCharges('em_aberto', month)
  const late = useAcademyCharges('atrasadas', month)
  const paid = useAcademyCharges('pagas', month)
  const active = useActiveStudentIds()
  const query = tab === 'em_aberto' ? open : tab === 'atrasadas' ? late : paid

  // A cobrança é de ex-aluno quando nenhum aluno dela está ativo (o DojoWeb deixa essas fora das contas).
  const isCurrent = (c: ChargeOverview) => !active || c.student_ids.some((id) => active.has(id))
  const lateCurrent = (late.data ?? []).filter(isCurrent)
  const former = (late.data?.length ?? 0) - lateCurrent.length
  const rows = tab === 'atrasadas' && !withFormer ? lateCurrent : (query.data ?? [])
  const total = rows.reduce((sum, c) => sum + (tab === 'pagas' ? (c.paid_cents ?? c.amount_cents) : c.amount_cents), 0)
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
        <EmptyState title={tab === 'atrasadas' ? 'Nenhuma cobrança em atraso.' : tab === 'pagas' ? 'Nenhum pagamento neste mês.' : 'Nenhuma cobrança em aberto neste mês.'} />
      ) : (
        <>
          <p className="mb-2 text-sm text-dim">
            {rows.length} {rows.length === 1 ? 'cobrança' : 'cobranças'} · <span className="font-bold text-text">{formatBRL(total)}</span>
          </p>
          <Card className="overflow-hidden">
            <ul className="divide-y divide-line">
              {rows.map((c) => (
                <ChargeRow key={c.id} charge={c} tab={tab} former={!isCurrent(c)} />
              ))}
            </ul>
          </Card>
        </>
      )}
    </>
  )
}

function ChargeRow({ charge: c, tab, former }: { charge: ChargeOverview; tab: ChargeList; former: boolean }) {
  const names = c.student_names.length > 0 ? c.student_names.join(', ') : c.payer_name
  const what = c.kind === 'avulsa' && c.description ? c.description : CHARGE_KIND_LABEL[c.kind as ChargeKind] ?? c.kind
  const competence = c.competence ? ` · ${formatMonth(c.competence.slice(0, 7))}` : ''
  const installment = c.installment && c.installments_total && c.installments_total > 1 ? ` · ${c.installment}/${c.installments_total}` : ''
  const body = (
    <>
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold text-text">
          {names}
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
    </>
  )
  const cls = 'flex items-center gap-3 px-4 py-3'
  const studentId = c.student_ids[0]
  return (
    <li>
      {studentId ? (
        <Link href={`/aluno?id=${studentId}`} className={`${cls} hover:bg-surface-2`}>{body}</Link>
      ) : (
        <div className={cls}>{body}</div>
      )}
    </li>
  )
}
