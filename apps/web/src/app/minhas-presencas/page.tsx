'use client'

import {
  STUDENT_SIGNUP_PATH, acceptImageConsent, attendanceStats, getMySignupRequest, claimStudentAccount, formatDateBR, getMyStudentAccount, getMyStudentPortal, hasAccountConsent,
  monthsBetween, formatDayShort, formatMonth, formatTime, getStudentPortal, graduationStatus, isCounted,
  keys, missingLabel, trackOf, type StudentPortal,
} from '@kog/core'
import { Badge, Button, Card, EmptyState, Kicker, ProgressBar, RankBand, Title } from '@kog/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { LogOut, UserPlus } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Section, StatusBadge, studentSince } from '@/components/common'
import { Loading } from '@/components/shell'
import { ConsentScreen, StudentAuthForm, formatDateTimeBR } from '@/components/student-account'
import { useAuth } from '@/lib/auth'
import { useToday } from '@/lib/queries'
import { getStoredStudentToken, storeStudentToken } from '@/lib/student-link'
import { db, isConfigured } from '@/lib/supabase'
import { errorMessage } from '@/lib/toast'

/**
 * Área do aluno. Dois jeitos de entrar:
 * - pelo link que o professor envia (/minhas-presencas#token), que expira (padrão 24 h);
 * - pela conta do aluno, ligada a ele pelo link e liberada só depois do aceite de uso de imagem (LGPD).
 */
export default function StudentPortalPage() {
  const { session, ready } = useAuth()
  const [token, setToken] = useState<string | null | undefined>(undefined)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    const read = () => {
      const fromHash = window.location.hash.replace(/^#/, '').trim()
      // Retorno da confirmação de e-mail traz tokens de login no fragmento (com "="): não é link de aluno.
      setToken(fromHash && !fromHash.includes('=') ? fromHash : getStoredStudentToken())
    }
    read()
    window.addEventListener('hashchange', read)
    return () => window.removeEventListener('hashchange', read)
  }, [])

  if (!ready || token === undefined) return <Shell><Loading /></Shell>
  if (session) return <AccountMode token={token} onLeave={setNotice} />
  return <LinkMode token={token} notice={notice} />
}

function Shell({ children }: { children: ReactNode }) {
  const { session } = useAuth()
  return (
    <main className="mx-auto max-w-xl px-4 pt-[calc(env(safe-area-inset-top)+1.25rem)] pb-[calc(env(safe-area-inset-bottom)+2.5rem)]">
      {children}
      {/* Só para quem não está logado: logado como aluno, o login do professor mandaria de volta para cá. */}
      {!session ? (
        <p className="mt-10 text-center text-xs text-faint">
          <Link href="/login-professor" className="underline underline-offset-2">Sou professor</Link>
        </p>
      ) : null}
    </main>
  )
}

