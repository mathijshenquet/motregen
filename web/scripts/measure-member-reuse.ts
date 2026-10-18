// U93: overgedragen bytes van de radarchunk bij één manifestverversing en bij een koude start na herladen.
// Een lokale dataserver serveert een prod-snapshot waarin alleen de radarchunk een nieuwe naam krijgt;
// een build (origin/main of deze branch) draait onder `vite preview` en Chromium telt de bytes per request.
//
// Snapshot voorbereiden (map <snapshot> met manifest-a.json, manifest-b.json en chunks/):
//   curl https://motregen.nl/data/manifest.json > manifest-a.json  (alle chunks erbij downloaden)
//   vijf minuten later idem > manifest-b.json, plus de nieuwe radarchunk
//   radarchunks van vóór generatie 3 krijgen hashes met
//   cargo run --release -p mrf --example reencode -- chunks/<rtcor>.mrf chunks/<rtcor>.mrf
// Gebruik: pnpm exec tsx scripts/measure-member-reuse.ts <snapshot> <dist> [label]
import { spawn } from 'node:child_process'
import { createReadStream } from 'node:fs'
import { readFile, stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { join, resolve } from 'node:path'
import { chromium, type BrowserContext, type Page } from '@playwright/test'

const [snapshot, dist, label = 'build'] = process.argv.slice(2)
if (!snapshot || !dist) throw new Error('gebruik: measure-member-reuse.ts <snapshot> <dist> [label]')
const tilesDir = resolve(import.meta.dirname, '../../tools/basemap/tiles')
const previewPort = 4393
const quietMs = 6_000

let manifestFile = 'manifest-a.json'

const dataServer = createServer(async (request, response) => {
  const path = new URL(request.url ?? '/', 'http://data').pathname.replace(/^\/data/, '')
  if (path === '/manifest.json') {
    response.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-cache' })
    response.end(await readFile(join(snapshot, manifestFile)))
    return
  }
  const file = path.startsWith('/chunks/') ? join(snapshot, path) : path.startsWith('/basemap/') ? join(tilesDir, path.slice('/basemap/'.length)) : undefined
  const size = file && !path.includes('..') ? await stat(file).then((info) => info.size, () => undefined) : undefined
  if (!file || size === undefined) { response.writeHead(404); response.end(); return }
  const range = /^bytes=(\d+)-(\d*)$/.exec(request.headers.range ?? '')
  const start = range ? Number(range[1]) : 0
  const end = range?.[2] ? Math.min(size - 1, Number(range[2])) : size - 1
  response.writeHead(range ? 206 : 200, {
    'content-type': 'application/octet-stream',
    'cache-control': 'public, max-age=31536000, immutable',
    'accept-ranges': 'bytes',
    'content-length': String(end - start + 1),
    ...(range ? { 'content-range': `bytes ${start}-${end}/${size}` } : {}),
  })
  createReadStream(file, { start, end }).pipe(response)
})
await new Promise<void>((done) => dataServer.listen(0, '127.0.0.1', done))
const dataOrigin = `http://127.0.0.1:${(dataServer.address() as AddressInfo).port}`

const preview = spawn('pnpm', ['exec', 'vite', 'preview', '--host', '127.0.0.1', '--port', String(previewPort), '--strictPort', '--outDir', resolve(dist)], {
  cwd: resolve(import.meta.dirname, '..'),
  env: { ...process.env, MOTREGEN_DATA_ORIGIN: dataOrigin },
  stdio: ['ignore', 'pipe', 'inherit'],
})
await new Promise<void>((ready, failed) => {
  preview.stdout!.on('data', (chunk: Buffer) => { if (chunk.toString().includes(String(previewPort))) ready() })
  preview.on('exit', (code) => failed(new Error(`vite preview stopte (${code})`)))
})
const appUrl = `http://127.0.0.1:${previewPort}/`

interface Transfer { url: string; range: string; bytes: number; at: number }

/** Telt per request de body- en headerbytes zoals Chromium ze over de lijn rapporteert. */
function recordTransfers(context: BrowserContext): Transfer[] {
  const transfers: Transfer[] = []
  context.on('requestfinished', (request) => {
    if (!request.url().includes('/data/')) return
    void request.sizes().then((sizes) => transfers.push({
      url: request.url().replace(/^.*\/data\//, ''),
      range: request.headers().range ?? '',
      bytes: sizes.responseBodySize + sizes.responseHeadersSize,
      at: Date.now(),
    }))
  })
  return transfers
}

async function settle(transfers: Transfer[], since: number, until: () => boolean = () => true): Promise<void> {
  const deadline = Date.now() + 180_000
  for (;;) {
    const latest = Math.max(since, ...transfers.filter((transfer) => transfer.url.startsWith('chunks/rtcor')).map((transfer) => transfer.at))
    if (until() && Date.now() - latest > quietMs) return
    if (Date.now() > deadline) throw new Error('radarverkeer kwam niet tot rust')
    await new Promise((wait) => setTimeout(wait, 500))
  }
}

function summary(transfers: Transfer[], since: number) {
  const window = transfers.filter((transfer) => transfer.at >= since)
  const radar = window.filter((transfer) => transfer.url.startsWith('chunks/rtcor'))
  return {
    radarBytes: radar.reduce((sum, transfer) => sum + transfer.bytes, 0),
    radarRequests: radar.map((transfer) => `${transfer.url.split('/').at(-1)} ${transfer.range} ${transfer.bytes}`),
    otherDataBytes: window.filter((transfer) => !transfer.url.startsWith('chunks/rtcor')).reduce((sum, transfer) => sum + transfer.bytes, 0),
  }
}

async function openApp(context: BrowserContext): Promise<Page> {
  const page = await context.newPage()
  await page.goto(appUrl)
  return page
}

const browser = await chromium.launch()
const results: Record<string, unknown> = { label }
try {
  // Verversing terwijl de app openstaat: na manifest A komt bij de volgende poll manifest B.
  manifestFile = 'manifest-a.json'
  const openContext = await browser.newContext({ serviceWorkers: 'block' })
  const openTransfers = recordTransfers(openContext)
  const radarSeen = (transfers: Transfer[], since: number) => () => transfers.some((transfer) => transfer.at >= since && transfer.url.startsWith('chunks/rtcor'))
  const opened = Date.now()
  const openPage = await openApp(openContext)
  await settle(openTransfers, opened, radarSeen(openTransfers, opened))
  results.startA = summary(openTransfers, 0)
  manifestFile = 'manifest-b.json'
  const switched = Date.now()
  let refreshedAt: number | undefined
  openContext.on('requestfinished', (request) => { if (request.url().endsWith('/data/manifest.json') && Date.now() >= switched) refreshedAt ??= Date.now() })
  // Pas tellen als de client na de poll radar heeft opgevraagd; settle rekent de stilte vanaf de laatste radarrequest.
  await settle(openTransfers, switched, () => refreshedAt !== undefined && radarSeen(openTransfers, refreshedAt)())
  results.refresh = { ...summary(openTransfers, refreshedAt!), secondsUntilPoll: Math.round((refreshedAt! - switched) / 1000) }
  await openPage.close()
  await openContext.close()

  // Koude start na herladen: IndexedDB en HTTP-cache gevuld met A, de nieuwe pagina krijgt B.
  manifestFile = 'manifest-a.json'
  const coldContext = await browser.newContext({ serviceWorkers: 'block' })
  const coldTransfers = recordTransfers(coldContext)
  const firstOpened = Date.now()
  const firstPage = await openApp(coldContext)
  await settle(coldTransfers, firstOpened, radarSeen(coldTransfers, firstOpened))
  await firstPage.waitForTimeout(3_000)
  await firstPage.close()
  manifestFile = 'manifest-b.json'
  const reopened = Date.now()
  await openApp(coldContext)
  await settle(coldTransfers, reopened, radarSeen(coldTransfers, reopened))
  results.coldStart = summary(coldTransfers, reopened)
  await coldContext.close()
} finally {
  await browser.close()
  preview.kill()
  dataServer.close()
}
console.log(JSON.stringify(results, null, 2))
