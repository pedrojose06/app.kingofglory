'use client'

import type { Json } from '@kog/core'
import { cn, Sheet } from '@kog/ui'
import { Placeholder } from '@tiptap/extensions'
import { Extension, type Editor, type Range } from '@tiptap/core'
import { EditorContent, useEditor } from '@tiptap/react'
import Suggestion, { type SuggestionKeyDownProps, type SuggestionProps } from '@tiptap/suggestion'
import { Plus } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { PlanReviewBanner, PlanShareButton } from '@/components/plan-share'
import { planExtensions } from '@/components/plan-extensions'
import { Loading } from '@/components/shell'
import { outbox, useOnline, useOutbox } from '@/lib/outbox'
import { useLessonPlan } from '@/lib/queries'

interface BlockItem {
  title: string
  hint: string
  keywords: string
  run: (editor: Editor, range?: Range) => void
}

const chain = (editor: Editor, range?: Range) => (range ? editor.chain().focus().deleteRange(range) : editor.chain().focus())

const BLOCKS: BlockItem[] = [
  { title: 'Texto', hint: 'Parágrafo simples', keywords: 'texto paragrafo', run: (e, r) => chain(e, r).setParagraph().run() },
  { title: 'Título 1', hint: '# ', keywords: 'titulo h1 heading', run: (e, r) => chain(e, r).setHeading({ level: 1 }).run() },
  { title: 'Título 2', hint: '## ', keywords: 'titulo h2 heading', run: (e, r) => chain(e, r).setHeading({ level: 2 }).run() },
  { title: 'Título 3', hint: '### ', keywords: 'titulo h3 heading', run: (e, r) => chain(e, r).setHeading({ level: 3 }).run() },
  { title: 'Lista', hint: '- ', keywords: 'lista bullet marcadores', run: (e, r) => chain(e, r).toggleBulletList().run() },
  { title: 'Lista numerada', hint: '1. ', keywords: 'lista numerada ordenada', run: (e, r) => chain(e, r).toggleOrderedList().run() },
  { title: 'Checklist', hint: '[ ] ', keywords: 'checklist tarefa todo', run: (e, r) => chain(e, r).toggleTaskList().run() },
  { title: 'Toggle', hint: 'Bloco que abre e fecha', keywords: 'toggle detalhes recolher', run: (e, r) => chain(e, r).setDetails().run() },
  { title: 'Citação', hint: '> ', keywords: 'citacao quote', run: (e, r) => chain(e, r).toggleBlockquote().run() },
  { title: 'Divisor', hint: '---', keywords: 'divisor linha separador', run: (e, r) => chain(e, r).setHorizontalRule().run() },
]

const strip = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const filterBlocks = (query: string) => {
  const q = strip(query)
  return BLOCKS.filter((b) => strip(b.title).includes(q) || b.keywords.includes(q))
}

interface SlashState {
  items: BlockItem[]
  index: number
  rect: DOMRect | null
  command: (item: BlockItem) => void
}

/** Extensão do comando "/": o Tiptap detecta o gatilho e a UI do menu fica no React via callbacks. */
function slashExtension(handlers: { set: (s: SlashState | null) => void; key: (e: KeyboardEvent) => boolean }) {
  return Extension.create({
    name: 'slashCommand',
    addProseMirrorPlugins() {
      return [
        Suggestion<BlockItem, BlockItem>({
          editor: this.editor,
          char: '/',
          startOfLine: false,
          items: ({ query }) => filterBlocks(query),
          command: ({ editor, range, props }) => props.run(editor, range),
          render: () => {
            const push = (p: SuggestionProps<BlockItem, BlockItem>) =>
              handlers.set(p.items.length === 0 ? null : { items: p.items, index: 0, rect: p.clientRect?.() ?? null, command: p.command })
            return {
              onStart: push,
              onUpdate: push,
              onKeyDown: (p: SuggestionKeyDownProps) => handlers.key(p.event),
              onExit: () => handlers.set(null),
            }
          },
        }),
      ]
    },
  })
}

const isEmptyDoc = (content: unknown) => !content || typeof content !== 'object' || !('type' in (content as object))

export function PlanEditor({ classId }: { classId: string }) {
  const plan = useLessonPlan(classId)
  const items = useOutbox()
  const pendingItem = items.find((i) => i.op.type === 'plan.save' && i.op.classId === classId)

  // Sem dado em cache e sem rede: não abrir editor vazio, para não sobrescrever o plano do servidor.
  if (!pendingItem && plan.data === undefined) {
    if (plan.fetchStatus === 'paused' || plan.isError) {
      return <p className="rounded border border-line p-4 text-sm text-dim">Sem conexão e este plano ainda não foi aberto neste aparelho. Ele aparece assim que houver sinal.</p>
    }
    return <Loading />
  }

  const initial = pendingItem?.op.type === 'plan.save' ? pendingItem.op.content : (plan.data?.content ?? null)
  return (
    <EditorInner
      key={classId}
      classId={classId}
      initial={initial}
      pending={!!pendingItem}
      failed={!!pendingItem?.error}
      planUpdatedAt={plan.data?.updated_at ?? null}
    />
  )
}

