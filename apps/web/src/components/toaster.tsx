'use client'

import { cn } from '@kog/ui'
import { useToasts } from '@/lib/toast'

export function Toaster() {
  const toasts = useToasts()
  return (
    <div className="pointer-events-none fixed inset-x-0 top-[calc(env(safe-area-inset-top)+0.75rem)] z-[60] flex flex-col items-center gap-2 px-4" aria-live="polite">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={cn(
            'max-w-md rounded border px-4 py-2.5 text-sm font-medium shadow-lg',
            t.tone === 'error' ? 'border-danger/50 bg-surface text-danger' : 'border-line-strong bg-surface text-text',
          )}
        >
          {t.message}
        </div>
      ))}
    </div>
  )
}
