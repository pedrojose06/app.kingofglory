import type { NextConfig } from 'next'

// Sistema de gestão da academia (academia.kingofglory.com.br). Web responsivo, sem PWA/offline:
// muda com frequência e não depende do ciclo de versão do app do professor.
const nextConfig: NextConfig = {
  transpilePackages: ['@kog/core', '@kog/face-kit', '@kog/ui', '@kog/web-kit'],
  // Modelos do reconhecimento facial (~10 MB) e o runtime wasm: o nome tem versão, então o navegador pode guardar
  // para sempre e não baixa de novo a cada chamada (aqui não há service worker para guardar).
  async headers() {
    const immutable = [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }]
    return [
      { source: '/models/:path*', headers: immutable },
      { source: '/ort/:path*', headers: immutable },
    ]
  },
}

export default nextConfig
