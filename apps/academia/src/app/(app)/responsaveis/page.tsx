'use client'

import { formatCpf, isValidCpf, type PayerRow, savePayer } from '@kog/core'
import { Badge, Button, EmptyState, Field, Input, Textarea } from '@kog/ui'
import { toast, toastError } from '@kog/web-kit'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import Link from 'next/link'
import { useMemo, useState } from 'react'
import { Dialog, RegistryTabs, SearchInput } from '@/components/kit'
import { PageHeader } from '@/components/shell'
import { ErrorState, FormMessage, Loading } from '@/components/states'
import { useAcademy } from '@/lib/academy'
import { keys, usePayers } from '@/lib/queries'
import { db } from '@/lib/supabase'

const strip = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export default function PayersPage() {
  const { academy, isAdmin } = useAcademy()
  const payers = usePayers()
  const [q, setQ] = useState('')
  const [onlyGuardians, setOnlyGuardians] = useState(true)
  const [editing, setEditing] = useState<PayerRow | 'new' | null>(null)

  const rows = useMemo(() => {
    const term = strip(q.trim())
    return (payers.data ?? []).filter((p) => {
      if (onlyGuardians && p.student_id) return false
      return !term || strip(p.name).includes(term) || p.students.some((s) => strip(s.name).includes(term))
    })
  }, [payers.data, q, onlyGuardians])

  if (!isAdmin) return <EmptyState title="Só o administrador vê os responsáveis." />

  return (
    <>
      <PageHeader
        kicker={academy.name}
        title="Cadastros"
        actions={
          <Button onPress={() => setEditing('new')}>
            <Plus className="size-4" /> Novo responsável
          </Button>
        }
      />
      <RegistryTabs />
      <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
        <SearchInput value={q} onChange={setQ} placeholder="Buscar por responsável ou aluno" />
        <label className="flex items-center gap-2 text-sm text-soft">
          <input type="checkbox" checked={onlyGuardians} onChange={(e) => setOnlyGuardians(e.target.checked)} className="size-4 accent-[var(--kog-gold)]" />
          Esconder alunos que pagam a própria matrícula
        </label>
      </div>
      <div className="mt-5">
        {payers.isPending ? (
          <Loading />
        ) : payers.isError ? (
          <ErrorState error={payers.error} onRetry={() => payers.refetch()} />
        ) : rows.length === 0 ? (
          <EmptyState title="Nenhum responsável encontrado.">
            Responsáveis são cadastrados aqui, na ficha do aluno ou na matrícula. Quem tem conta assina o contrato do aluno menor.
          </EmptyState>
        ) : (
          <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {rows.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => setEditing(p)}
                  className="block h-full w-full rounded-lg border border-line bg-surface p-4 text-left hover:border-line-strong"
                >
                  <p className="flex items-center gap-2 font-semibold text-text">
                    {p.name}
                    {p.student_id ? <Badge tone="neutral">Aluno</Badge> : null}
                  </p>
                  <p className="mt-0.5 text-xs text-dim">{[p.cpf ? formatCpf(p.cpf) : null, p.phone, p.email].filter(Boolean).join(' · ') || 'Sem contato'}</p>
                  {p.students.length ? (
                    <p className="mt-2 text-sm text-soft">
                      Responsável por{' '}
                      {p.students.map((s, i) => (
                        <span key={s.id}>
                          {i ? ', ' : ''}
                          <Link href={`/aluno?id=${s.id}`} onClick={(e) => e.stopPropagation()} className="font-semibold text-accent hover:underline">
                            {s.name}
                          </Link>
                          {s.relationship ? ` (${s.relationship})` : ''}
                        </span>
                      ))}
                    </p>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {editing ? <PayerDialog payer={editing === 'new' ? null : editing} onClose={() => setEditing(null)} /> : null}
    </>
  )
}

function PayerDialog({ payer, onClose }: { payer: PayerRow | null; onClose: () => void }) {
  const { academy } = useAcademy()
  const queryClient = useQueryClient()
  const [form, setForm] = useState({
    name: payer?.name ?? '',
    cpf: payer?.cpf ? formatCpf(payer.cpf) : '',
    phone: payer?.phone ?? '',
    email: payer?.email ?? '',
    notes: payer?.notes ?? '',
  })
  const [error, setError] = useState<string | null>(null)
  const save = useMutation({
    mutationFn: () =>
      savePayer(db(), academy.gym_id, payer?.id ?? null, {
        name: form.name.trim(),
        cpf: form.cpf.replace(/\D/g, '') || null,
        phone: form.phone.trim() || null,
        email: form.email.trim().toLowerCase() || null,
        notes: form.notes.trim() || null,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: keys.all(academy.gym_id) })
      toast('Responsável salvo.')
      onClose()
    },
    onError: toastError,
  })
  function submit() {
    const cpf = form.cpf.replace(/\D/g, '')
    const issue = form.name.trim().length < 3 ? 'Informe o nome completo.' : cpf && !isValidCpf(cpf) ? 'CPF inválido.' : null
    setError(issue)
    if (!issue) save.mutate()
  }
  return (
    <Dialog
      open
      onClose={onClose}
      title={payer ? 'Editar responsável' : 'Novo responsável'}
      footer={
        <>
          <Button variant="plain" onPress={onClose}>Cancelar</Button>
          <Button loading={save.isPending} onPress={submit}>Salvar</Button>
        </>
      }
    >
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
        <Field label="E-mail" className="sm:col-span-2" hint="Usado no convite para assinar o contrato.">
          <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </Field>
        <Field label="Observações" className="sm:col-span-2">
          <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </Field>
        {error ? (
          <div className="sm:col-span-2">
            <FormMessage message={{ text: error, error: true }} />
          </div>
        ) : null}
        {payer?.students.length ? (
          <p className="text-xs text-dim sm:col-span-2">Para vincular ou desvincular alunos, use a ficha do aluno.</p>
        ) : null}
      </div>
    </Dialog>
  )
}
