import '@fontsource/anton/400.css'
import '@fontsource-variable/archivo'
import './globals.css'
import { Toaster } from '@kog/web-kit'
import type { Metadata, Viewport } from 'next'
import type { ReactNode } from 'react'
import { Providers } from '@/lib/providers'

export const metadata: Metadata = {
  title: 'King of Glory — Academia',
  description: 'Gestão da academia: alunos, mensalidades, aulas e contratos.',
  icons: { icon: '/icons/icon-192.png', apple: '/icons/apple-touch-icon.png' },
  robots: { index: false, follow: false },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#0b0a07' },
    { media: '(prefers-color-scheme: light)', color: '#f7f2e6' },
  ],
}

// Aplica o tema escolhido antes da primeira pintura (evita piscar claro/escuro). Mesma chave do app do professor.
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
