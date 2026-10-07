import { copyFileSync, mkdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const tilesDir = resolve('../tools/basemap/tiles')
const { filename } = JSON.parse(readFileSync(resolve(tilesDir, 'manifest.json'), 'utf8'))
const dataDir = resolve('public/data/basemap')
mkdirSync(dataDir, { recursive: true })
copyFileSync(resolve(tilesDir, filename), resolve(dataDir, filename))
console.log(`E2e-basiskaartarchief voorbereid: ${filename}`)