/** Sem login: só pelo link do professor. */
function LinkMode({ token, notice }: { token: string | null; notice: string | null }) {
  const [form, setForm] = useState<'signin' | 'signup' | null>(null)
  const portal = useQuery({
    queryKey: keys.studentPortal(token ?? ''),
    queryFn: () => getStudentPortal(db(), token!),
    enabled: !!token && isConfigured,
  })

  // Link válido fica guardado no aparelho; link vencido ou revogado é esquecido.
  useEffect(() => {
    if (!token || portal.isFetching) return
    if (portal.data) storeStudentToken(token)
    else if (portal.data === null && getStoredStudentToken() === token) storeStudentToken(null)
  }, [token, portal.data, portal.isFetching])

  const noticeCard = notice ? <Card className="mb-4 border-warning p-3 text-sm text-text">{notice}</Card> : null
  const valid = !!token && !!portal.data

  if (token && portal.isPending) return <Shell><Loading /></Shell>

  if (!valid) {
    if (portal.isError && !portal.data) {
      return (
        <Shell>
          <div className="pt-16">
            <EmptyState title="Não foi possível carregar" action={<Button variant="ghost" onPress={() => void portal.refetch()}>Tentar de novo</Button>}>
              Confira a conexão com a internet.
            </EmptyState>
          </div>
        </Shell>
      )
    }
    return (
      <Shell>
        <Brand />
        {noticeCard}
        {token ? (
          <EmptyState title="Link expirado ou inválido">
            O link do professor vale por tempo limitado. Peça um novo link ou entre na sua conta.
          </EmptyState>
        ) : (
          <Title>Área do aluno</Title>
        )}
        <Card className="mt-4 p-4"><StudentAuthForm canSignUp={false} /></Card>
        <Card className="mt-3 p-4">
          <p className="text-sm text-soft">Ainda não tem conta? Escolha seu professor e a academia e crie a sua. O professor aprova o acesso.</p>
          <Link href={STUDENT_SIGNUP_PATH} className="mt-3 block">
            <Button variant="ghost" block><UserPlus className="size-4" /> Criar conta de aluno</Button>
          </Link>
        </Card>
      </Shell>
    )
  }

  const data = portal.data!
  const access = data.access
  return (
    <Shell>
      <PortalView
        data={data}
        updatedAt={portal.dataUpdatedAt}
        offline={portal.isError}
        top={
          <>
            {noticeCard}
            {access ? <p className="mt-2 text-xs text-dim">Link válido até {formatDateTimeBR(access.expires_at)}</p> : null}
          </>
        }
        bottom={
          <Section title="Sua conta">
            <Card className="p-4">
              {form ? (
                <StudentAuthForm initialMode={form} canSignUp={!access?.has_account} onCancel={() => setForm(null)} />
              ) : access?.has_account ? (
                <>
                  <p className="text-sm text-soft">Você já tem conta. Entre para acompanhar suas presenças sem precisar de link.</p>
                  <Button block className="mt-3" onPress={() => setForm('signin')}>Entrar</Button>
                </>
              ) : (
                <>
                  <p className="text-sm text-soft">
                    Este link expira. Crie sua conta para acompanhar suas presenças quando quiser, sem pedir link ao professor.
                  </p>
                  <Button block className="mt-3" onPress={() => setForm('signup')}><UserPlus className="size-4" /> Criar minha conta</Button>
                  <Button variant="plain" block className="mt-1" onPress={() => setForm('signin')}>Já tenho conta</Button>
                </>
              )}
            </Card>
          </Section>
        }
      />
    </Shell>
  )
}

/** Logado: liga a conta ao aluno (pelo link), pede o aceite LGPD e mostra a área do aluno. */
function AccountMode({ token, onLeave }: { token: string | null; onLeave: (notice: string | null) => void }) {
  const queryClient = useQueryClient()
  const account = useQuery({ queryKey: keys.myStudentAccount, queryFn: () => getMyStudentAccount(db()) })
  const consented = !!account.data && hasAccountConsent(account.data)
  const portal = useQuery({ queryKey: keys.myStudentPortal, queryFn: () => getMyStudentPortal(db()), enabled: consented })
  const tried = useRef(false)
  const [claimError, setClaimError] = useState<string | null>(null)

  const claim = useMutation({
    mutationFn: (t: string) => claimStudentAccount(db(), t),
    networkMode: 'online',
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.myStudentAccount }),
    onError: (e) => setClaimError(errorMessage(e)),
  })
  const accept = useMutation({
    mutationFn: () => acceptImageConsent(db()),
    networkMode: 'online',
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.myStudentPortal }),
  })

  // Conta ainda sem aluno e com link no aparelho: liga automaticamente (uma tentativa).
  useEffect(() => {
    if (account.isSuccess && account.data === null && token && !tried.current) {
      tried.current = true
      claim.mutate(token)
    }
  }, [account.isSuccess, account.data, token, claim])

  async function signOut(notice: string | null = null) {
    onLeave(notice)
    await db().auth.signOut()
    // Cache (persistido no aparelho) é da conta: não pode vazar para o próximo login.
    queryClient.clear()
  }

  // Conta de professor abrindo um link de aluno: mostra o link, sem mexer na conta.
  if (claimError && /professor/i.test(claimError)) return <LinkMode token={token} notice={null} />

  if (account.isPending || claim.isPending) return <Shell><Loading /></Shell>

  if (account.isError && !account.data) {
    return (
      <Shell>
        <div className="pt-16">
          <EmptyState title="Não foi possível carregar" action={<Button variant="ghost" onPress={() => void account.refetch()}>Tentar de novo</Button>}>
            Confira a conexão com a internet.
          </EmptyState>
        </div>
      </Shell>
    )
  }

  if (!account.data) {
    return <PendingAccount claimError={claimError} onSignOut={() => void signOut()} />
  }

  if (!consented) {
    return (
      <Shell>
        <Brand />
        <ConsentScreen
          name={account.data.name}
          busy={accept.isPending}
          error={accept.isError ? errorMessage(accept.error) : undefined}
          onAccept={() => accept.mutate()}
          onDecline={() =>
            void signOut('Sem a autorização de uso de imagem você não pode usar a conta. Peça ao professor um link para ver suas presenças.')
          }
        />
      </Shell>
    )
  }

  if (portal.isPending) return <Shell><Loading /></Shell>
  if (!portal.data) {
    return (
      <Shell>
        <div className="pt-16">
          <EmptyState title="Não foi possível carregar" action={<Button variant="ghost" onPress={() => void portal.refetch()}>Tentar de novo</Button>}>
            Confira a conexão com a internet.
          </EmptyState>
        </div>
      </Shell>
    )
  }

  return (
    <Shell>
      <PortalView
        data={portal.data}
        updatedAt={portal.dataUpdatedAt}
        offline={portal.isError}
        onSignOut={() => void signOut()}
        bottom={
          <Button variant="ghost" block className="mt-8" onPress={() => void signOut()}><LogOut className="size-4" /> Sair da conta</Button>
        }
      />
    </Shell>
  )
}

