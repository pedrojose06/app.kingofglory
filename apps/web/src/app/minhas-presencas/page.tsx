'use client'

import {
  attendanceStats, formatDateBR, formatDayShort, formatMonth, formatTime, getStudentPortal, graduationStatus, isCounted,
  keys, missingLabel, trackOf, type StudentPortal,
} from '@kog/core'
import { Badge, Button, Card, EmptyState, Kicker, ProgressBar, RankBand, Title } from '@kog/ui'
import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { Section, StatusBadge, studentSince } from '@/components/common'
import { Loading } from '@/components/shell'
import { useToday } from '@/lib/queries'
import { getStoredStudentToken, storeStudentToken } from '@/lib/student-link'
import { db, isConfigured } from '@/lib/supabase'

/** Área do aluno: abre pelo link secreto que o professor envia (/minhas-presencas#token). Não exige login. */
export default function StudentPortalPage() {
  const [token, setToken] = useState<string | null | undefined>(undefined)

  useEffect(() => {
    const read = () => {
      const fromHash = window.location.hash.replace(/^#/, '').trim()
      setToken(fromHash || getStoredStudentToken())
    }
    read()
    window.addEventListener('hashchange', read)
    return () => window.removeEventListener('hashchange', read)
  }, [])

  const portal = useQuery({
    queryKey: keys.studentPortal(token ?? ''),
    queryFn: () => getStudentPortal(db(), token!),
    enabled: !!token && isConfigured,
  })

  // Link válido fica guardado no aparelho; link revogado é esquecido.
  useEffect(() => {
    if (!token || portal.isFetching) return
    if (portal.data) storeStudentToken(token)
    else if (portal.data === null && getStoredStudentToken() === token) storeStudentToken(null)
  }, [token, portal.data, portal.isFetching])

  return (
    <main className="mx-auto max-w-xl px-4 pt-[calc(env(safe-area-inset-top)+1.25rem)] pb-[calc(env(safe-area-inset-bottom)+2.5rem)]">
      {token === undefined || (token && portal.isPending) ? (
        <Loading />
      ) : !token || portal.data === null ? (
        <InvalidLink />
      ) : portal.data ? (
        <PortalView data={portal.data} updatedAt={portal.dataUpdatedAt} offline={portal.isError} />
      ) : (
        <div className="pt-16">
          <EmptyState title="Não foi possível carregar" action={<Button variant="ghost" onPress={() => void portal.refetch()}>Tentar de novo</Button>}>
            Confira a conexão com a internet.
          </EmptyState>
        </div>
      )}
      <p className="mt-10 text-center text-xs text-faint">
        <Link href="/login-professor" className="underline underline-offset-2">Sou professor</Link>
      </p>
    </main>
  )
}

function Brand() {
  return (
    <div className="mb-6 flex items-center gap-3">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/icons/icon-192.png" alt="" width={40} height={40} className="rounded-full ring-1 ring-line-strong" />
      <Kicker>King of Glory Academy</Kicker>
    </div>
  )
}

function InvalidLink() {
  return (
    <>
      <Brand />
      <EmptyState title="Link inválido ou desativado">
        Peça ao seu professor um novo link para acompanhar suas presenças.
      </EmptyState>
    </>
  )
}

function PortalView({ data, updatedAt, offline }: { data: StudentPortal; updatedAt: number; offline: boolean }) {
  const today = useToday()
  const [showAll, setShowAll] = useState(false)
  const { student } = data

  const status = useMemo(
    () => graduationStatus(data.progress ?? undefined, data.ranks, studentSince(student), today, { track: trackOf(student), birthDate: student.birth_date }),
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

  return (
    <>
      <Brand />
      <Kicker className="mb-1.5">{data.gym_name}</Kicker>
      <Title>{student.name}</Title>
      {offline ? (
        <p className="mt-2 text-xs text-warning">Sem conexão · mostrando dados de {new Date(updatedAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</p>
      ) : null}

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

          {status.next ? (
            <div className="mt-4 border-t border-line pt-4">
              <div className="mb-2 flex items-center gap-2">
                <p className="min-w-0 flex-1 text-sm font-bold text-text">Próximo: {status.next.name}</p>
                <RankBand colors={status.next.colors} />
              </div>
              {status.byAge ? (
                <p className="text-sm text-soft">
                  {status.ageNeeded != null ? `A partir de ${status.ageNeeded} anos (idade que você completa no ano).` : 'Graduação infantil por idade.'}
                </p>
              ) : (
                <>
                  {status.needed != null ? (
                    <>
                      <ProgressBar value={Math.min(status.count, status.needed)} max={status.needed || 1} />
                      <p className="mt-1.5 text-sm text-soft">
                        <strong className="text-text">{status.count}</strong> de {status.needed} treinos <span className="text-dim">{since}</span>
                      </p>
                    </>
                  ) : (
                    <p className="text-sm text-soft"><strong className="text-text">{status.count}</strong> treinos {since}</p>
                  )}
                  {status.monthsNeeded != null ? (
                    <p className="mt-1 text-sm text-soft">
                      <strong className="text-text">{status.monthsElapsed}</strong> de {status.monthsNeeded} meses
                    </p>
                  ) : null}
                  {status.configured && !status.eligible && missingLabel(status) ? (
                    <p className="mt-1 text-sm font-medium text-text first-letter:uppercase">{missingLabel(status)}</p>
                  ) : null}
                </>
              )}
              <p className="mt-2 text-xs text-dim">A data da graduação é definida pelo professor.</p>
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
