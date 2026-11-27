'use client'

// Peças de interface do sistema da academia (desktop primeiro, utilizável no celular).

import { formatBRL, parseBRL } from '@kog/core'
import { cn, Input } from '@kog/ui'
import { Search, X } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState, type ReactNode } from 'react'
import { useSignupRequests } from '@/lib/queries'

/** Janela: no celular sobe de baixo; no desktop aparece centralizada. Fecha com Esc e clicando fora. */
export function Dialog({ open, onClose, title, children, footer, wide }: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  footer?: ReactNode
  wide?: boolean
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
    }
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" aria-label="Fechar" className="absolute inset-0 bg-black/55" onClick={onClose} />
      <div
        className={cn(
          'relative flex max-h-[92dvh] w-full flex-col rounded-t-xl border border-line-strong bg-bg shadow-2xl sm:rounded-xl',
          wide ? 'sm:max-w-3xl' : 'sm:max-w-lg',
        )}
      >
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
          <h2 className="font-display text-xl uppercase tracking-[0.02em] text-text">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Fechar" className="rounded p-1.5 text-dim hover:bg-tint">
            <X className="size-5" />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer ? <div className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">{footer}</div> : null}
      </div>
    </div>
  )
}

const REGISTRY_TABS = [
  { href: '/alunos', label: 'Alunos', match: ['/alunos', '/aluno'] },
  { href: '/responsaveis', label: 'Responsáveis', match: ['/responsaveis'] },
  { href: '/planos', label: 'Planos', match: ['/planos'] },
  { href: '/turmas', label: 'Turmas', match: ['/turmas'] },
  { href: '/pedidos', label: 'Pedidos de acesso', match: ['/pedidos'] },
] as const

/** Abas dos cadastros. */
export function RegistryTabs() {
  const pathname = usePathname()
  const pending = useSignupRequests().data?.length ?? 0
  return (
    <nav aria-label="Cadastros" className="-mx-1 mb-6 flex gap-1 overflow-x-auto border-b border-line px-1">
      {REGISTRY_TABS.map((t) => {
        const active = (t.match as readonly string[]).includes(pathname)
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              '-mb-px whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-bold',
              active ? 'border-gold text-accent' : 'border-transparent text-dim hover:text-text',
            )}
          >
            {t.label}
            {t.href === '/pedidos' && pending > 0 ? (
              <span className="ml-1.5 inline-flex min-w-5 items-center justify-center rounded-full bg-gold px-1.5 text-[11px] font-bold text-ink">{pending}</span>
            ) : null}
          </Link>
        )
      })}
    </nav>
  )
}

export function SearchInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faint" />
      <Input type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="h-10 pl-9 text-sm" />
    </div>
  )
}

/** Campo de valor em reais. `value` em centavos (null = vazio/ inválido). */
export function MoneyInput({ value, onChange, id, required }: { value: number | null; onChange: (cents: number | null) => void; id?: string; required?: boolean }) {
  const [text, setText] = useState(value == null ? '' : formatBRL(value).replace('R$ ', ''))
  useEffect(() => {
    const parsed = parseBRL(text)
    if (parsed !== value) setText(value == null ? '' : formatBRL(value).replace('R$ ', ''))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])
  return (
    <div className="relative">
      <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-dim">R$</span>
      <Input
        id={id}
        inputMode="decimal"
        required={required}
        value={text}
        onChange={(e) => {
          setText(e.target.value)
          onChange(parseBRL(e.target.value))
        }}
        onBlur={() => value != null && setText(formatBRL(value).replace('R$ ', ''))}
        className="pl-10"
      />
    </div>
  )
}

/** Etiqueta de turma com a cor dela. */
export function GroupTag({ name, color }: { name: string; color: string | null }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded border border-line bg-surface px-1.5 py-0.5 text-[11px] font-semibold whitespace-nowrap text-soft">
      <span className="size-2 rounded-full" style={{ backgroundColor: color ?? 'var(--kog-gold)' }} aria-hidden />
      {name}
    </span>
  )
}

/** Idade completa em anos num dia (ISO). */
export function ageOn(birth: string, today: string): number {
  const [by, bm, bd] = birth.split('-').map(Number) as [number, number, number]
  const [ty, tm, td] = today.split('-').map(Number) as [number, number, number]
  return ty - by - (tm < bm || (tm === bm && td < bd) ? 1 : 0)
}

/** Telefone para o link do WhatsApp (só dígitos, com 55). */
export const whatsappLink = (phone: string) => `https://wa.me/55${phone.replace(/\D/g, '')}`

export function Stat({ label, value, tone }: { label: string; value: ReactNode; tone?: 'danger' | 'success' | 'warning' }) {
  return (
    <div className="rounded-lg border border-line bg-surface px-4 py-3">
      <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-dim">{label}</p>
      <p className={cn('mt-1 text-lg font-bold', tone === 'danger' ? 'text-danger' : tone === 'success' ? 'text-success' : tone === 'warning' ? 'text-warning' : 'text-text')}>
        {value}
      </p>
    </div>
  )
}
