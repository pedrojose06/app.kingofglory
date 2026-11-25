'use client'

import { formatBRL, type Plan, type PlanInput, savePlan } from '@kog/core'
import { Badge, Button, EmptyState, Field, Input, Textarea } from '@kog/ui'
import { toast, toastError } from '@kog/web-kit'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { useState } from 'react'
import { Dialog, MoneyInput, RegistryTabs } from '@/components/kit'
import { PageHeader } from '@/components/shell'
import { ErrorState, FormMessage, Loading } from '@/components/states'
import { useAcademy } from '@/lib/academy'
import { keys, usePlans } from '@/lib/queries'
import { db } from '@/lib/supabase'

export default function PlansPage() {
  const { academy, isAdmin } = useAcademy()
  const plans = usePlans()
  const [editing, setEditing] = useState<Plan | 'new' | null>(null)

  return (
    <>
      <PageHeader
        kicker={academy.name}
        title="Cadastros"
        actions={
          isAdmin ? (
            <Button onPress={() => setEditing('new')}>
              <Plus className="size-4" /> Novo plano
            </Button>
          ) : null
        }
      />
      <RegistryTabs />
      {plans.isPending ? (
        <Loading />
      ) : plans.isError ? (
        <ErrorState error={plans.error} onRetry={() => plans.refetch()} />
      ) : plans.data.length === 0 ? (
        <EmptyState title="Nenhum plano cadastrado.">
          O plano preenche valor, duração e taxa de matrícula na hora de matricular. Os contratos importados do DojoWeb ficaram sem plano
          (com o valor de cada um).
        </EmptyState>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {plans.data.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                disabled={!isAdmin}
                onClick={() => setEditing(p)}
                className="block h-full w-full rounded-lg border border-line bg-surface p-4 text-left hover:border-line-strong disabled:cursor-default"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold text-text">{p.name}</p>
                  {!p.active ? <Badge tone="neutral">Inativo</Badge> : null}
                </div>
                <p className="mt-2 font-display text-2xl text-accent">{formatBRL(p.price_cents)}<span className="text-sm text-dim"> /mês</span></p>
                <p className="mt-1 text-xs text-dim">
                  {p.duration_months} {p.duration_months === 1 ? 'mês' : 'meses'}
                  {p.enrollment_fee_cents ? ` · matrícula ${formatBRL(p.enrollment_fee_cents)}` : ' · sem taxa de matrícula'}
                </p>
                {p.description ? <p className="mt-2 text-sm text-soft">{p.description}</p> : null}
              </button>
            </li>
          ))}
        </ul>
      )}
      {editing ? <PlanDialog plan={editing === 'new' ? null : editing} onClose={() => setEditing(null)} /> : null}
    </>
  )
}

function PlanDialog({ plan, onClose }: { plan: Plan | null; onClose: () => void }) {
  const { academy } = useAcademy()
  const queryClient = useQueryClient()
  const [form, setForm] = useState<Omit<PlanInput, 'price_cents' | 'enrollment_fee_cents'> & { price: number | null; fee: number | null }>({
    name: plan?.name ?? '',
    description: plan?.description ?? '',
    duration_months: plan?.duration_months ?? 12,
    active: plan?.active ?? true,
    price: plan?.price_cents ?? null,
    fee: plan?.enrollment_fee_cents ?? 0,
  })
  const [error, setError] = useState<string | null>(null)
  const save = useMutation({
    mutationFn: () =>
      savePlan(db(), academy.gym_id, plan?.id ?? null, {
        name: form.name.trim(),
        description: form.description?.trim() || null,
        duration_months: form.duration_months,
        active: form.active,
        price_cents: form.price ?? 0,
        enrollment_fee_cents: form.fee ?? 0,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: keys.plans(academy.gym_id) })
      toast('Plano salvo.')
      onClose()
    },
    onError: toastError,
  })
  function submit() {
    const issue = !form.name.trim() ? 'Informe o nome do plano.' : form.price == null ? 'Informe o valor mensal.' : null
    setError(issue)
    if (!issue) save.mutate()
  }
  return (
    <Dialog
      open
      onClose={onClose}
      title={plan ? 'Editar plano' : 'Novo plano'}
      footer={
        <>
          <Button variant="plain" onPress={onClose}>Cancelar</Button>
          <Button loading={save.isPending} onPress={submit}>Salvar</Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nome" className="sm:col-span-2">
          <Input placeholder="Ex.: Muay Thai 3x por semana" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
        <Field label="Valor mensal">
          <MoneyInput value={form.price} onChange={(price) => setForm({ ...form, price })} />
        </Field>
        <Field label="Duração (meses)">
          <Input type="number" min={1} max={60} value={form.duration_months} onChange={(e) => setForm({ ...form, duration_months: Math.max(1, Math.min(60, Number(e.target.value) || 1)) })} />
        </Field>
        <Field label="Taxa de matrícula">
          <MoneyInput value={form.fee} onChange={(fee) => setForm({ ...form, fee })} />
        </Field>
        <Field label="Descrição" className="sm:col-span-2">
          <Textarea value={form.description ?? ''} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </Field>
        <label className="flex items-center gap-2 text-sm text-soft sm:col-span-2">
          <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} className="size-4 accent-[var(--kog-gold)]" />
          Plano ativo (aparece na matrícula). Mudar o plano não altera contratos já feitos.
        </label>
        {error ? (
          <div className="sm:col-span-2">
            <FormMessage message={{ text: error, error: true }} />
          </div>
        ) : null}
      </div>
    </Dialog>
  )
}
