'use client'

import {
  DEFAULT_STUDENT_REMINDER_LEAD, STUDENT_REMINDER_LEADS, getStudentClassReminder, keys, saveStudentClassReminder,
} from '@kog/core'
import { Badge, Button, Card, Chip } from '@kog/ui'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { BellOff, BellRing } from 'lucide-react'
import { useEffect, useState } from 'react'
import { enablePush, getPushState, syncPushSubscription, type PushState } from '@/lib/push'
import { db } from '@/lib/supabase'
import { toast, toastError } from '@/lib/toast'

const LEAD_LABEL: Record<number, string> = { 30: '30 min', 60: '1 h', 120: '2 h', 180: '3 h' }

const PUSH_HELP: Partial<Record<PushState, string>> = {
  unconfigured: 'Os lembretes ainda não estão disponíveis.',
  unsupported:
    'Este navegador não recebe notificações. No iPhone, instale o app na Tela de Início (Compartilhar › Adicionar à Tela de Início) e abra por lá.',
  'no-worker': 'Os lembretes só funcionam na versão publicada do app.',
  denied: 'As notificações estão bloqueadas para este app. Libere nas configurações do aparelho ou do navegador e volte aqui.',
}

/**
 * Lembrete das aulas na área do aluno (conta): um aviso por dia antes da próxima aula da academia dele.
 * Ligar pede a permissão de notificação deste aparelho; desligar para os avisos em todos os aparelhos da conta.
 */
export function StudentReminderCard() {
  const queryClient = useQueryClient()
  const reminder = useQuery({ queryKey: keys.studentClassReminder, queryFn: () => getStudentClassReminder(db()), networkMode: 'online' })
  const [push, setPush] = useState<PushState | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    getPushState().then(setPush, () => setPush('unsupported'))
    // A inscrição pode ter sido renovada pelo navegador ou o aparelho trocado de conta.
    void syncPushSubscription().catch(() => {})
  }, [])

  const lead = reminder.data?.lead_minutes ?? DEFAULT_STUDENT_REMINDER_LEAD
  const enabled = !!reminder.data?.enabled
  const on = enabled && push === 'on'

  async function save(next: { enabled: boolean; lead_minutes: number }) {
    await saveStudentClassReminder(db(), next)
    await queryClient.invalidateQueries({ queryKey: keys.studentClassReminder })
  }

  async function toggle() {
    setBusy(true)
    try {
      if (on) {
        await save({ enabled: false, lead_minutes: lead })
        toast('Lembrete das aulas desligado')
        return
      }
      const state = await enablePush()
      setPush(state)
      if (state !== 'on') return
      await save({ enabled: true, lead_minutes: lead })
      toast('Lembrete das aulas ligado')
    } catch (error) {
      toastError(error)
    } finally {
      setBusy(false)
    }
  }

  async function changeLead(minutes: number) {
    if (minutes === lead) return
    setBusy(true)
    try {
      await save({ enabled, lead_minutes: minutes })
    } catch (error) {
      toastError(error)
    } finally {
      setBusy(false)
    }
  }

  if (reminder.isPending || push === null) return null
  const help = PUSH_HELP[push]

  return (
    <Card className="mt-6 p-4">
      <div className="flex items-center gap-3">
        {on ? <BellRing className="size-5 shrink-0 text-accent" /> : <BellOff className="size-5 shrink-0 text-dim" />}
        <p className="min-w-0 flex-1 text-sm font-bold text-text">Lembrete das aulas</p>
        {on ? <Badge tone="success">Ligado</Badge> : <Badge>Desligado</Badge>}
      </div>
      <p className="mt-2 text-sm text-dim">
        Nos dias de aula, o app avisa antes do treino com os horários do dia. Aula cancelada não gera aviso.
      </p>
      {help && !on ? (
        <p className="mt-3 text-sm text-dim">{help}</p>
      ) : (
        <>
          {on ? (
            <div className="mt-3" role="group" aria-label="Avisar quanto tempo antes">
              <p className="mb-1.5 text-xs font-bold uppercase tracking-[0.12em] text-dim">Avisar antes da aula</p>
              <div className="grid grid-cols-4 gap-2">
                {STUDENT_REMINDER_LEADS.map((m) => (
                  <Chip key={m} active={lead === m} onPress={() => void changeLead(m)} className="w-full px-1">{LEAD_LABEL[m]}</Chip>
                ))}
              </div>
            </div>
          ) : null}
          <Button block size="sm" variant={on ? 'ghost' : 'gold'} className="mt-3" loading={busy} onPress={toggle}>
            {on ? 'Desligar lembrete' : 'Ligar lembrete das aulas'}
          </Button>
        </>
      )}
    </Card>
  )
}
