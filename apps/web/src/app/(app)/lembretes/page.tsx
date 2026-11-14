'use client'

import {
  formatTime, keys, saveReminders, sendTestPush, toReminderPlan, WEEKDAYS_SHORT, type ClassSchedule, type ReminderPlan,
} from '@kog/core'
import { Badge, Button, Card, Chip, EmptyState, Field, Input } from '@kog/ui'
import { BellOff, BellRing } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Section } from '@/components/common'
import { Loading, Page } from '@/components/shell'
import { useUserId } from '@/lib/auth'
import { disablePush, enablePush, getPushState, type PushState } from '@/lib/push'
import { useGyms, useReminders, useSave, useSchedules } from '@/lib/queries'
import { db } from '@/lib/supabase'
import { toast, toastError } from '@/lib/toast'

type Mode = 'off' | 'single' | 'each'

const DEFAULT_TIME = '22:30'
const TIME_RE = /^\d{2}:\d{2}$/

const PUSH_HELP: Partial<Record<PushState, string>> = {
  unconfigured: 'As notificações ainda não foram configuradas neste ambiente (falta a chave VAPID).',
  unsupported:
    'Este navegador não recebe notificações. No iPhone, instale o app na Tela de Início (Compartilhar › Adicionar à Tela de Início) e abra por lá.',
  'no-worker': 'As notificações só funcionam na versão publicada do app.',
  denied: 'As notificações estão bloqueadas para este app. Libere nas configurações do aparelho ou do navegador e volte aqui.',
}

