'use client'

import { Button, Spinner } from '@kog/ui'
import { errorMessage } from '@kog/web-kit'
import type { ReactNode } from 'react'

export function Loading({ label = 'Carregando…' }: { label?: string }) {
  return (
    <div className="flex min-h-40 items-center justify-center gap-3 text-sm text-dim">
      <Spinner className="size-5 text-accent" />
      {label}
    </div>
  )
}

/** Erro de carregamento com "Tentar de novo". */
export function ErrorState({ error, onRetry, title = 'Não foi possível carregar' }: { error: unknown; onRetry?: () => void; title?: string }) {
  return (
    <div role="alert" className="rounded-lg border border-danger/40 bg-danger-tint px-5 py-6 text-center">
      <p className="font-bold text-danger">{title}</p>
      <p className="mt-1 text-sm text-soft">{errorMessage(error)}</p>
      {onRetry ? (
        <Button variant="ghost" size="sm" className="mt-4" onPress={onRetry}>
          Tentar de novo
        </Button>
      ) : null}
    </div>
  )
}

/** Moldura das telas sem login (entrar, convite): marca no topo e um cartão central. */
export function AuthFrame({ title, children, footer }: { title: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-10">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/icons/icon-192.png" alt="" width={80} height={80} className="mx-auto rounded-full ring-1 ring-line-strong" />
      <p className="kicker mt-5 text-center">King of Glory Academy</p>
      <h1 className="mt-2 text-center font-display text-4xl uppercase tracking-[0.02em] text-accent">{title}</h1>
      <div className="mt-8 rounded-lg border border-line bg-surface p-5 sm:p-6">{children}</div>
      {footer ? <div className="mt-5 text-center text-sm text-dim">{footer}</div> : null}
    </main>
  )
}

export function FormMessage({ message }: { message: { text: string; error: boolean } | null }) {
  if (!message) return null
  return (
    <p role={message.error ? 'alert' : 'status'} className={`rounded border px-3 py-2.5 text-sm ${message.error ? 'border-danger/40 bg-danger-tint text-danger' : 'border-success/40 bg-success-tint text-success'}`}>
      {message.text}
    </p>
  )
}
