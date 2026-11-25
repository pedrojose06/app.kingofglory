'use client'

import { ACADEMY_ROLE_LABEL, type AcademyRole } from '@kog/core'
import { Badge, cn } from '@kog/ui'
import { useAuth } from '@kog/web-kit'
import { CalendarDays, ClipboardList, FileSignature, LayoutDashboard, LogOut, Settings, Users, Wallet, type LucideIcon } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'
import { useAcademy } from '@/lib/academy'
import { db } from '@/lib/supabase'

interface NavItem {
  href: string
  label: string
  icon: LucideIcon
  roles: readonly AcademyRole[]
  /** Etapa em que o módulo chega (aparece como "Em breve"). */
  soon?: boolean
  /** Rotas que deixam o item ativo (padrão: o próprio href). */
  match?: readonly string[]
}

const STAFF: readonly AcademyRole[] = ['admin', 'professor']
const NAV: readonly NavItem[] = [
  { href: '/', label: 'Painel', icon: LayoutDashboard, roles: ['admin', 'professor', 'membro'] },
  { href: '/alunos', label: 'Cadastros', icon: Users, roles: ['admin'], match: ['/alunos', '/aluno', '/responsaveis', '/planos', '/turmas'] },
  { href: '/financeiro', label: 'Mensalidades', icon: Wallet, roles: ['admin'], soon: true },
  { href: '/diarios', label: 'Diários de aula', icon: CalendarDays, roles: STAFF, match: ['/diarios', '/diario'] },
  { href: '/contratos', label: 'Contratos', icon: FileSignature, roles: ['admin'], soon: true },
  { href: '/meu-contrato', label: 'Meu contrato', icon: ClipboardList, roles: ['membro'], soon: true },
  { href: '/configuracoes', label: 'Configurações', icon: Settings, roles: ['admin'] },
]

function NavLinks({ orientation }: { orientation: 'vertical' | 'horizontal' }) {
  const pathname = usePathname()
  const { role } = useAcademy()
  const items = NAV.filter((i) => i.roles.includes(role))
  return (
    <ul className={cn(orientation === 'vertical' ? 'space-y-1' : 'flex gap-1 overflow-x-auto px-4 pb-2')}>
      {items.map(({ href, label, icon: Icon, soon, match }) => {
        const active = !soon && (href === '/' ? pathname === '/' : (match ?? [href]).some((m) => pathname === m || pathname.startsWith(`${m}/`)))
        const body = (
          <>
            <Icon className="size-[18px] shrink-0" strokeWidth={active ? 2.4 : 1.8} />
            <span className="truncate">{label}</span>
            {soon ? <Badge className="ml-auto hidden lg:inline-flex">Em breve</Badge> : null}
          </>
        )
        const cls = cn(
          'flex items-center gap-3 whitespace-nowrap rounded px-3 text-sm font-semibold transition',
          orientation === 'vertical' ? 'h-10' : 'h-9 border border-line',
          active ? 'bg-tint text-accent' : soon ? 'cursor-not-allowed text-faint' : 'text-soft hover:bg-tint hover:text-text',
        )
        return (
          <li key={href} className="shrink-0">
            {soon ? (
              <span className={cls} aria-disabled title="Em breve">
                {body}
              </span>
            ) : (
              <Link href={href} aria-current={active ? 'page' : undefined} className={cls}>
                {body}
              </Link>
            )}
          </li>
        )
      })}
    </ul>
  )
}

function AcademySwitcher() {
  const { academy, all, select, role } = useAcademy()
  return (
    <div>
      {all.length > 1 ? (
        <select
          aria-label="Academia"
          value={academy.gym_id}
          onChange={(e) => select(e.target.value)}
          className="w-full truncate rounded border border-line bg-surface px-2 py-1.5 text-sm font-bold text-text"
        >
          {all.map((a) => (
            <option key={a.gym_id} value={a.gym_id}>
              {a.name}
            </option>
          ))}
        </select>
      ) : (
        <p className="truncate text-sm font-bold text-text">{academy.name}</p>
      )}
      <p className="mt-0.5 text-xs text-dim">{ACADEMY_ROLE_LABEL[role]}</p>
    </div>
  )
}

function UserBox() {
  const { session } = useAuth()
  return (
    <div className="flex items-center gap-2">
      <p className="min-w-0 flex-1 truncate text-xs text-dim" title={session?.user.email}>
        {session?.user.email}
      </p>
      <button
        type="button"
        onClick={() => void db().auth.signOut()}
        className="flex h-9 items-center gap-1.5 rounded px-2 text-xs font-bold uppercase tracking-[0.08em] text-soft hover:bg-tint"
      >
        <LogOut className="size-4" />
        Sair
      </button>
    </div>
  )
}

function Brand() {
  return (
    <div className="flex items-center gap-2.5">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/icons/icon-192.png" alt="" width={36} height={36} className="rounded-full ring-1 ring-line-strong" />
      <span className="font-display text-lg uppercase leading-none tracking-[0.04em] text-accent">Academia</span>
    </div>
  )
}

/** Desktop: menu lateral fixo. Celular: topo com a academia e o menu rolando na horizontal. */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh lg:pl-72">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-72 flex-col border-r border-line bg-surface lg:flex">
        <div className="border-b border-line px-5 py-4">
          <Brand />
        </div>
        <div className="border-b border-line px-5 py-3">
          <AcademySwitcher />
        </div>
        <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label="Menu">
          <NavLinks orientation="vertical" />
        </nav>
        <div className="border-t border-line px-4 py-3">
          <UserBox />
        </div>
      </aside>

      <header className="sticky top-0 z-30 border-b border-line bg-bg/95 backdrop-blur lg:hidden">
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <Brand />
          <button type="button" onClick={() => void db().auth.signOut()} className="flex h-9 items-center gap-1.5 rounded px-2 text-xs font-bold uppercase text-soft">
            <LogOut className="size-4" />
            Sair
          </button>
        </div>
        <div className="px-4 pb-2">
          <AcademySwitcher />
        </div>
        <nav aria-label="Menu">
          <NavLinks orientation="horizontal" />
        </nav>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
    </div>
  )
}

export function PageHeader({ title, kicker, actions }: { title: string; kicker?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        {kicker ? <p className="kicker">{kicker}</p> : null}
        <h1 className="mt-1 font-display text-3xl uppercase leading-none tracking-[0.02em] text-text">{title}</h1>
      </div>
      {actions ? <div className="flex gap-2">{actions}</div> : null}
    </div>
  )
}