export default function RemindersPage() {
  const userId = useUserId()
  const gyms = useGyms()
  const schedules = useSchedules()
  const reminders = useReminders()

  const [push, setPush] = useState<PushState | null>(null)
  const [busy, setBusy] = useState(false)
  const [mode, setMode] = useState<Mode>('off')
  const [time, setTime] = useState(DEFAULT_TIME)
  const [each, setEach] = useState<Record<string, string>>({})

  useEffect(() => {
    getPushState().then(setPush, () => setPush('unsupported'))
  }, [])

  // Carrega o que está salvo (e recarrega depois de salvar).
  const saved = useMemo(() => (reminders.data ? toReminderPlan(reminders.data) : null), [reminders.data])
  useEffect(() => {
    if (!saved) return
    const hasEach = Object.keys(saved.bySchedule).length > 0
    setMode(hasEach ? 'each' : saved.general ? 'single' : 'off')
    setTime(saved.general ?? DEFAULT_TIME)
    setEach(saved.bySchedule)
  }, [saved])

  // "Minhas turmas": horários da grade em que o professor é o responsável.
  const mine = useMemo(() => (schedules.data ?? []).filter((s) => s.instructor_id === userId), [schedules.data, userId])
  const gymName = (id: string) => gyms.data?.find((g) => g.id === id)?.name ?? 'Academia'

  const plan: ReminderPlan =
    mode === 'single'
      ? { general: time, bySchedule: {} }
      : mode === 'each'
        ? { general: null, bySchedule: Object.fromEntries(mine.filter((s) => each[s.id]).map((s) => [s.id, each[s.id]!])) }
        : { general: null, bySchedule: {} }
  const dirty = saved !== null && JSON.stringify(sortPlan(plan)) !== JSON.stringify(sortPlan(saved))

  const save = useSave(
    async () => {
      const times = [plan.general, ...Object.values(plan.bySchedule)].filter((t) => t !== null)
      if (times.some((t) => !TIME_RE.test(t))) throw new Error('Informe um horário válido')
      await saveReminders(db(), plan)
    },
    [keys.reminders],
    () => toast(mode === 'off' ? 'Lembrete desligado' : 'Lembrete salvo'),
  )

  async function togglePush() {
    setBusy(true)
    try {
      if (push === 'on') {
        await disablePush()
        setPush(await getPushState())
      } else {
        const next = await enablePush()
        setPush(next)
        if (next === 'on') toast('Notificações ativadas neste aparelho')
      }
    } catch (error) {
      toastError(error)
    } finally {
      setBusy(false)
    }
  }

  async function test() {
    setBusy(true)
    try {
      const { sent } = await sendTestPush(db())
      toast(sent > 0 ? 'Teste enviado. Deve chegar em instantes.' : 'Nenhum aparelho recebeu o teste', sent > 0 ? 'info' : 'error')
    } catch (error) {
      toastError(error)
    } finally {
      setBusy(false)
    }
  }

  if (reminders.isPending || schedules.isPending || push === null) return <Loading />

  const help = PUSH_HELP[push]

  return (
    <Page title="Lembrete de chamada" kicker="Notificações" back="/mais">
      <p className="text-sm text-dim">
        Nos dias em que você tem aula, o app avisa no horário escolhido se a chamada ainda estiver em aberto. Chamada
        concluída ou aula cancelada não gera aviso.
      </p>

      <Section title="Neste aparelho">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            {push === 'on' ? <BellRing className="size-5 shrink-0 text-accent" /> : <BellOff className="size-5 shrink-0 text-dim" />}
            <p className="min-w-0 flex-1 text-sm font-medium text-text">Notificações</p>
            {push === 'on' ? <Badge tone="success">Ativadas</Badge> : <Badge>Desativadas</Badge>}
          </div>
          {help ? (
            <p className="mt-3 text-sm text-dim">{help}</p>
          ) : (
            <div className="mt-3 flex gap-2">
              <Button size="sm" variant={push === 'on' ? 'ghost' : 'gold'} loading={busy} onPress={togglePush} className="flex-1">
                {push === 'on' ? 'Desativar' : 'Ativar notificações'}
              </Button>
              {push === 'on' ? (
                <Button size="sm" variant="ghost" disabled={busy} onPress={test} className="flex-1">Enviar teste</Button>
              ) : null}
            </div>
          )}
        </Card>
        <p className="mt-2 text-xs text-dim">Ative em cada aparelho em que quiser receber o aviso. Os horários abaixo valem para todos.</p>
      </Section>

      <Section title="Quando avisar">
        <div className="flex gap-2">
          <Chip active={mode === 'off'} onPress={() => setMode('off')} className="flex-1">Desligado</Chip>
          <Chip active={mode === 'single'} onPress={() => setMode('single')} className="flex-1">Um horário</Chip>
          <Chip active={mode === 'each'} onPress={() => setMode('each')} className="flex-1">Por turma</Chip>
        </div>

        {mode === 'single' ? (
          <Field label="Horário do aviso" hint="Um aviso só, com todas as turmas do dia que estiverem sem chamada." className="mt-4">
            <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </Field>
        ) : null}

        {mode === 'each' ? (
          mine.length === 0 ? (
            <div className="mt-4">
              <EmptyState title="Sem turmas na grade">Cadastre os horários em Mais › Academias e grade semanal.</EmptyState>
            </div>
          ) : (
            <>
              <Card className="mt-4 divide-y divide-line">
                {mine.map((s) => (
                  <ScheduleRow
                    key={s.id}
                    schedule={s}
                    gym={gymName(s.gym_id)}
                    value={each[s.id]}
                    onChange={(value) =>
                      setEach((prev) => {
                        const next = { ...prev }
                        if (value) next[s.id] = value
                        else delete next[s.id]
                        return next
                      })
                    }
                  />
                ))}
              </Card>
              <p className="mt-2 text-xs text-dim">Marque as turmas que devem avisar e escolha o horário de cada uma.</p>
            </>
          )
        ) : null}

        {dirty ? (
          <Button block className="mt-4" loading={save.isPending} onPress={() => save.mutate()}>Salvar</Button>
        ) : null}
        {mode !== 'off' && !dirty && push !== 'on' ? (
          <p className="mt-3 text-xs text-warning">O lembrete está salvo, mas este aparelho não está com as notificações ativadas.</p>
        ) : null}
      </Section>
    </Page>
  )
}

function sortPlan(plan: ReminderPlan) {
  return { general: plan.general, bySchedule: Object.entries(plan.bySchedule).sort(([a], [b]) => a.localeCompare(b)) }
}

function ScheduleRow({ schedule, gym, value, onChange }: { schedule: ClassSchedule; gym: string; value: string | undefined; onChange: (value: string | null) => void }) {
  const on = value !== undefined
  return (
    <div className="flex items-center gap-3 px-3 py-2">
      <label className="flex min-h-11 min-w-0 flex-1 items-center gap-3">
        <input type="checkbox" className="size-5 shrink-0 accent-accent" checked={on} onChange={(e) => onChange(e.target.checked ? DEFAULT_TIME : null)} />
        <span className="min-w-0">
          <span className="block font-display text-base uppercase text-accent">{WEEKDAYS_SHORT[schedule.weekday]} {formatTime(schedule.start_time)}</span>
          <span className="block truncate text-xs text-dim">{gym} · {schedule.title}</span>
        </span>
      </label>
      {on ? (
        <Input
          type="time"
          aria-label="Horário do aviso"
          value={value}
          // Esvaziar o campo desmarca a turma.
          onChange={(e) => onChange(e.target.value || null)}
          className="h-10 w-32 shrink-0"
        />
      ) : null}
    </div>
  )
}
