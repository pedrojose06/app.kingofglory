'use client'

import { type ClassGroupInput, type ClassGroupRow, type Modality, saveClassGroup, saveModality } from '@kog/core'
import { Badge, Button, Card, EmptyState, Field, Input, Select, Textarea } from '@kog/ui'
import { toast, toastError } from '@kog/web-kit'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'
import { Dialog, RegistryTabs } from '@/components/kit'
import { PageHeader } from '@/components/shell'
import { ErrorState, FormMessage, Loading } from '@/components/states'
import { useAcademy } from '@/lib/academy'
import { keys, useClassGroups, useModalities } from '@/lib/queries'
import { db } from '@/lib/supabase'

const COLORS = ['#17130a', '#d9a93f', '#dc2626', '#e879f9', '#eab308', '#6366f1', '#16a34a', '#0ea5e9', '#f97316']
const BELT_LABEL = { muay_thai: 'Graus do muay thai', jiu_jitsu: 'Faixas do jiu-jitsu' } as const

export default function GroupsPage() {
  const { academy, isAdmin } = useAcademy()
  const modalities = useModalities()
  const groups = useClassGroups()
  const [editGroup, setEditGroup] = useState<ClassGroupRow | 'new' | null>(null)
  const [editModality, setEditModality] = useState<Modality | 'new' | null>(null)

  return (
    <>
      <PageHeader
        kicker={academy.name}
        title="Cadastros"
        actions={
          isAdmin ? (
            <>
              <Button variant="ghost" onPress={() => setEditModality('new')}>
                <Plus className="size-4" /> Modalidade
              </Button>
              <Button onPress={() => setEditGroup('new')} disabled={!modalities.data?.length}>
                <Plus className="size-4" /> Turma
              </Button>
            </>
          ) : null
        }
      />
      <RegistryTabs />
      {modalities.isPending || groups.isPending ? (
        <Loading />
      ) : modalities.isError || groups.isError ? (
        <ErrorState error={modalities.error ?? groups.error} onRetry={() => { void modalities.refetch(); void groups.refetch() }} />
      ) : modalities.data.length === 0 ? (
        <EmptyState title="Nenhuma modalidade cadastrada.">Cadastre a modalidade (ex.: Muay Thai) e depois as turmas dela.</EmptyState>
      ) : (
        <div className="space-y-6">
          {modalities.data.map((m) => {
            const list = groups.data.filter((g) => g.modality_id === m.id)
            return (
              <Card key={m.id} className="p-5">
                <div className="mb-4 flex flex-wrap items-center gap-2">
                  <span className="size-3 rounded-full" style={{ backgroundColor: m.color ?? 'var(--kog-gold)' }} />
                  <h2 className="font-display text-xl uppercase tracking-[0.02em] text-text">{m.name}</h2>
                  {m.belt_system ? <Badge tone="neutral">{BELT_LABEL[m.belt_system as keyof typeof BELT_LABEL]}</Badge> : null}
                  {!m.active ? <Badge tone="neutral">Inativa</Badge> : null}
                  {isAdmin ? (
                    <button type="button" className="ml-auto text-xs font-semibold text-accent hover:underline" onClick={() => setEditModality(m)}>
                      Editar modalidade
                    </button>
                  ) : null}
                </div>
                {list.length === 0 ? (
                  <p className="text-sm text-soft">Nenhuma turma nesta modalidade.</p>
                ) : (
                  <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {list.map((g) => (
                      <li key={g.id} className="rounded-lg border border-line p-4" style={{ borderLeftWidth: 4, borderLeftColor: g.color ?? 'var(--kog-gold)' }}>
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-semibold text-text">{g.name}</p>
                          {!g.active ? <Badge tone="neutral">Inativa</Badge> : null}
                        </div>
                        <p className="mt-1 text-sm text-soft">
                          {g.members} {g.members === 1 ? 'aluno' : 'alunos'}
                          {g.capacity ? ` de ${g.capacity} vagas` : ''}
                          {g.min_age != null || g.max_age != null ? ` · ${g.min_age ?? 0} a ${g.max_age ?? '∞'} anos` : ''}
                        </p>
                        <div className="mt-3 flex gap-3 text-xs font-semibold">
                          <Link href={`/alunos?turma=${g.id}`} className="text-accent hover:underline">Ver alunos</Link>
                          {isAdmin ? (
                            <button type="button" className="text-accent hover:underline" onClick={() => setEditGroup(g)}>
                              Editar
                            </button>
                          ) : null}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            )
          })}
          <p className="text-xs text-dim">Os horários de cada turma ficam em Diários de aula › Grade de horários.</p>
        </div>
      )}
      {editGroup ? <GroupDialog group={editGroup === 'new' ? null : editGroup} modalities={modalities.data ?? []} onClose={() => setEditGroup(null)} /> : null}
      {editModality ? <ModalityDialog modality={editModality === 'new' ? null : editModality} onClose={() => setEditModality(null)} /> : null}
    </>
  )
}

function ColorPicker({ value, onChange }: { value: string | null; onChange: (c: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {COLORS.map((c) => (
        <button
          key={c}
          type="button"
          aria-label={`Cor ${c}`}
          aria-pressed={value === c}
          onClick={() => onChange(c)}
          className={`size-8 rounded-full border-2 ${value === c ? 'border-gold ring-2 ring-gold/40' : 'border-line'}`}
          style={{ backgroundColor: c }}
        />
      ))}
    </div>
  )
}

function GroupDialog({ group, modalities, onClose }: { group: ClassGroupRow | null; modalities: Modality[]; onClose: () => void }) {
  const { academy } = useAcademy()
  const queryClient = useQueryClient()
  const [form, setForm] = useState<ClassGroupInput>({
    name: group?.name ?? '',
    modality_id: group?.modality_id ?? modalities[0]?.id ?? '',
    color: group?.color ?? COLORS[1]!,
    capacity: group?.capacity ?? null,
    min_age: group?.min_age ?? null,
    max_age: group?.max_age ?? null,
    notes: group?.notes ?? null,
    active: group?.active ?? true,
  })
  const [error, setError] = useState<string | null>(null)
  const num = (v: string) => (v === '' ? null : Math.max(0, Number(v) || 0))
  const save = useMutation({
    mutationFn: () => saveClassGroup(db(), academy.gym_id, group?.id ?? null, { ...form, name: form.name.trim() }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: keys.all(academy.gym_id) })
      toast('Turma salva.')
      onClose()
    },
    onError: toastError,
  })
  function submit() {
    const issue = !form.name.trim()
      ? 'Informe o nome da turma.'
      : form.min_age != null && form.max_age != null && form.min_age > form.max_age
        ? 'A idade mínima é maior que a máxima.'
        : null
    setError(issue)
    if (!issue) save.mutate()
  }
  return (
    <Dialog
      open
      onClose={onClose}
      title={group ? 'Editar turma' : 'Nova turma'}
      footer={
        <>
          <Button variant="plain" onPress={onClose}>Cancelar</Button>
          <Button loading={save.isPending} onPress={submit}>Salvar</Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nome" className="sm:col-span-2">
          <Input placeholder="Ex.: Muay Thai Juvenil" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
        <Field label="Modalidade" className="sm:col-span-2">
          <Select value={form.modality_id} onChange={(e) => setForm({ ...form, modality_id: e.target.value })}>
            {modalities.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </Select>
        </Field>
        <Field label="Vagas (opcional)">
          <Input type="number" min={1} value={form.capacity ?? ''} onChange={(e) => setForm({ ...form, capacity: num(e.target.value) || null })} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Idade mín.">
            <Input type="number" min={0} value={form.min_age ?? ''} onChange={(e) => setForm({ ...form, min_age: num(e.target.value) })} />
          </Field>
          <Field label="Idade máx.">
            <Input type="number" min={0} value={form.max_age ?? ''} onChange={(e) => setForm({ ...form, max_age: num(e.target.value) })} />
          </Field>
        </div>
        <Field label="Cor (aparece nos diários e na grade)" className="sm:col-span-2">
          <ColorPicker value={form.color} onChange={(color) => setForm({ ...form, color })} />
        </Field>
        <Field label="Observações" className="sm:col-span-2">
          <Textarea value={form.notes ?? ''} onChange={(e) => setForm({ ...form, notes: e.target.value || null })} />
        </Field>
        <label className="flex items-center gap-2 text-sm text-soft sm:col-span-2">
          <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} className="size-4 accent-[var(--kog-gold)]" />
          Turma ativa
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

function ModalityDialog({ modality, onClose }: { modality: Modality | null; onClose: () => void }) {
  const { academy } = useAcademy()
  const queryClient = useQueryClient()
  const [form, setForm] = useState({
    name: modality?.name ?? '',
    belt_system: (modality?.belt_system ?? '') as '' | 'muay_thai' | 'jiu_jitsu',
    color: modality?.color ?? COLORS[0]!,
    active: modality?.active ?? true,
  })
  const save = useMutation({
    mutationFn: () => saveModality(db(), academy.gym_id, modality?.id ?? null, { ...form, name: form.name.trim(), belt_system: form.belt_system || null }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: keys.all(academy.gym_id) })
      toast('Modalidade salva.')
      onClose()
    },
    onError: toastError,
  })
  return (
    <Dialog
      open
      onClose={onClose}
      title={modality ? 'Editar modalidade' : 'Nova modalidade'}
      footer={
        <>
          <Button variant="plain" onPress={onClose}>Cancelar</Button>
          <Button disabled={!form.name.trim()} loading={save.isPending} onPress={() => save.mutate()}>Salvar</Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Nome">
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
        <Field label="Graduação" hint="Define quais faixas aparecem para os alunos desta modalidade.">
          <Select value={form.belt_system} onChange={(e) => setForm({ ...form, belt_system: e.target.value as typeof form.belt_system })}>
            <option value="">Sem graduação</option>
            <option value="muay_thai">Graus do muay thai (kruang/prajied)</option>
            <option value="jiu_jitsu">Faixas do jiu-jitsu</option>
          </Select>
        </Field>
        <Field label="Cor">
          <ColorPicker value={form.color} onChange={(color) => setForm({ ...form, color })} />
        </Field>
        <label className="flex items-center gap-2 text-sm text-soft">
          <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} className="size-4 accent-[var(--kog-gold)]" />
          Modalidade ativa
        </label>
      </div>
    </Dialog>
  )
}