/** Conta sem aluno ligado: mostra o pedido ao professor (aguardando/recusado) ou como pedir acesso. */
function PendingAccount({ claimError, onSignOut }: { claimError: string | null; onSignOut: () => void }) {
  const queryClient = useQueryClient()
  const request = useQuery({ queryKey: keys.mySignupRequest, queryFn: () => getMySignupRequest(db()), networkMode: 'online', refetchInterval: 60_000 })
  // Aprovado: a conta já está ligada; recarrega para seguir ao aceite LGPD.
  useEffect(() => {
    if (request.data?.status === 'approved') void queryClient.invalidateQueries({ queryKey: keys.myStudentAccount })
  }, [request.data?.status, queryClient])
  if (request.isPending) return <Shell><Loading /></Shell>
  const r = request.data
  return (
    <Shell>
      <Brand />
      {claimError ? <Card className="mb-4 border-warning p-3 text-sm text-text">{claimError}</Card> : null}
      {r?.status === 'pending' ? (
        <EmptyState title="Aguardando o professor">
          {`Seu pedido para ${r.gym_name} foi enviado em ${formatDateBR(r.created_at.slice(0, 10))}. Assim que o professor aprovar, você acessa suas presenças aqui.`}
        </EmptyState>
      ) : r?.status === 'rejected' ? (
        <EmptyState title="Pedido não aprovado">
          {`O professor não aprovou seu pedido para ${r.gym_name}. Confira se escolheu o professor e a academia certos, ou fale com ele.`}
        </EmptyState>
      ) : (
        <EmptyState title="Conta sem acesso ainda">
          Peça acesso escolhendo seu professor e a academia, ou abra neste celular o link que o professor enviou.
        </EmptyState>
      )}
      <Link href={STUDENT_SIGNUP_PATH} className="mt-4 block">
        <Button variant={r?.status === 'pending' ? 'ghost' : 'gold'} block>
          {r ? 'Trocar professor ou academia' : 'Pedir acesso ao professor'}
        </Button>
      </Link>
      <Button variant="plain" block className="mt-2" onPress={onSignOut}><LogOut className="size-4" /> Sair</Button>
    </Shell>
  )
}

function Brand({ onSignOut }: { onSignOut?: () => void }) {
  return (
    <div className="mb-6 flex items-center gap-3">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/icons/icon-192.png" alt="" width={40} height={40} className="rounded-full ring-1 ring-line-strong" />
      <Kicker className="flex-1">King of Glory Academy</Kicker>
      {onSignOut ? (
        <Button variant="plain" size="sm" onPress={onSignOut}><LogOut className="size-4" /> Sair</Button>
      ) : null}
    </div>
  )
}

