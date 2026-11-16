'use client'

import { DEFAULT_PLAN_TEMPLATE, keys, resetPlanTemplate, savePlanTemplate, type Json } from '@kog/core'
import { Button } from '@kog/ui'
import dynamic from 'next/dynamic'
import { useRef, useState } from 'react'
import { Loading, Page } from '@/components/shell'
import { useOnline } from '@/lib/outbox'
import { usePlanTemplate, useSave } from '@/lib/queries'
import { db } from '@/lib/supabase'
import { toast } from '@/lib/toast'

// O editor (Tiptap/ProseMirror) só é baixado quando a tela abre.
const DocEditor = dynamic(() => import('@/components/plan-editor').then((m) => m.DocEditor), { ssr: false, loading: () => <Loading /> })

/** Esqueleto com que todo plano de aula novo abre. Cada professor edita o seu; sem modelo vale o padrão da equipe. */
export default function PlanTemplatePage() {
  const template = usePlanTemplate()
  const online = useOnline()
  const [dirty, setDirty] = useState(false)
  const [version, setVersion] = useState(0)
  const latest = useRef<Json | null>(null)

  const save = useSave(
    () => savePlanTemplate(db(), template.data?.id ?? null, latest.current!),
    [keys.planTemplate],
    () => {
      setDirty(false)
      toast('Modelo salvo: os próximos planos abrem com ele')
    },
  )
  const reset = useSave(() => resetPlanTemplate(db()), [keys.planTemplate], () => {
    latest.current = null
    setDirty(false)
    setVersion((v) => v + 1) // recria o editor com o esqueleto padrão
    toast('Modelo voltou ao padrão da equipe')
  })

  return (
    <Page title="Modelo do plano" kicker="Plano de aula" back="/mais">
      <p className="mb-4 text-sm text-dim">
        Todo plano de aula ainda em branco abre com este esqueleto, pronto para preencher. Em cada aula você pode mudar
        o que quiser; aqui muda só o ponto de partida dos próximos planos.
      </p>

      {template.isPending && template.fetchStatus !== 'paused' ? (
        <Loading />
      ) : (
        <DocEditor
          key={`${template.data?.id ?? 'padrao'}-${version}`}
          initial={template.data?.content ?? DEFAULT_PLAN_TEMPLATE}
          onChange={(content) => {
            latest.current = content
            setDirty(true)
          }}
          status={<p className="text-xs text-dim">{template.data ? 'Seu modelo' : 'Padrão da equipe'}{dirty ? ' · não salvo' : ''}</p>}
        />
      )}

      <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-30 border-t border-line bg-bg/95 px-4 py-2.5 backdrop-blur">
        <div className="mx-auto flex max-w-xl gap-2">
          <Button
            variant="plain"
            className="px-3 whitespace-nowrap"
            disabled={!online || (!template.data && !dirty)}
            loading={reset.isPending}
            onPress={() => window.confirm('Voltar ao esqueleto padrão da equipe? Seu modelo será apagado.') && reset.mutate()}
          >
            Restaurar padrão
          </Button>
          <Button className="flex-1" disabled={!dirty || !online} loading={save.isPending} onPress={() => save.mutate()}>
            {online ? 'Salvar modelo' : 'Sem conexão'}
          </Button>
        </div>
      </div>
      <div className="h-20" />
    </Page>
  )
}
