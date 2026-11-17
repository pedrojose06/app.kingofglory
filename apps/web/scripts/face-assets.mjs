// Copia o runtime do onnxruntime-web (wasm) para public/ort/<versão>/, servido pelo próprio app.
// Os modelos (public/models) ficam no repositório; o runtime vem do pacote instalado.
import { copyFileSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const pkgPath = join(root, 'node_modules', 'onnxruntime-web', 'package.json')
const { version } = JSON.parse(readFileSync(pkgPath, 'utf8'))
const from = join(dirname(pkgPath), 'dist')
const to = join(root, 'public', 'ort', version)
mkdirSync(to, { recursive: true })
for (const f of ['ort-wasm-simd-threaded.wasm', 'ort-wasm-simd-threaded.mjs']) copyFileSync(join(from, f), join(to, f))
console.log(`onnxruntime-web ${version} → public/ort/${version}`)
