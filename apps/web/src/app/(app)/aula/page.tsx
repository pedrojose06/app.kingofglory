'use client'

import { formatDayLong, formatTime, minutesSinceClassStart, overlayClassStatus } from '@kog/core'
import { Badge, Button, cn, EmptyState } from '@kog/ui'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { ClassPhotos } from '@/components/class-photos'
import { useParam } from '@/components/common'
import { RollCall } from '@/components/roll-call'
import { Loading, Page } from '@/components/shell'
import { outbox, useOutbox } from '@/lib/outbox'
import { useClass, useClassPhotos, useGyms, usePendingClasses, useStudents, useToday } from '@/lib/queries'

// O editor (Tiptap/ProseMirror) só é baixado quando a aba Plano é aberta.
const PlanEditor = dynamic(() => import('@/components/plan-editor').then((m) => m.PlanEditor), { ssr: false, loading: () => <Loading /> })

const TABS = [
  { id: 'chamada', label: 'Chamada' },
  { id: 'plano', label: 'Plano' },
  { id: 'fotos', label: 'Fotos' },
] as const
type Tab = (typeof TABS)[number]['id']

/** Aberta 1h ou mais depois do início, a aula começa na aba Fotos: a chamada sai do reconhecimento facial. */
const FACE_FIRST_AFTER_MINUTES = 60

export default function ClassPage() {
  const id = useParam('id')
  const inQueue = useParam('fila') === '1'
  const router = useRouter()
  const klass = useClass(id)
  const gyms = useGyms()
  const pending = usePendingClasses()
  const items = useOutbox()
  const today = useToday()
  const students = useStudents()
  const photos = useClassPhotos(id)
  // ?aba=plano abre direto no plano (toque no lembrete do plano de aula). Sem escolha, a aba inicial vem da aula.
  const [chosenTab, setChosenTab] = useState<Tab | null>(useParam('aba') === 'plano' ? 'plano' : null)
  // Hora de abertura da tela (não muda enquanto o professor está nela).
  const [openedAt] = useState(() => new Date())
  // A aula abriu na aba Fotos para a chamada pelo rosto (sair dela sem foto pede confirmação).
  const [faceMode, setFaceMode] = useState(false)

  if (klass.isPending && klass.fetchStatus !== 'paused') return <Loading />
  const c = klass.data
  if (!c) {
    return (
      <Page title="Aula" back>
        <EmptyState title="Aula não encontrada">Ela pode não estar disponível offline.</EmptyState>
      </Page>
    )
  }

  const status = overlayClassStatus(c.status, items, c.id)
  const hasPhoto =
    (photos.data?.length ?? 0) > 0 || items.some((i) => i.op.type === 'photo.upload' && i.op.meta.class_id === c.id)

  // Aba inicial, decidida uma vez (com alunos e fotos já lidos, do servidor ou do cache offline): chamada pelo rosto
  // quando a aula ainda está aberta, começou há 1h ou mais, não tem foto e há aluno da academia que autorizou a imagem.
  const settled = (q: { data: unknown; fetchStatus: string }) => q.data !== undefined || q.fetchStatus !== 'fetching'
  if (chosenTab === null && settled(students) && settled(photos)) {
    const faceFirst =
      status === 'scheduled' &&
      !hasPhoto &&
      (minutesSinceClassStart(c.date, c.start_time, openedAt) ?? -1) >= FACE_FIRST_AFTER_MINUTES &&
      (students.data ?? []).some((s) => s.gym_id === c.gym_id && s.active && s.image_consent_at)
    setChosenTab(faceFirst ? 'fotos' : 'chamada')
    setFaceMode(faceFirst)
  }
  const tab: Tab = chosenTab ?? 'chamada'
  const setTab = (next: Tab) => {
    if (tab === 'fotos' && next === 'chamada' && faceMode && !hasPhoto) {
      if (!window.confirm('Deseja cancelar a chamada por reconhecimento facial? Você vai fazer a chamada manualmente.')) return
      setFaceMode(false)
    }
    setChosenTab(next)
  }
  const gymName = gyms.data?.find((g) => g.id === c.gym_id)?.name ?? 'Academia'

  // Fila de pendências: ao concluir, pula direto para a próxima aula em aberto.
  const goNext = () => {
    if (!inQueue) return router.back()
    const next = (pending.data ?? []).find((p) => p.id !== c.id && overlayClassStatus(p.status, items, p.id) === 'scheduled')
    router.replace(next ? `/aula?id=${next.id}&fila=1` : '/pendencias')
  }
  const conclude = () => {
    outbox.add({ type: 'class.conclude', classId: c.id })
    goNext()
  }
  const cancel = () => {
    if (!window.confirm('Marcar que não houve aula neste dia?')) return
    outbox.add({ type: 'class.status', classId: c.id, status: 'cancelled' })
    goNext()
  }
  const reopen = () => outbox.add({ type: 'class.status', classId: c.id, status: 'scheduled' })

  return (
    <Page
      title={gymName}
      kicker={`${formatDayLong(c.date)}${c.start_time ? ` · ${formatTime(c.start_time)}` : ''}`}
      back={inQueue ? '/pendencias' : true}
      actions={status === 'done' ? <Badge tone="success">Concluída</Badge> : status === 'cancelled' ? <Badge>Cancelada</Badge> : null}
    >
      <div role="tablist" className="mb-4 flex border-b border-line">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={cn('-mb-px h-11 flex-1 border-b-2 font-display text-base uppercase tracking-[0.1em]', tab === t.id ? 'border-gold text-accent' : 'border-transparent text-dim')}
          >
            {t.label}
          </button>
        ))}
      </div>

      {chosenTab === null ? (
        <Loading />
      ) : tab === 'chamada' ? (
        <>
          {c.date > today && status === 'scheduled' ? (
            <EmptyState
              title="A chamada abre no dia da aula"
              action={<Button variant="ghost" onPress={() => setTab('plano')}>Escrever o plano</Button>}
            >
              Até lá, você já pode adiantar o plano. Se não for haver aula,{' '}
              <button type="button" className="font-bold text-accent underline" onClick={cancel}>marque que não vai ter</button>.
            </EmptyState>
          ) : status === 'cancelled' ? (
            <EmptyState title="Não houve aula neste dia" action={<Button variant="ghost" onPress={reopen}>Reabrir aula</Button>} />
          ) : (
            <>
              <RollCall klass={c} />
              <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-30 border-t border-line bg-bg/95 px-4 py-2.5 backdrop-blur">
                <div className="mx-auto flex max-w-xl gap-2">
                  {status === 'done' ? (
                    <>
                      <Button variant="ghost" className="flex-1" onPress={reopen}>Reabrir chamada</Button>
                      {inQueue ? <Button className="flex-1" onPress={goNext}>Próxima</Button> : null}
                    </>
                  ) : (
                    <>
                      <Button variant="plain" className="px-3 whitespace-nowrap" onPress={cancel}>Não houve</Button>
                      <Button className="flex-1" onPress={conclude}>{inQueue ? 'Concluir · próxima' : 'Concluir chamada'}</Button>
                    </>
                  )}
                </div>
              </div>
              <div className="h-20" />
            </>
          )}
        </>
      ) : tab === 'plano' ? (
        <PlanEditor classId={c.id} gymId={c.gym_id} shareContext={{ gymName, date: c.date }} />
      ) : (
        <ClassPhotos klass={c} />
      )}
    </Page>
  )
}
