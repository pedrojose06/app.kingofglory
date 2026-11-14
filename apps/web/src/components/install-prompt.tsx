'use client'

import { Button } from '@kog/ui'
import { Download, Share, SquarePlus, X } from 'lucide-react'
import { useEffect, useState } from 'react'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const DISMISS_KEY = 'kog:install-dismissed-at'
const DISMISS_DAYS = 14

// O Chrome dispara o evento uma vez, às vezes antes de a tela montar: guarda no carregamento do módulo.
let deferred: BeforeInstallPromptEvent | null = null
const listeners = new Set<() => void>()
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferred = e as BeforeInstallPromptEvent
    listeners.forEach((l) => l())
  })
  window.addEventListener('appinstalled', () => {
    deferred = null
    listeners.forEach((l) => l())
  })
}

function isStandalone() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

function isIosSafari() {
  const ua = navigator.userAgent
  const ios = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  return ios && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua)
}

function recentlyDismissed() {
  try {
    const at = Number(localStorage.getItem(DISMISS_KEY))
    return at > 0 && Date.now() - at < DISMISS_DAYS * 86_400_000
  } catch {
    return false
  }
}

/** Convite para instalar o app na tela inicial. Some se já estiver instalado ou se foi fechado há pouco. */
export function InstallPrompt() {
  const [mode, setMode] = useState<'native' | 'ios' | null>(null)

  useEffect(() => {
    const update = () => {
      if (isStandalone() || recentlyDismissed()) return setMode(null)
      setMode(deferred ? 'native' : isIosSafari() ? 'ios' : null)
    }
    update()
    listeners.add(update)
    return () => {
      listeners.delete(update)
    }
  }, [])

  if (!mode) return null

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()))
    } catch {}
    setMode(null)
  }

  const install = async () => {
    if (!deferred) return
    await deferred.prompt()
    const { outcome } = await deferred.userChoice
    deferred = null
    if (outcome === 'dismissed') dismiss()
    else setMode(null)
  }

  return (
    <div
      role="dialog"
      aria-label="Instalar o app"
      className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-40 px-3 pb-2"
    >
      <div className="mx-auto flex max-w-xl items-start gap-3 rounded-lg border border-line-strong bg-bg p-3 shadow-lg">
        <img src="/icons/icon-192.png" alt="" className="size-10 shrink-0 rounded-lg" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-text">Instale o KOG Presença</p>
          {mode === 'native' ? (
            <p className="text-xs text-dim">Abre direto da tela inicial, em tela cheia, e funciona sem internet.</p>
          ) : (
            <p className="text-xs text-dim">
              Toque em <Share className="inline size-3.5 -translate-y-px text-accent" aria-label="Compartilhar" /> e depois em{' '}
              <strong className="text-soft">Adicionar à Tela de Início</strong>{' '}
              <SquarePlus className="inline size-3.5 -translate-y-px text-accent" aria-hidden />
            </p>
          )}
          {mode === 'native' ? (
            <Button size="sm" className="mt-2" onPress={install}>
              <Download className="size-4" /> Instalar
            </Button>
          ) : null}
        </div>
        <button type="button" onClick={dismiss} aria-label="Agora não" className="-m-1 p-1 text-dim">
          <X className="size-5" />
        </button>
      </div>
    </div>
  )
}