function PortalView({ data, updatedAt, offline, top, bottom, onSignOut }: { data: StudentPortal; updatedAt: number; offline: boolean; top?: ReactNode; bottom?: ReactNode; onSignOut?: () => void }) {
  const today = useToday()
  const [showAll, setShowAll] = useState(false)
  const { student } = data

  const status = useMemo(
    () => graduationStatus(data.progress ?? undefined, data.ranks, studentSince(student), today, { track: trackOf(student), birthDate: student.birth_date, graduationOn: data.next_graduation_on }),
    [data, student, today],
  )
  const stats = useMemo(() => attendanceStats(data.attendance, data.gym_name), [data])
  const thisMonth = today.slice(0, 7)
  const monthCount = stats.byMonth.find((m) => m.month === thisMonth)?.count ?? 0
  const openingPresent = student.opening_present ?? 0
  const openingAbsent = student.opening_absent ?? 0
  const total = stats.total + openingPresent
  const absences = stats.absences + openingAbsent
  // Frequência: presenças sobre presenças + faltas não justificadas.
  const unjustified = data.attendance.filter((a) => a.status === 'absent').length + openingAbsent
  const rate = total + unjustified > 0 ? Math.round((total / (total + unjustified)) * 100) : null
  const lastTraining = data.attendance.find((a) => isCounted(a.status))?.date
  const rankById = new Map(data.ranks.map((r) => [r.id, r]))
  const rows = showAll ? data.attendance : data.attendance.slice(0, 15)
  const since = status.current ? 'desde a última graduação' : 'desde o início'
  // Primeira graduação com tempo para pular o primeiro grau: o alvo mostrado ao aluno é o segundo grau.
  const target = status.skipTo ?? status.next
  const targetNeeded = status.skipTo
    ? (status.skipTo.required_classes == null ? null : Math.ceil((status.skipTo.required_classes * (status.skipTo.min_percent ?? 100)) / 100))
    : status.needed
  const targetMonths = status.skipTo ? status.skipTo.min_months : status.monthsNeeded
  // Já cumpre hoje (sem depender da data da graduação): não mostra aviso.
  const monthsToday = monthsBetween(data.progress?.last_graduated_at ?? studentSince(student), today)
  const skipNotice = !status.skipTo
    ? null
    : !status.skipReady
      ? `Você pode ir direto para ${status.skipTo.name} se completar os critérios abaixo.`
      : targetMonths != null && monthsToday < targetMonths
        ? `Você está perto de cumprir os critérios para ir direto para ${status.skipTo.name}.`
        : null

  return (
    <>
      <Brand onSignOut={onSignOut} />
      <Kicker className="mb-1.5">{data.gym_name}</Kicker>
      <Title>{student.name}</Title>
      {offline ? (
        <p className="mt-2 text-xs text-warning">Sem conexão · mostrando dados de {new Date(updatedAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</p>
      ) : null}
      {top}

      <div className="mt-5 grid grid-cols-2 gap-2">
        <Stat value={total} label="treinos no total" accent />
        <Stat value={monthCount} label="treinos este mês" />
        <Stat value={rate != null ? `${rate}%` : '—'} label="frequência" />
        <Stat value={absences} label={absences === 1 ? 'falta' : 'faltas'} />
      </div>
      {lastTraining ? <p className="mt-2 text-xs text-dim">Último treino: {formatDayShort(lastTraining)}/{lastTraining.slice(0, 4)}</p> : null}

      <Section title="Graduação">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="kicker">Grau atual</p>
              <p className="mt-1 truncate font-display text-xl uppercase text-text">
                {status.current ? status.current.name : 'Sem graduação'}
              </p>
              <p className="text-xs text-dim">{status.current?.level ?? `Início em ${formatDateBR(studentSince(student))}`}</p>
            </div>
            {status.current ? <RankBand colors={status.current.colors} className="h-3.5 w-20" /> : null}
          </div>

          {status.next && target ? (
            <div className="mt-4 border-t border-line pt-4">
              <div className="mb-2 flex items-center gap-2">
                <p className="min-w-0 flex-1 text-sm font-bold text-text">Próximo: {target.name}</p>
                <RankBand colors={target.colors} />
              </div>
              {skipNotice ? <p className="mb-2 text-sm font-medium text-accent">{skipNotice}</p> : null}
              {status.byAge ? (
                <p className="text-sm text-soft">
                  {status.ageNeeded != null ? `A partir de ${status.ageNeeded} anos (idade que você completa no ano).` : 'Graduação infantil por idade.'}
                </p>
              ) : (
                <>
                  {targetNeeded != null ? (
                    <>
                      <ProgressBar value={Math.min(status.count, targetNeeded)} max={targetNeeded || 1} />
                      <p className="mt-1.5 text-sm text-soft">
                        <strong className="text-text">{status.count}</strong> de {targetNeeded} treinos <span className="text-dim">{since}</span>
                        {status.skipTo && status.count >= targetNeeded ? ' ✓' : ''}
                      </p>
                    </>
                  ) : (
                    <p className="text-sm text-soft"><strong className="text-text">{status.count}</strong> treinos {since}</p>
                  )}
                  {targetMonths != null ? (
                    <p className="mt-1 text-sm text-soft">
                      <strong className="text-text">{status.monthsElapsed}</strong> de {targetMonths} meses{status.on ? ` em ${formatDateBR(status.on)}` : ''}
                      {status.skipTo && status.monthsElapsed >= targetMonths ? ' ✓' : ''}
                    </p>
                  ) : null}
                  {!status.skipTo && status.configured && !status.eligible && missingLabel(status) ? (
                    <p className="mt-1 text-sm font-medium text-text first-letter:uppercase">{missingLabel(status)}</p>
                  ) : null}
                </>
              )}
              <p className="mt-2 text-xs text-dim">
                {status.on ? `Próxima graduação: ${formatDateBR(status.on)}. Meses contados até essa data. ` : ''}
                Quem decide a graduação é o professor.
              </p>
            </div>
          ) : null}
        </Card>

        {data.graduations.length > 0 ? (
          <Card className="mt-2 divide-y divide-line">
            {data.graduations.map((g) => {
              const rank = rankById.get(g.rank_id)
              return (
                <div key={g.rank_id} className="flex items-center gap-3 px-3 py-2.5">
                  {rank ? <RankBand colors={rank.colors} /> : null}
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-text">{rank?.name ?? 'Grau'}</span>
                  <span className="text-xs text-dim">{formatDateBR(g.graduated_at)}</span>
                </div>
              )
            })}
          </Card>
        ) : null}
      </Section>

      {stats.byMonth.length > 0 ? (
        <Section title="Treinos por mês">
          <Card className="divide-y divide-line">
            {stats.byMonth.slice(0, 6).map((m) => (
              <div key={m.month} className="flex justify-between px-3 py-2 text-sm">
                <span className="text-soft first-letter:uppercase">{formatMonth(m.month)}</span>
                <span className="font-bold text-text">{m.count}</span>
              </div>
            ))}
          </Card>
        </Section>
      ) : null}

      <Section title="Histórico">
        {data.attendance.length === 0 ? (
          <EmptyState title="Nenhuma presença registrada ainda" />
        ) : (
          <>
            <Card className="divide-y divide-line">
              {rows.map((a) => (
                <div key={a.id} className="flex items-center gap-3 px-3 py-2">
                  <span className="w-20 shrink-0 text-sm font-medium text-text">{formatDayShort(a.date)}</span>
                  <span className="min-w-0 flex-1 truncate text-sm text-dim">
                    {a.class_id ? [formatTime(a.start_time), a.title].filter(Boolean).join(' · ') : a.location_label}
                  </span>
                  {(a.credits ?? 1) > 1 ? <Badge tone="gold">Vale {a.credits}</Badge> : null}
                  <StatusBadge status={a.status} />
                </div>
              ))}
            </Card>
            {data.attendance.length > rows.length ? (
              <Button variant="plain" block className="mt-1" onPress={() => setShowAll(true)}>Ver todos ({data.attendance.length})</Button>
            ) : null}
          </>
        )}
        {openingPresent + openingAbsent > 0 ? (
          <p className="mt-2 text-xs text-dim">
            Os totais incluem {openingPresent} presenças e {openingAbsent} faltas do sistema anterior
            {student.opening_until ? `, até ${formatDateBR(student.opening_until)}` : ''}.
          </p>
        ) : null}
      </Section>

      {!student.active ? <p className="mt-6 text-center"><Badge>Matrícula inativa</Badge></p> : null}
      {bottom}
    </>
  )
}

function Stat({ value, label, accent }: { value: number | string; label: string; accent?: boolean }) {
  return (
    <Card className="p-3">
      <p className={accent ? 'font-display text-3xl text-accent' : 'font-display text-3xl text-text'}>{value}</p>
      <p className="text-xs text-dim">{label}</p>
    </Card>
  )
}
