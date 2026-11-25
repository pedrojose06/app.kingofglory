import type { NextConfig } from 'next'

// Sistema de gestão da academia (academia.kingofglory.com.br). Web responsivo, sem PWA/offline:
// muda com frequência e não depende do ciclo de versão do app do professor.
const nextConfig: NextConfig = {
  transpilePackages: ['@kog/core', '@kog/ui', '@kog/web-kit'],
}

export default nextConfig
