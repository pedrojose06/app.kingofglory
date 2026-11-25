'use client'

import { type AcademyStudentRow, CONTRACT_BILLING_LABEL, formatBRL, isMinor, todayISO } from '@kog/core'
import { Badge, Button, Chip, EmptyState, Select } from '@kog/ui'
import { ChevronRight, Plus } from 'lucide-react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useMemo, useState } from 'react'
import { ageOn, GroupTag, RegistryTabs, SearchInput } from '@/components/kit'
import { PageHeader } from '@/components/shell'
import { ErrorState, Loading } from '@/components/states'
import { useAcademy } from '@/lib/academy'
import { useClassGroups, useStudents } from '@/lib/queries'

type Quick = 'menores' | 'sem_contrato' | 'revisar' | 'sem_nascimento'
const QUICK: { id: Quick; label: string }[] = [
  { id: 'menores', label: 'Menores' },
  { id: 'sem_contrato', label: 'Sem contrato' },
  { id: 'revisar', label: 'Contrato a revisar' },
  { id: 'sem_nascimento', label: 'Sem nascimento' },
]

const strip = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

function ContractCell({ c }: { c: AcademyStudentRow['contract'] }) {
  if (!c) return <Badge tone="warning">Sem contrato</Badge>
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      {c.billing === 'mensal' ? (
        <span className="text-sm text-text">
          {formatBRL(c.amount_cents - c.discount_cents)} <span className="text-dim">· dia {c.due_day}</span>
        </span>
      ) : (
        <Badge tone="neutral">{CONTRACT_BILLING_LABEL[c.billing as keyof typeof CONTRACT_BILLING_LABEL]}</Badge>
      )}
      {c.review_needed ? <Badge tone="gold">Revisar</Badge> : null}
    </span>
  )
}

export default function StudentsPage() {
  return (
    <Suspense fallback={<Loading />}>
      <StudentsList />
    </Suspense>
  )
}

