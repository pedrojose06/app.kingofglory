'use client'

import { cn, Kicker, Spinner, Title } from '@kog/ui'
import { CalendarCheck, ChevronLeft, CloudOff, ListTodo, Menu, RefreshCw, Users } from 'lucide-react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import type { ReactNode } from 'react'
import { useOnline, useOutbox, useOutboxSyncing } from '@/lib/outbox'
import { usePendingClasses } from '@/lib/queries'

const TABS = [
  { href: '/', label: 'Hoje', icon: CalendarCheck, match: ['/', '/aula', '/avulsa'] },
  { href: '/pendencias', label: 'Pendências', icon: ListTodo, match: ['/pendencias'] },
  { href: '/alunos', label: 'Alunos', icon: Users, match: ['/alunos', '/aluno', '/graduacao'] },
  { href: '/mais', label: 'Mais', icon: Menu, match: ['/mais', '/academias', '/academia', '/graus', '/importar', '/sync', '/historico', '/lembretes', '/modelo-plano'] },
] as const

export function BottomNav() {
  const pathname = usePathname()
  const pending = usePendingClasses().data?.length ?? 0
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-bg/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
      <ul className="mx-auto flex max-w-xl">
        {TABS.map(({ href, label, icon: Icon, match }) => {
          const active = (match as readonly string[]).includes(pathname)
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                className={cn('relative flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-bold uppercase tracking-[0.08em]', active ? 'text-accent' : 'text-dim')}
              >
                <Icon className="size-5" strokeWidth={active ? 2.4 : 1.8} />
                {label}
                {href === '/pendencias' && pending > 0 ? (
                  <span className="bg-gold-gradient absolute top-2 left-1/2 ml-2 min-w-5 rounded-full px-1 text-center text-[11px] leading-5 text-ink">
                    {pending}
                  </span>
                ) : null}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

/** Indicador de sincronização: offline, enviando ou N alterações pendentes. Leva à tela de detalhes. */
export function SyncBadge() {
  const items = useOutbox()
  const syncing = useOutboxSyncing()
  const online = useOnline()
  const failed = items.filter((i) => i.error).length
  if (online && items.length === 0) return null
  return (
    <Link
      href="/sync"
      className={cn(
        'flex h-9 items-center gap-1.5 rounded border px-2.5 text-xs font-bold',
        failed > 0 ? 'border-danger/50 text-danger' : 'border-line-strong text-accent',
      )}
      aria-label={`${items.length} alterações pendentes de sincronização${online ? '' : ', sem conexão'}`}
    >
      {!online ? <CloudOff className="size-4" /> : syncing ? <Spinner className="size-3.5" /> : <RefreshCw className="size-4" />}
      {items.length > 0 ? items.length : 'Offline'}
    </Link>
  )
}

export interface PageProps {
  title: string
  kicker?: string
  /** true = mostra "voltar" (history.back) ; string = link fixo. */
  back?: boolean | string
  actions?: ReactNode
  children: ReactNode
}

export function Page({ title, kicker, back, actions, children }: PageProps) {
  const router = useRouter()
  return (
    <div className="mx-auto max-w-xl px-4 pt-[calc(env(safe-area-inset-top)+1rem)] pb-28">
      <header className="mb-5 flex items-end justify-between gap-3">
        <div className="min-w-0">
          {back ? (
            <button
              type="button"
              onClick={() => (typeof back === 'string' ? router.push(back) : router.back())}
              className="-ml-1.5 mb-1 flex h-8 items-center gap-0.5 pr-2 text-xs font-bold uppercase tracking-[0.1em] text-dim"
            >
              <ChevronLeft className="size-4" /> Voltar
            </button>
          ) : null}
          {kicker ? <Kicker className="mb-1.5">{kicker}</Kicker> : null}
          <Title className="truncate">{title}</Title>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {actions}
          <SyncBadge />
        </div>
      </header>
      {children}
    </div>
  )
}

export function Loading() {
  return (
    <div className="flex justify-center py-16 text-accent">
      <Spinner />
    </div>
  )
}
