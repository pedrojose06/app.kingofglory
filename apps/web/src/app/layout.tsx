import '@fontsource/anton/400.css'
import '@fontsource-variable/archivo'
import './globals.css'
import type { Metadata, Viewport } from 'next'
import type { ReactNode } from 'react'
import { Providers } from '@/lib/providers'
import { Toaster } from '@/components/toaster'

export const metadata: Metadata = {
  title: 'King of Glory — Presença',
  description: 'Chamada, plano de aula e fotos do treino da equipe King of Glory.',
  applicationName: 'KOG Presença',
  appleWebApp: { capable: true, title: 'KOG Presença', statusBarStyle: 'black-translucent' },
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
      </body>
    </html>
  )
}
