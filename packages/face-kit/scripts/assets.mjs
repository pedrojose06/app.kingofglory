// Prepara o reconhecimento facial de um app web: copia os modelos (packages/face-kit/models) e o runtime do
// onnxruntime-web (wasm) para o public/ do app que chama (a pasta atual), servidos pelo próprio app.
// Uso (no package.json do app): node ../../packages/face-kit/scripts/assets.mjs
import { copyFileSync, mkdirSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const kit = join(dirname(fileURLToPath(import.meta.url)), '..')
const app = process.cwd()

const ortPkg = join(kit, 'node_modules', 'onnxruntime-web', 'package.json')
const { version } = JSON.parse(readFileSync(ortPkg, 'utf8'))
const pinned = readFileSync(join(kit, 'src', 'assets.ts'), 'utf8').match(/ORT_VERSION = '([^']+)'/)?.[1]
if (pinned !== version) {
  throw new Error(`onnxruntime-web ${version} instalado, mas src/assets.ts espera ${pinned}: atualize ORT_VERSION.`)
}

const ort = join(app, 'public', 'ort', version)
mkdirSync(ort, { recursive: true })
for (const f of ['ort-wasm-simd-threaded.wasm', 'ort-wasm-simd-threaded.mjs']) copyFileSync(join(dirname(ortPkg), 'dist', f), join(ort, f))

const models = join(app, 'public', 'models')
mkdirSync(models, { recursive: true })
for (const f of readdirSync(join(kit, 'models'))) copyFileSync(join(kit, 'models', f), join(models, f))

console.log(`reconhecimento facial: modelos e onnxruntime-web ${version} → ${join('public')}`)
