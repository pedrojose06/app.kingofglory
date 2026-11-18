'use client'

import { Button, cn } from '@kog/ui'
import { Copy, Download, MoreVertical, Share, SquarePlus, X } from 'lucide-react'
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

function isIos() {
  const ua = navigator.userAgent
  return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

// Navegador embutido de outro app (Instagram, Facebook, TikTok, WebView do Android...): não instala PWA.
function isInAppBrowser() {
  return /FBAN|FBAV|FB_IAB|Instagram|Line\/|TikTok|musical_ly|Snapchat|; wv\)/i.test(navigator.userAgent)
}

type Mode = 'native' | 'ios' | 'android' | 'inapp'

/**
 * O botão "Instalar" só existe quando o navegador dispara o beforeinstallprompt (Chrome/Edge no Android),
 * e o Chrome só faz isso depois de ~30 s de uso e um toque na tela. Enquanto isso (e nos navegadores que
 * nunca disparam), mostra como instalar pelo menu do navegador.
 */
function detectMode(): Mode | null {
  if (deferred) return 'native'
  if (isInAppBrowser()) return 'inapp'
  if (isIos()) return 'ios'
  if (/Android/i.test(navigator.userAgent)) return 'android'
  return null
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
export function InstallPrompt({ bottomNav = true }: { bottomNav?: boolean } = {}) {
  const [mode, setMode] = useState<Mode | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    const update = () => {
      if (isStandalone() || recentlyDismissed()) return setMode(null)
      setMode(detectMode())
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

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setCopied(true)
    } catch {}
  }

  return (
    <div
      role="dialog"
      aria-label="Instalar o app"
      className={cn(
        'fixed inset-x-0 z-40 px-3 pb-2',
        // Sem a barra de navegação (área do aluno), fica colado ao rodapé.
        bottomNav ? 'bottom-[calc(4rem+env(safe-area-inset-bottom))]' : 'bottom-[env(safe-area-inset-bottom)]',
      )}
    >
      <div className="mx-auto flex max-w-xl items-start gap-3 rounded-lg border border-line-strong bg-bg p-3 shadow-lg">
        <img src="/icons/icon-192.png" alt="" className="size-10 shrink-0 rounded-lg" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-text">Instale o KOG Presença</p>
          {mode === 'native' ? (
            <p className="text-xs text-dim">Abre direto da tela inicial, em tela cheia, e funciona sem internet.</p>
          ) : mode === 'ios' ? (
            <p className="text-xs text-dim">
              Toque em <Share className="inline size-3.5 -translate-y-px text-accent" aria-label="Compartilhar" /> e depois em{' '}
              <strong className="text-soft">Adicionar à Tela de Início</strong>{' '}
              <SquarePlus className="inline size-3.5 -translate-y-px text-accent" aria-hidden />
            </p>
          ) : mode === 'android' ? (
            <p className="text-xs text-dim">
              Toque em <MoreVertical className="inline size-3.5 -translate-y-px text-accent" aria-label="menu do navegador" /> no
              canto da tela e depois em <strong className="text-soft">Instalar app</strong> ou{' '}
              <strong className="text-soft">Adicionar à tela inicial</strong>.
            </p>
          ) : (
            <p className="text-xs text-dim">
              Este navegador (de dentro de outro app) não instala. Toque em <strong className="text-soft">⋯</strong> e em{' '}
              <strong className="text-soft">Abrir no navegador</strong>, ou copie o link e cole no Chrome ou no Safari.
            </p>
          )}
          {mode === 'native' ? (
            <Button size="sm" className="mt-2" onPress={install}>
              <Download className="size-4" /> Instalar
            </Button>
          ) : mode === 'inapp' ? (
            <Button size="sm" variant="ghost" className="mt-2" onPress={copyLink}>
              <Copy className="size-4" /> {copied ? 'Link copiado' : 'Copiar link'}
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