function StudentsList() {
  const router = useRouter()
  const params = useSearchParams()
  const { academy, isAdmin } = useAcademy()
  const students = useStudents()
  const groups = useClassGroups()
  const [q, setQ] = useState('')
  const [group, setGroup] = useState(params.get('turma') ?? '')
  const [status, setStatus] = useState<'ativos' | 'inativos' | 'todos'>('ativos')
  const [quick, setQuick] = useState<Quick | null>(null)
  const today = todayISO()

  const groupById = useMemo(() => new Map((groups.data ?? []).map((g) => [g.id, g])), [groups.data])

  const rows = useMemo(() => {
    const term = strip(q.trim())
    const digits = q.replace(/\D/g, '')
    return (students.data ?? []).filter((s) => {
      if (status === 'ativos' && !s.active) return false
      if (status === 'inativos' && s.active) return false
      if (group && !s.group_ids.includes(group)) return false
      if (quick === 'menores' && !isMinor(s.birth_date, today)) return false
      if (quick === 'sem_contrato' && s.contract) return false
      if (quick === 'revisar' && !s.contract?.review_needed) return false
      if (quick === 'sem_nascimento' && s.birth_date) return false
      if (term && !strip(s.name).includes(term) && !(digits.length >= 3 && s.cpf?.includes(digits))) return false
      return true
    })
  }, [students.data, q, group, status, quick, today])

  return (
    <>
      <PageHeader
        kicker={academy.name}
        title="Cadastros"
        actions={
          isAdmin ? (
            <Button onPress={() => router.push('/aluno?novo=1')}>
              <Plus className="size-4" /> Novo aluno
            </Button>
          ) : null
        }
      />
      <RegistryTabs />

      <div className="grid gap-3 md:grid-cols-[1fr_220px_160px]">
        <SearchInput value={q} onChange={setQ} placeholder="Buscar por nome ou CPF" />
        <Select aria-label="Turma" value={group} onChange={(e) => setGroup(e.target.value)} className="h-10 text-sm">
          <option value="">Todas as turmas</option>
          {(groups.data ?? []).map((g) => (
            <option key={g.id} value={g.id}>
              {g.name} ({g.members})
            </option>
          ))}
        </Select>
        <Select aria-label="Situação" value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className="h-10 text-sm">
          <option value="ativos">Ativos</option>
          <option value="inativos">Inativos</option>
          <option value="todos">Todos</option>
        </Select>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {QUICK.map((f) => (
          <Chip key={f.id} active={quick === f.id} onPress={() => setQuick(quick === f.id ? null : f.id)}>
            {f.label}
          </Chip>
        ))}
      </div>

      <div className="mt-5">
        {students.isPending ? (
          <Loading label="Carregando alunos…" />
        ) : students.isError ? (
          <ErrorState error={students.error} onRetry={() => students.refetch()} />
        ) : rows.length === 0 ? (
          <EmptyState title={students.data.length === 0 ? 'Nenhum aluno cadastrado.' : 'Nenhum aluno com esses filtros.'}>
            {students.data.length === 0 ? 'Cadastre o primeiro aluno pelo botão "Novo aluno".' : 'Limpe a busca ou os filtros para ver mais.'}
          </EmptyState>
        ) : (
          <>
            <p className="mb-2 text-xs text-dim">
              {rows.length} {rows.length === 1 ? 'aluno' : 'alunos'}
            </p>
            {/* Desktop: tabela */}
            <div className="hidden overflow-hidden rounded-lg border border-line bg-surface md:block">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-line bg-surface-2 text-[11px] font-bold uppercase tracking-[0.1em] text-dim">
                  <tr>
                    <th className="px-4 py-2.5">Aluno</th>
                    <th className="px-4 py-2.5">Turmas</th>
                    {isAdmin ? <th className="px-4 py-2.5">Contrato</th> : null}
                    <th className="px-4 py-2.5">Telefone</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {rows.map((s) => (
                    <tr key={s.id} className="cursor-pointer hover:bg-tint" onClick={() => router.push(`/aluno?id=${s.id}`)}>
                      <td className="px-4 py-2.5">
                        <Link href={`/aluno?id=${s.id}`} className="font-semibold text-text hover:text-accent" onClick={(e) => e.stopPropagation()}>
                          {s.name}
                        </Link>
                        <p className="text-xs text-dim">
                          {s.birth_date ? `${ageOn(s.birth_date, today)} anos` : 'Nascimento pendente'}
                          {isMinor(s.birth_date, today) ? ' · menor' : ''}
                          {!s.active ? ' · inativo' : ''}
                        </p>
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex flex-wrap gap-1">
                          {s.group_ids.map((id) => {
                            const g = groupById.get(id)
                            return g ? <GroupTag key={id} name={g.name} color={g.color} /> : null
                          })}
                        </div>
                      </td>
                      {isAdmin ? (
                        <td className="px-4 py-2.5">
                          <ContractCell c={s.contract} />
                        </td>
                      ) : null}
                      <td className="px-4 py-2.5 whitespace-nowrap text-soft">{s.phone ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Celular: cartões */}
            <ul className="space-y-2 md:hidden">
              {rows.map((s) => (
                <li key={s.id}>
                  <Link href={`/aluno?id=${s.id}`} className="flex items-center gap-3 rounded-lg border border-line bg-surface px-4 py-3 active:bg-tint">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-text">{s.name}</p>
                      <p className="text-xs text-dim">
                        {s.birth_date ? `${ageOn(s.birth_date, today)} anos` : 'Nascimento pendente'}
                        {s.group_ids.length ? ` · ${s.group_ids.map((id) => groupById.get(id)?.name).filter(Boolean).join(', ')}` : ''}
                      </p>
                      {isAdmin ? (
                        <div className="mt-1.5">
                          <ContractCell c={s.contract} />
                        </div>
                      ) : null}
                    </div>
                    <ChevronRight className="size-4 shrink-0 text-faint" />
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </>
  )
}
