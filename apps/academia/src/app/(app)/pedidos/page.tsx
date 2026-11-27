'use client'

import { approveAcademySignupRequest, formatDateBR, rejectAcademySignupRequest, signFaceUrls, type StudentRequest } from '@kog/core'
import { Badge, Button, cn, EmptyState } from '@kog/ui'
import { toast, toastError } from '@kog/web-kit'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Award, Cake, Check, Mail, Phone, UserPlus, UserRound } from 'lucide-react'
import Link from 'next/link'
import { useMemo, useState } from 'react'
import { Dialog, RegistryTabs, SearchInput } from '@/components/kit'
import { PageHeader } from '@/components/shell'
import { ErrorState, Loading } from '@/components/states'
import { useAcademy } from '@/lib/academy'
import { keys, useSignupRequests, useStudentsWithoutAccount } from '@/lib/queries'
import { db } from '@/lib/supabase'

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

export default function SignupRequestsPage() {
  const { academy, isAdmin } = useAcademy()
  const requests = useSignupRequests()
  const queryClient = useQueryClient()
  const [approving, setApproving] = useState<StudentRequest | null>(null)
  const [rejecting, setRejecting] = useState<string | null>(null)
  const list = requests.data ?? []
  const paths = list.map((r) => r.photo_path)
  const faces = useQuery({
    queryKey: [...keys.signupRequests(academy.gym_id), 'fotos', paths.join(',')],
    queryFn: () => signFaceUrls(db(), paths),
    enabled: paths.length > 0,
    staleTime: 30 * 60_000,
    gcTime: 50 * 60_000, // URLs assinadas valem 1h
  })
  const reject = useMutation({
    mutationFn: (id: string) => rejectAcademySignupRequest(db(), id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: keys.signupRequests(academy.gym_id) })
      setRejecting(null)
      toast('Pedido recusado.')
    },
    onError: toastError,
  })

  if (!isAdmin) {
    return (
      <>
        <PageHeader kicker={academy.name} title="Cadastros" />
        <EmptyState title="Só o administrador da academia decide os pedidos de acesso." />
      </>
    )
  }

  return (
    <>
      <PageHeader kicker={academy.name} title="Cadastros" />
      <RegistryTabs />
      <p className="-mt-2 mb-5 max-w-3xl text-sm text-dim">
        Alunos que criaram a conta no app escolhendo esta academia. Diga qual aluno da lista é esse login, cadastre como aluno novo ou
        recuse. Aprovado, ele passa a ver as presenças e a graduação na área do aluno. O nome e o professor que aparecem no cadastro ficam
        em <Link href="/configuracoes" className="font-semibold text-accent underline">Configurações</Link>.
      </p>
      {requests.isPending ? (
        <Loading />
      ) : requests.isError ? (
        <ErrorState error={requests.error} onRetry={() => requests.refetch()} />
      ) : list.length === 0 ? (
        <EmptyState title="Nenhum pedido de acesso pendente." />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {list.map((r) => (
            <li key={r.id} className="flex flex-col rounded-lg border border-line bg-surface p-4">
              <div className="flex items-start gap-3">
                <Face url={faces.data?.[r.photo_path]} name={r.name} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-text">{r.name}</p>
                  <p className="text-xs text-dim">Pedido em {formatDateBR(r.created_at.slice(0, 10))}</p>
                </div>
              </div>
              <div className="mt-3 space-y-1 text-sm text-soft">
                <p className="flex items-center gap-1.5 truncate"><Mail className="size-3.5 shrink-0" /> {r.email}</p>
                {r.phone ? <p className="flex items-center gap-1.5"><Phone className="size-3.5 shrink-0" /> {r.phone}</p> : null}
                <p className="flex items-center gap-1.5"><Award className="size-3.5 shrink-0" /> {rankLabel(r)}</p>
                {r.birth_date ? <p className="flex items-center gap-1.5"><Cake className="size-3.5 shrink-0" /> Nascimento: {formatDateBR(r.birth_date)}</p> : null}
              </div>
              {r.minor ? (
                <p className="mt-2">
                  <Badge tone="warning">{r.guardian_term ? 'Menor · termo do responsável enviado' : 'Menor · sem termo do responsável'}</Badge>
                </p>
              ) : null}
              <div className="mt-auto flex flex-wrap gap-2 pt-4">
                {rejecting === r.id ? (
                  <>
                    <Button size="sm" variant="danger" loading={reject.isPending} onPress={() => reject.mutate(r.id)}>Confirmar recusa</Button>
                    <Button size="sm" variant="plain" onPress={() => setRejecting(null)}>Voltar</Button>
                  </>
                ) : (
                  <>
                    <Button size="sm" onPress={() => setApproving(r)}><Check className="size-4" /> Aprovar</Button>
                    <Button size="sm" variant="ghost" onPress={() => setRejecting(r.id)}>Recusar</Button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {approving ? <ApproveDialog request={approving} faceUrl={faces.data?.[approving.photo_path]} onClose={() => setApproving(null)} /> : null}
    </>
  )
}

/** Escolhe qual aluno da academia (ainda sem conta) é esse login, ou cadastra um aluno novo. */
function ApproveDialog({ request, faceUrl, onClose }: { request: StudentRequest; faceUrl?: string; onClose: () => void }) {
  const { academy } = useAcademy()
  const queryClient = useQueryClient()
  const students = useStudentsWithoutAccount(true)
  const [search, setSearch] = useState('')
  const [choice, setChoice] = useState<string | 'new' | null>(null)

  const candidates = useMemo(() => {
    const words = norm(request.name).split(/\s+/).filter((w) => w.length > 2)
    const q = norm(search)
    const score = (name: string) => words.filter((w) => norm(name).includes(w)).length
    return (students.data ?? [])
      .filter((s) => !q || norm(s.name).includes(q))
      .map((s) => ({ ...s, score: score(s.name) }))
      .sort((a, b) => b.score - a.score || Number(b.active) - Number(a.active) || a.name.localeCompare(b.name, 'pt-BR'))
  }, [students.data, request.name, search])

  const approve = useMutation({
    mutationFn: () => approveAcademySignupRequest(db(), request.id, choice && choice !== 'new' ? choice : undefined),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: keys.all(academy.gym_id) })
      toast(choice === 'new' ? 'Aluno cadastrado e acesso aprovado.' : 'Acesso aprovado.')
      onClose()
    },
    onError: toastError,
  })

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Quem é ${request.name.split(/\s+/)[0]}?`}
      footer={
        <>
          <Button variant="plain" onPress={onClose}>Cancelar</Button>
          <Button disabled={!choice} loading={approve.isPending} onPress={() => approve.mutate()}>
            {choice === 'new' ? 'Cadastrar e aprovar' : 'Aprovar acesso'}
          </Button>
        </>
      }
    >
      {faceUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={faceUrl} alt={`Foto de ${request.name}`} className="mx-auto mb-3 size-32 rounded-full object-cover ring-1 ring-line-strong" />
      ) : null}
      <p className="mb-3 text-sm text-dim">Alunos de {academy.name} que ainda não têm conta. Os nomes parecidos aparecem primeiro.</p>
      <button
        type="button"
        onClick={() => setChoice('new')}
        className={cn('mb-2 flex w-full items-center gap-3 rounded-lg border px-3 py-3 text-left', choice === 'new' ? 'border-gold bg-tint' : 'border-line')}
      >
        <UserPlus className="size-5 shrink-0 text-accent" />
        <span className="min-w-0 flex-1">
          <span className="block font-medium text-text">Aluno novo</span>
          <span className="block truncate text-xs text-dim">Cadastrar “{request.name}” (a ficha completa fica para depois)</span>
        </span>
        {choice === 'new' ? <Check className="size-5 text-accent" /> : null}
      </button>
      <SearchInput value={search} onChange={setSearch} placeholder="Buscar aluno" />
      <div className="mt-2 max-h-72 divide-y divide-line overflow-y-auto rounded-lg border border-line">
        {students.isPending ? (
          <Loading />
        ) : students.isError ? (
          <ErrorState error={students.error} onRetry={() => students.refetch()} />
        ) : candidates.length === 0 ? (
          <p className="p-3 text-sm text-dim">Nenhum aluno sem conta encontrado.</p>
        ) : (
          candidates.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setChoice(s.id)}
              className={cn('flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-tint', choice === s.id && 'bg-tint')}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-text">{s.name}</span>
                {!s.active ? <span className="block text-xs text-dim">inativo</span> : null}
              </span>
              {choice === s.id ? <Check className="size-5 text-accent" /> : null}
            </button>
          ))
        )}
      </div>
    </Dialog>
  )
}

function Face({ url, name }: { url?: string; name: string }) {
  return (
    <span className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-tint ring-1 ring-line-strong">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {url ? <img src={url} alt={`Foto de ${name}`} className="size-full object-cover" /> : <UserRound className="size-6 text-faint" />}
    </span>
  )
}

function rankLabel(r: StudentRequest): string {
  if (!r.rank_name) return 'Sem graduação'
  const track = r.rank_track === 'infantil' ? ' (infantil)' : ''
  return `${r.rank_name}${track}${r.graduated_at ? ` · desde ${formatDateBR(r.graduated_at)}` : ''}`
}
