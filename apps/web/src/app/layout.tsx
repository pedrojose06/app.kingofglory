import '@fontsource/anton/400.css'
import '@fontsource-variable/archivo'
import './globals.css'
import type { Metadata, Viewport } from 'next'
import type { ReactNode } from 'react'
import { Analytics } from '@vercel/analytics/next'
import { Providers } from '@/lib/providers'
import { Toaster } from '@/components/toaster'

// [largura CSS, altura CSS, pixel ratio] dos iPhones/iPads suportados. Imagens geradas em public/splash/.
const SPLASH_SCREENS: [number, number, number][] = [
  [320, 568, 2], [375, 667, 2], [414, 736, 3], [375, 812, 3], [414, 896, 2], [414, 896, 3], [360, 780, 3],
  [390, 844, 3], [428, 926, 3], [393, 852, 3], [430, 932, 3], [402, 874, 3], [440, 956, 3],
  [768, 1024, 2], [810, 1080, 2], [834, 1112, 2], [820, 1180, 2], [834, 1194, 2], [744, 1133, 2], [1024, 1366, 2],
]

export const metadata: Metadata = {
  title: 'King of Glory — Presença',
  description: 'Chamada, plano de aula e fotos do treino da equipe King of Glory.',
  applicationName: 'KOG Presença',
  appleWebApp: {
    capable: true,
    title: 'KOG Presença',
    statusBarStyle: 'black-translucent',
    // iOS não gera splash a partir do manifest: precisa de uma imagem por tamanho de tela.
    startupImage: SPLASH_SCREENS.map(([w, h, dpr]) => ({
      url: `/splash/splash-${w * dpr}x${h * dpr}.png`,
      media: `(device-width: ${w}px) and (device-height: ${h}px) and (-webkit-device-pixel-ratio: ${dpr}) and (orientation: portrait)`,
    })),
  },
  icons: { icon: '/icons/icon-192.png', apple: '/icons/apple-touch-icon.png' },
  robots: { index: false, follow: false },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#0b0a07' },
    { media: '(prefers-color-scheme: light)', color: '#f7f2e6' },
  ],
}

// Aplica o tema escolhido antes da primeira pintura (evita piscar claro/escuro).
const themeScript = `try{var t=localStorage.getItem('kog-theme');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}`

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <Providers>{children}</Providers>
        <Toaster />
        <Analytics />
      </body>
    </html>
  )
}
