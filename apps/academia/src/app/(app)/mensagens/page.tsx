'use client'

import {
  deleteMessageTemplate, fillTemplate, formatBRL, isMoneyField, MESSAGE_TEMPLATE_EXAMPLE, type MessageTemplate, missingFields, parseBRL,
  saveMessageDefaults, saveMessageTemplate, templateDefaults, templateFields, whatsappShareLink,
} from '@kog/core'
import { Button, cn, EmptyState, Field, Input, Textarea } from '@kog/ui'
import { toast, toastError } from '@kog/web-kit'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Bold, Braces, Copy, Italic, MessageCircle, Pencil, Plus, Smile, Strikethrough } from 'lucide-react'
import { Fragment, useMemo, useRef, useState, type ReactNode } from 'react'
import { Dialog, MoneyInput } from '@/components/kit'
import { PageHeader } from '@/components/shell'
import { ErrorState, FormMessage, Loading } from '@/components/states'
import { useAcademy } from '@/lib/academy'
import { keys, useMessageTemplates } from '@/lib/queries'
import { db } from '@/lib/supabase'

type Draft = { id: string | null; title: string; body: string; defaults: Record<string, string> }

const EMPTY_DRAFT: Draft = { id: null, title: '', body: '', defaults: {} }

export default function MessagesPage() {
  const { academy, isStaff } = useAcademy()
  const templates = useMessageTemplates()
  const [editing, setEditing] = useState<Draft | null>(null)
  const [using, setUsing] = useState<MessageTemplate | null>(null)

  if (!isStaff) {
    return (
      <>
        <PageHeader kicker={academy.name} title="Mensagens" />
        <EmptyState title="Só o administrador e os professores da academia acessam as mensagens padrão." />
      </>
    )
  }

  const fromTemplate = (t: MessageTemplate): Draft => ({ id: t.id, title: t.title, body: t.body, defaults: templateDefaults(t.defaults) })

  return (
    <>
      <PageHeader
        kicker={academy.name}
        title="Mensagens"
        actions={
          <Button onPress={() => setEditing(EMPTY_DRAFT)}>
            <Plus className="size-4" /> Nova mensagem
          </Button>
        }
      />
      <p className="-mt-3 mb-6 max-w-3xl text-sm text-dim">
        Textos prontos para os grupos do WhatsApp. O texto fica salvo; o que muda a cada envio (data, horário, valor…) fica entre chaves, como{' '}
        <code className="rounded bg-tint px-1 text-accent">{'{Data}'}</code>, e é preenchido na hora de usar.
      </p>
      {templates.isPending ? (
        <Loading />
      ) : templates.isError ? (
        <ErrorState error={templates.error} onRetry={() => templates.refetch()} />
      ) : templates.data.length === 0 ? (
        <EmptyState
          title="Nenhuma mensagem padrão ainda."
          action={
            <Button variant="ghost" onPress={() => setEditing({ ...EMPTY_DRAFT, ...MESSAGE_TEMPLATE_EXAMPLE, defaults: { ...MESSAGE_TEMPLATE_EXAMPLE.defaults } })}>
              Começar pelo exemplo do aulão de graduação
            </Button>
          }
        >
          Crie uma mensagem do zero ou comece pelo exemplo e ajuste o texto.
        </EmptyState>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {templates.data.map((t) => {
            const fields = templateFields(t.body)
            return (
              <li key={t.id} className="flex flex-col rounded-lg border border-line bg-surface p-4">
                <p className="font-semibold text-text">{t.title}</p>
                <p className="mt-2 line-clamp-4 text-sm whitespace-pre-line text-soft">{fillTemplate(t.body, templateDefaults(t.defaults))}</p>
                {fields.length > 0 ? (
                  <p className="mt-2 text-xs text-dim">Campos: {fields.join(', ')}</p>
                ) : null}
                <div className="mt-auto flex flex-wrap gap-2 pt-4">
                  <Button size="sm" onPress={() => setUsing(t)}>
                    <MessageCircle className="size-4" /> Usar
                  </Button>
                  <Button size="sm" variant="ghost" onPress={() => setEditing(fromTemplate(t))}>
                    <Pencil className="size-4" /> Editar
                  </Button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
      {editing ? <EditorDialog draft={editing} onClose={() => setEditing(null)} /> : null}
      {using ? <UseDialog template={using} onClose={() => setUsing(null)} /> : null}
    </>
  )
}

// ── editar ───────────────────────────────────────────────────────────────────

const EMOJIS = [
  '🥊', '🥋', '👊', '💪', '🔥', '🏆', '🥇', '🏅', '⚡', '💥', '🎯', '🤝',
  '📅', '🗓️', '⏰', '🕐', '📍', '💰', '💵', '📢', '📣', '📌', '👉', '➡️',
  '⚠️', '🚨', '❗', '✅', '❌', '⭐', '✨', '🎉', '👏', '🙏', '😄', '😉',
  '😎', '❤️', '💛', '🖤', '👦', '👧', '🧒', '👨‍👩‍👧', '🏃', '🎟️', '📲', '☎️',
]

function EditorDialog({ draft, onClose }: { draft: Draft; onClose: () => void }) {
  const { academy } = useAcademy()
  const queryClient = useQueryClient()
  const [title, setTitle] = useState(draft.title)
  const [body, setBody] = useState(draft.body)
  const [defaults, setDefaults] = useState(draft.defaults)
  const [emojiOpen, setEmojiOpen] = useState(false)
  const [newField, setNewField] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const area = useRef<HTMLTextAreaElement>(null)
  const fields = useMemo(() => templateFields(body), [body])

  const invalidate = () => queryClient.invalidateQueries({ queryKey: keys.messages(academy.gym_id) })
  const save = useMutation({
    mutationFn: () =>
      saveMessageTemplate(db(), academy.gym_id, draft.id, {
        title: title.trim(),
        body: body.trim(),
        // Só os padrões dos campos que continuam no texto.
        defaults: Object.fromEntries(fields.flatMap((f) => (defaults[f]?.trim() ? [[f, defaults[f].trim()]] : []))),
      }),
    onSuccess: async () => {
      await invalidate()
      toast('Mensagem salva.')
      onClose()
    },
    onError: (e: unknown) => {
      if ((e as { code?: string }).code === '23505') setError('Já existe uma mensagem com esse título.')
      else toastError(e)
    },
  })
  const remove = useMutation({
    mutationFn: () => deleteMessageTemplate(db(), draft.id!),
    onSuccess: async () => {
      await invalidate()
      toast('Mensagem apagada.')
      onClose()
    },
    onError: toastError,
  })

  /** Troca a seleção do texto (ou insere no cursor) e devolve o foco com o cursor depois do que entrou. */
  function edit(make: (selected: string) => string) {
    const el = area.current
    const start = el?.selectionStart ?? body.length
    const end = el?.selectionEnd ?? body.length
    const inserted = make(body.slice(start, end))
    setBody(body.slice(0, start) + inserted + body.slice(end))
    requestAnimationFrame(() => {
      if (!el) return
      el.focus()
      el.setSelectionRange(start + inserted.length, start + inserted.length)
    })
  }
  const wrap = (mark: string) => edit((s) => `${mark}${s.trim() || 'texto'}${mark}`)

  function addField() {
    const name = (newField ?? '').replace(/[{}\n]/g, '').trim().slice(0, 40)
    if (!name) return
    edit(() => `{${name}}`)
    setNewField(null)
  }

  function submit() {
    const issue = !title.trim() ? 'Informe o título da mensagem.' : !body.trim() ? 'Escreva o texto da mensagem.' : null
    setError(issue)
    if (!issue) save.mutate()
  }

  return (
    <Dialog
      open
      wide
      onClose={onClose}
      title={draft.id ? 'Editar mensagem' : 'Nova mensagem'}
      footer={
        <>
          {draft.id ? (
            <Button
              variant="danger"
              className="mr-auto"
              loading={remove.isPending}
              onPress={() => window.confirm(`Apagar a mensagem "${draft.title}"?`) && remove.mutate()}
            >
              Apagar
            </Button>
          ) : null}
          <Button variant="plain" onPress={onClose}>Cancelar</Button>
          <Button loading={save.isPending} onPress={submit}>Salvar</Button>
        </>
      }
    >
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3">
          <Field label="Título (só para achar na lista)">
            <Input placeholder="Ex.: Aulão de graduação" maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <div>
            <p className="mb-1.5 text-xs font-bold uppercase tracking-[0.12em] text-dim">Texto</p>
            <div className="mb-2 flex flex-wrap gap-1">
              <ToolButton label="Emojis" active={emojiOpen} onPress={() => setEmojiOpen(!emojiOpen)}>
                <Smile className="size-4" />
              </ToolButton>
              <ToolButton label="Negrito (*texto*)" onPress={() => wrap('*')}>
                <Bold className="size-4" />
              </ToolButton>
              <ToolButton label="Itálico (_texto_)" onPress={() => wrap('_')}>
                <Italic className="size-4" />
              </ToolButton>
              <ToolButton label="Riscado (~texto~)" onPress={() => wrap('~')}>
                <Strikethrough className="size-4" />
              </ToolButton>
              <ToolButton label="Inserir campo que muda a cada envio" active={newField != null} onPress={() => setNewField(newField == null ? '' : null)}>
                <Braces className="size-4" /> <span className="text-xs font-bold">Campo</span>
              </ToolButton>
            </div>
            {emojiOpen ? (
              <div className="mb-2 grid grid-cols-8 gap-1 rounded border border-line bg-surface p-2 sm:grid-cols-12">
                {EMOJIS.map((e) => (
                  <button key={e} type="button" onClick={() => edit(() => e)} className="rounded py-1 text-xl hover:bg-tint" aria-label={`Inserir ${e}`}>
                    {e}
                  </button>
                ))}
              </div>
            ) : null}
            {newField != null ? (
              <div className="mb-2 flex gap-2">
                <Input
                  autoFocus
                  placeholder="Nome do campo. Ex.: Valor por aluno"
                  maxLength={40}
                  value={newField}
                  onChange={(e) => setNewField(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      addField()
                    }
                  }}
                />
                <Button variant="ghost" onPress={addField}>Inserir</Button>
              </div>
            ) : null}
            <Textarea
              ref={area}
              rows={16}
              maxLength={8000}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={'🥊 *AULÃO* 🥊\n\n📅 {Data}\n⏰ {Horário}\n💰 Valor: {Valor por aluno} por aluno'}
              className="text-sm leading-relaxed"
            />
            <p className="mt-1 text-xs text-dim">
              O que vai entre chaves vira um campo para preencher na hora de usar. Também dá para colar emojis do celular ou do teclado
              (Windows: tecla Windows + ponto).
            </p>
          </div>
          {fields.length > 0 ? (
            <div className="space-y-2 rounded-lg border border-line p-3">
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-dim">Valores padrão dos campos</p>
              <p className="text-xs text-dim">Já vêm preenchidos ao usar a mensagem (e são atualizados com o último envio).</p>
              {fields.map((f) => (
                <FieldInput key={f} name={f} value={defaults[f] ?? ''} onChange={(v) => setDefaults({ ...defaults, [f]: v })} />
              ))}
            </div>
          ) : null}
          {error ? <FormMessage message={{ text: error, error: true }} /> : null}
        </div>
        <div>
          <p className="mb-1.5 text-xs font-bold uppercase tracking-[0.12em] text-dim">Como fica no WhatsApp</p>
          <Preview text={fillTemplate(body, defaults)} />
        </div>
      </div>
    </Dialog>
  )
}

function ToolButton({ label, active, onPress, children }: { label: string; active?: boolean; onPress: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      onClick={onPress}
      className={cn('flex h-9 items-center gap-1 rounded border border-line px-2.5 text-soft hover:bg-tint', active && 'border-gold bg-tint text-accent')}
    >
      {children}
    </button>
  )
}

/** Campo da mensagem: em reais quando é valor/preço; texto livre nos demais. */
function FieldInput({ name, value, onChange }: { name: string; value: string; onChange: (v: string) => void }) {
  return (
    <Field label={name}>
      {isMoneyField(name) ? (
        <MoneyInput value={parseBRL(value)} onChange={(cents) => onChange(cents == null ? '' : formatBRL(cents))} />
      ) : (
        <Input value={value} onChange={(e) => onChange(e.target.value)} />
      )}
    </Field>
  )
}

// ── usar ─────────────────────────────────────────────────────────────────────

function UseDialog({ template, onClose }: { template: MessageTemplate; onClose: () => void }) {
  const { academy } = useAcademy()
  const queryClient = useQueryClient()
  const fields = useMemo(() => templateFields(template.body), [template.body])
  const initial = useMemo(() => templateDefaults(template.defaults), [template.defaults])
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(fields.map((f) => [f, initial[f] ?? ''])))
  const text = fillTemplate(template.body, values)
  const missing = missingFields(template.body, values)

  // Os valores usados viram o padrão do próximo envio (ex.: o valor por aluno não precisa ser digitado de novo).
  const remember = useMutation({
    mutationFn: (next: Record<string, string>) => saveMessageDefaults(db(), template.id, next),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.messages(academy.gym_id) }),
  })
  function rememberValues() {
    const next = Object.fromEntries(fields.flatMap((f) => (values[f]?.trim() ? [[f, values[f].trim()]] : [])))
    const same = fields.every((f) => (next[f] ?? '') === (initial[f] ?? ''))
    if (!same) remember.mutate(next)
  }

  function copy() {
    navigator.clipboard.writeText(text).then(
      () => {
        toast('Mensagem copiada. É só colar no grupo do WhatsApp.')
        rememberValues()
      },
      () => toast('Não foi possível copiar. Selecione o texto da prévia e copie.'),
    )
  }

  return (
    <Dialog
      open
      wide
      onClose={onClose}
      title={template.title}
      footer={
        <>
          <Button variant="plain" onPress={onClose}>Fechar</Button>
          <Button variant="ghost" onPress={copy}>
            <Copy className="size-4" /> Copiar
          </Button>
          <a
            href={whatsappShareLink(text)}
            target="_blank"
            rel="noreferrer"
            onClick={rememberValues}
            className="inline-flex h-12 items-center justify-center gap-2 rounded bg-gold-gradient px-5 text-sm font-bold uppercase tracking-[0.08em] text-ink shadow-gold"
          >
            <MessageCircle className="size-4" /> Abrir no WhatsApp
          </a>
        </>
      }
    >
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3">
          {fields.length === 0 ? (
            <p className="text-sm text-dim">Esta mensagem não tem campos: é só copiar ou abrir no WhatsApp.</p>
          ) : (
            fields.map((f) => <FieldInput key={f} name={f} value={values[f] ?? ''} onChange={(v) => setValues({ ...values, [f]: v })} />)
          )}
          {missing.length > 0 ? (
            <p className="rounded border border-warning/40 px-3 py-2 text-sm text-warning">Falta preencher: {missing.join(', ')}.</p>
          ) : null}
        </div>
        <div>
          <p className="mb-1.5 text-xs font-bold uppercase tracking-[0.12em] text-dim">Prévia</p>
          <Preview text={text} />
        </div>
      </div>
    </Dialog>
  )
}

// ── prévia com a formatação do WhatsApp ──────────────────────────────────────

const TOKEN = /(\*[^*\n]+\*|_[^_\n]+_|~[^~\n]+~|\{[^{}\n]{1,40}\})/g

function formatLine(line: string): ReactNode[] {
  return line.split(TOKEN).map((part, i) => {
    if (i % 2 === 0) return part
    const inner = part.slice(1, -1)
    if (part.startsWith('*')) return <strong key={i}>{inner}</strong>
    if (part.startsWith('_')) return <em key={i}>{inner}</em>
    if (part.startsWith('~')) return <s key={i}>{inner}</s>
    return (
      <mark key={i} className="rounded bg-warning/20 px-0.5 text-warning">
        {part}
      </mark>
    )
  })
}

function Preview({ text }: { text: string }) {
  const lines = text.split('\n')
  return (
    <div className="rounded-lg border border-line bg-surface p-3">
      <div className="rounded-lg rounded-tr-none bg-tint px-3 py-2 text-sm leading-relaxed break-words text-text">
        {text.trim() ? (
          lines.map((line, i) => (
            <Fragment key={i}>
              {formatLine(line)}
              {i < lines.length - 1 ? <br /> : null}
            </Fragment>
          ))
        ) : (
          <span className="text-faint">A mensagem aparece aqui.</span>
        )}
      </div>
    </div>
  )
}
