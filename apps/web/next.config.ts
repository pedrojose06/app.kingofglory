import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import withSerwistInit from '@serwist/next'
import type { NextConfig } from 'next'

// Todas as rotas são estáticas (ids vão em ?id=), então o shell inteiro pode ser pré-cacheado
// e o app abre offline mesmo em telas que nunca foram visitadas.
const ROUTES = [
  '/', '/login-professor', '/aula', '/pendencias', '/avulsa', '/alunos', '/aluno', '/graduacao', '/historico',
  '/mais', '/academias', '/academia', '/graus', '/importar', '/sync', '/lembretes', '/modelo-plano',
  '/minhas-presencas', '/plano', '/relatorios', '/professores', '/convite', '/cadastro-aluno', '/termo',
]
const revision = process.env.VERCEL_GIT_COMMIT_SHA ?? randomUUID()

const withSerwist = withSerwistInit({
  swSrc: 'src/app/sw.ts',
  swDest: 'public/sw.js',
  disable: process.env.NODE_ENV === 'development',
  // Recarregar ao voltar a conexão interromperia a chamada; a fila offline cuida da sincronização.
  reloadOnOnline: false,
  additionalPrecacheEntries: ROUTES.map((url) => ({ url, revision })),
})

// Versão do onnxruntime-web: o runtime (wasm) é servido em /ort/<versão>/ (scripts/face-assets.mjs).
const ortVersion = JSON.parse(readFileSync(new URL('./node_modules/onnxruntime-web/package.json', import.meta.url), 'utf8')).version

const nextConfig: NextConfig = {
  env: { NEXT_PUBLIC_ORT_VERSION: ortVersion },
  transpilePackages: ['@kog/core', '@kog/ui', '@kog/web-kit'],
  // O Serwist injeta config de webpack (usada no build). Em dev o service worker fica desligado,
  // então o Turbopack roda sem configuração extra; sem esta linha o `next dev` aborta.
  turbopack: {},
}

export default withSerwist(nextConfig)
