// Componentes de UI compartilháveis. Regras para facilitar o port para NativeWind:
// só classes utilitárias com tokens semânticos, nada de CSS solto, e props neutras
// (onPress em vez de onClick) nos componentes interativos.

import type { ComponentProps, ReactNode } from 'react'
import { cn } from './cn'

type ButtonVariant = 'gold' | 'ghost' | 'plain' | 'danger'
type ButtonSize = 'md' | 'lg' | 'sm'

export interface ButtonProps extends Omit<ComponentProps<'button'>, 'onClick'> {
  variant?: ButtonVariant
  size?: ButtonSize
  onPress?: () => void
  loading?: boolean
  block?: boolean
}

const buttonVariants: Record<ButtonVariant, string> = {
  gold: 'bg-gold-gradient text-ink shadow-gold active:brightness-95',
  ghost: 'border border-line-strong text-accent active:bg-tint',
  plain: 'text-soft active:bg-tint',
  danger: 'border border-danger/50 text-danger active:bg-danger-tint',
}
const buttonSizes: Record<ButtonSize, string> = {
  sm: 'h-9 px-3 text-xs',
  md: 'h-12 px-5 text-sm',
  lg: 'h-14 px-6 text-[15px]',
}

export function Button({ variant = 'gold', size = 'md', onPress, loading, block, className, children, disabled, type = 'button', ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      onClick={onPress}
      disabled={disabled || loading}
      className={cn(
        'inline-flex select-none items-center justify-center gap-2 rounded font-bold uppercase tracking-[0.08em] transition disabled:opacity-50',
        buttonVariants[variant],
        buttonSizes[size],
        block && 'w-full',
        className,
      )}
      {...rest}
    >
      {loading ? <Spinner className="size-4" /> : children}
    </button>
  )
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="Carregando"
      className={cn('inline-block size-5 animate-spin rounded-full border-2 border-current border-t-transparent', className)}
    />
  )
}

export function Card({ className, ...rest }: ComponentProps<'div'>) {
  return <div className={cn('rounded-lg border border-line bg-surface', className)} {...rest} />
}

export function Kicker({ className, ...rest }: ComponentProps<'p'>) {
  return <p className={cn('kicker', className)} {...rest} />
}

export function Title({ className, ...rest }: ComponentProps<'h1'>) {
  return <h1 className={cn('font-display text-[28px] uppercase leading-none tracking-[0.02em] text-text', className)} {...rest} />
}

export interface FieldProps {
  label: string
  hint?: string
  children: ReactNode
  className?: string
}

export function Field({ label, hint, children, className }: FieldProps) {
  return (
    <label className={cn('block', className)}>
      <span className="mb-1.5 block text-xs font-bold uppercase tracking-[0.12em] text-dim">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-dim">{hint}</span> : null}
    </label>
  )
}

const inputBase =
  'h-12 w-full rounded border border-line bg-surface px-3 text-base text-text placeholder:text-faint outline-none focus:border-gold'

export function Input({ className, ...rest }: ComponentProps<'input'>) {
  return <input className={cn(inputBase, className)} {...rest} />
}

export function Select({ className, ...rest }: ComponentProps<'select'>) {
  return <select className={cn(inputBase, 'appearance-none', className)} {...rest} />
}

export function Textarea({ className, ...rest }: ComponentProps<'textarea'>) {
  return <textarea className={cn(inputBase, 'h-auto min-h-24 py-2.5', className)} {...rest} />
}

export interface ChipProps {
  active?: boolean
  onPress?: () => void
  children: ReactNode
  className?: string
}

/** Chip de filtro, no estilo dos filtros de horário da landing. */
export function Chip({ active, onPress, children, className }: ChipProps) {
  return (
    <button
      type="button"
      onClick={onPress}
      aria-pressed={active}
      className={cn(
        'h-9 shrink-0 rounded border px-3 text-xs font-bold uppercase tracking-[0.1em] transition',
        active ? 'border-gold bg-gold-gradient text-ink' : 'border-line text-soft active:bg-tint',
        className,
      )}
    >
      {children}
    </button>
  )
}

type BadgeTone = 'neutral' | 'success' | 'danger' | 'warning' | 'gold'
const badgeTones: Record<BadgeTone, string> = {
  neutral: 'bg-surface-2 text-soft',
  success: 'bg-success-tint text-success',
  danger: 'bg-danger-tint text-danger',
  warning: 'bg-warning-tint text-warning',
  gold: 'bg-tint text-accent',
}

export function Badge({ tone = 'neutral', className, ...rest }: ComponentProps<'span'> & { tone?: BadgeTone }) {
  return (
    <span
      className={cn('inline-flex items-center rounded px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.08em]', badgeTones[tone], className)}
      {...rest}
    />
  )
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-line px-5 py-8 text-center">
      <p className="font-bold text-text">{title}</p>
      {children ? <p className="mt-1 text-sm text-dim">{children}</p> : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  )
}

/** Faixa do kruang/prajied: listras com as cores do grau. */
export function RankBand({ colors, className }: { colors: readonly string[]; className?: string }) {
  const list = colors.length > 0 ? colors : ['transparent']
  return (
    <span
      aria-hidden
      className={cn('flex h-2.5 w-14 shrink-0 overflow-hidden rounded-sm border border-line-strong', className)}
    >
      {list.map((color, i) => (
        <span key={i} className="h-full flex-1" style={{ backgroundColor: color }} />
      ))}
    </span>
  )
}

export function ProgressBar({ value, max, className }: { value: number; max: number; className?: string }) {
  const pct = max <= 0 ? 0 : Math.min(100, Math.round((value / max) * 100))
  return (
    <div
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
      className={cn('h-2 overflow-hidden rounded-sm bg-surface-2', className)}
    >
      <div className="bg-gold-gradient h-full" style={{ width: `${pct}%` }} />
    </div>
  )
}

export interface SheetProps {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
}

/** Folha inferior (modal) — alcance fácil com uma mão. */
export function Sheet({ open, onClose, title, children }: SheetProps) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" aria-label="Fechar" className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative max-h-[88dvh] w-full max-w-xl overflow-y-auto rounded-t-xl border-t border-line-strong bg-bg px-4 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="font-display text-xl uppercase tracking-[0.02em] text-text">{title}</h2>
          <button type="button" onClick={onClose} className="h-9 rounded px-3 text-xs font-bold uppercase tracking-[0.1em] text-dim active:bg-tint">
            Fechar
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