function EditorInner({ classId, initial, pending, failed, planUpdatedAt }: { classId: string; initial: Json | null; pending: boolean; failed: boolean; planUpdatedAt: string | null }) {
  const online = useOnline()
  const [slash, setSlash] = useState<SlashState | null>(null)
  const [insertOpen, setInsertOpen] = useState(false)
  const [dirty, setDirty] = useState(false)
  const slashRef = useRef<SlashState | null>(null)
  slashRef.current = slash
  const timer = useRef<number | undefined>(undefined)
  const latest = useRef<Json | null>(null)

  const save = () => {
    window.clearTimeout(timer.current)
    timer.current = undefined
    if (latest.current === null) return
    outbox.add({ type: 'plan.save', classId, content: latest.current, updatedAt: new Date().toISOString() })
    latest.current = null
    setDirty(false)
  }
  const saveRef = useRef(save)
  saveRef.current = save

  const extensions = useMemo(
    () => [
      ...planExtensions(),
      Placeholder.configure({
        includeChildren: true,
        placeholder: ({ node }) => (node.type.name === 'detailsSummary' ? 'Título do toggle' : node.type.name === 'heading' ? 'Título' : 'Escreva, ou digite / para blocos'),
      }),
      slashExtension({
        set: setSlash,
        key: (event) => {
          const s = slashRef.current
          if (!s) return false
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            const delta = event.key === 'ArrowDown' ? 1 : -1
            setSlash({ ...s, index: (s.index + delta + s.items.length) % s.items.length })
            return true
          }
          if (event.key === 'Enter') {
            const item = s.items[s.index]
            if (item) s.command(item)
            return true
          }
          return false
        },
      }),
    ],
    [],
  )

  const editor = useEditor({
    extensions,
    content: isEmptyDoc(initial) ? '' : (initial as object),
    immediatelyRender: false,
    onUpdate: ({ editor }) => {
      latest.current = editor.getJSON() as Json
      setDirty(true)
      window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => saveRef.current(), 1200)
    },
  })

  // Sai da tela ou o app vai para segundo plano com edição pendente: salva na hora.
  useEffect(() => {
    const flush = () => saveRef.current()
    const onHide = () => document.visibilityState === 'hidden' && flush()
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('pagehide', flush)
    return () => {
      document.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('pagehide', flush)
      flush()
    }
  }, [])

  const status = failed ? 'Erro ao salvar — veja Sincronização' : dirty ? 'Editando…' : pending ? (online ? 'Salvando…' : 'Salvo neste aparelho (offline)') : 'Salvo'
  const viewport = typeof window === 'undefined' ? 0 : window.innerHeight

  return (
    <div className="plan-editor">
      <div className="mb-2 flex items-center justify-between">
        <p className={cn('text-xs', failed ? 'text-danger' : 'text-dim')} aria-live="polite">{status}</p>
        <div className="flex gap-2">
          <PlanShareButton classId={classId} unsynced={pending || dirty} planUpdatedAt={planUpdatedAt} />
          <button type="button" onClick={() => setInsertOpen(true)} className="flex h-9 items-center gap-1 rounded border border-line px-2.5 text-xs font-bold uppercase tracking-[0.1em] text-accent">
            <Plus className="size-4" /> Bloco
          </button>
        </div>
      </div>

      <PlanReviewBanner classId={classId} planUpdatedAt={planUpdatedAt} />

      <EditorContent editor={editor} />

      {slash ? (
        <div
          className="fixed z-50 max-h-64 w-64 overflow-y-auto rounded-lg border border-line-strong bg-surface p-1 shadow-xl"
          style={{
            left: Math.max(8, Math.min((slash.rect?.left ?? 16), (typeof window === 'undefined' ? 320 : window.innerWidth) - 264)),
            ...((slash.rect?.bottom ?? 0) > viewport - 280
              ? { bottom: viewport - (slash.rect?.top ?? 0) + 6 }
              : { top: (slash.rect?.bottom ?? 0) + 6 }),
          }}
          role="listbox"
        >
          {slash.items.map((item, i) => (
            <button
              key={item.title}
              type="button"
              role="option"
              aria-selected={i === slash.index}
              onMouseDown={(e) => {
                e.preventDefault()
                slash.command(item)
              }}
              className={cn('flex w-full items-center justify-between rounded px-3 py-2 text-left text-sm', i === slash.index ? 'bg-tint text-text' : 'text-soft')}
            >
              <span className="font-medium">{item.title}</span>
              <span className="text-xs text-faint">{item.hint}</span>
            </button>
          ))}
        </div>
      ) : null}

      <Sheet open={insertOpen} onClose={() => setInsertOpen(false)} title="Inserir bloco">
        <div className="grid grid-cols-2 gap-2">
          {BLOCKS.map((item) => (
            <button
              key={item.title}
              type="button"
              onClick={() => {
                setInsertOpen(false)
                if (editor) item.run(editor)
              }}
              className="rounded border border-line px-3 py-3 text-left active:bg-tint"
            >
              <span className="block text-sm font-bold text-text">{item.title}</span>
              <span className="block text-xs text-dim">{item.hint}</span>
            </button>
          ))}
        </div>
      </Sheet>
    </div>
  )
}
