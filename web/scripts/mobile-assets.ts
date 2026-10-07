import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'

for (const file of ['dist/index.html', ...readdirSync('dist/assets').filter((name) => /\.(js|css)$/.test(name)).map((name) => join('dist/assets', name))]) {
  writeFileSync(`${file}.gz`, gzipSync(readFileSync(file), { level: 6 }))
}
console.log('Frontendassets deterministisch voorgecomprimeerd met gzip')
