import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'

const root = process.env.MOTREGEN_RIG_DIST ?? 'dist'
for (const file of [join(root, 'index.html'), ...readdirSync(join(root, 'assets')).filter((name) => /\.(js|css)$/.test(name)).map((name) => join(root, 'assets', name))]) {
  writeFileSync(`${file}.gz`, gzipSync(readFileSync(file), { level: 6 }))
}
console.log('Frontendassets deterministisch voorgecomprimeerd met gzip')
