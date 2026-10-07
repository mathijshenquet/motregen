import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'
import { RIG_DIST } from './rig-host'

for (const file of [join(RIG_DIST, 'index.html'), ...readdirSync(join(RIG_DIST, 'assets')).filter((name) => /\.(js|css)$/.test(name)).map((name) => join(RIG_DIST, 'assets', name))]) {
  writeFileSync(`${file}.gz`, gzipSync(readFileSync(file), { level: 6 }))
}
console.log('Frontendassets deterministisch voorgecomprimeerd met gzip')
