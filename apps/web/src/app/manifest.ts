import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'King of Glory — Presença',
    short_name: 'KOG Presença',
    description: 'Chamada, plano de aula e fotos do treino da equipe King of Glory.',
    lang: 'pt-BR',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#0b0a07',
    theme_color: '#0b0a07',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'Presença avulsa', url: '/avulsa' },
      { name: 'Pendências', url: '/pendencias' },
    ],
  }
}
