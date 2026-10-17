// Dev-dataserver: proxyt /data naar een bron (standaard prod) en legt er de uitvoer van een lokale oneshot overheen
// (ecmwf.json/cams.json + chunks), zodat een preview een nieuwe bron toont voordat de daemon hem publiceert.
// Gebruik: node scripts/manifest-overlay.mjs <publicatiemap> [poort] [origin]
// Daarna de preview starten met MOTREGEN_DATA_ORIGIN=http://127.0.0.1:<poort>.
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { join, normalize } from 'node:path'

const publication = process.argv[2]
const port = Number(process.argv[3] ?? 4380)
const origin = process.argv[4] ?? 'https://motregen.nl'
if (!publication) throw new Error('publicatiemap ontbreekt')

const sidecars = { ecmwf: 'ecmwf.json', cams: 'cams.json' }
// Dezelfde cache-header als caddy op prod: chunknamen dragen een inhoudshash. Met no-store meldde Chromium elke
// Range-respons als net::ERR_ABORTED nadat de bytes al binnen waren (U91), en bleef de bytecache van de client buiten beeld.
const CHUNK_CACHE = 'public, max-age=31536000, immutable'

async function readSidecar(name) {
  try {
    return JSON.parse(await readFile(join(publication, name), 'utf8'))
  } catch {
    return undefined
  }
}

async function overlaidManifest(search) {
  const manifest = await (await fetch(`${origin}/data/manifest.json${search}`)).json()
  for (const [section, file] of Object.entries(sidecars)) {
    const sidecar = await readSidecar(file)
    if (!sidecar) continue
    const { chunks, ...rest } = sidecar
    manifest.chunks = [...manifest.chunks.filter((chunk) => chunk.source !== section), ...chunks]
    manifest[section] = rest
  }
  return manifest
}

createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', 'http://overlay')
  try {
    if (url.pathname === '/data/manifest.json') {
      response.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' })
      response.end(JSON.stringify(await overlaidManifest(url.search)))
      return
    }
    const local = normalize(url.pathname.replace(/^\/data\//, ''))
    if (local.startsWith('chunks/') && !local.includes('..')) {
      try {
        const bytes = await readFile(join(publication, local))
        // De client leest chunks met Range (header, dan frames); zonder 206 breekt hij de volle download af.
        const range = /^bytes=(\d+)-(\d*)$/.exec(request.headers.range ?? '')
        if (range) {
          const start = Number(range[1])
          const end = Math.min(bytes.length - 1, range[2] ? Number(range[2]) : bytes.length - 1)
          response.writeHead(206, { 'content-type': 'application/octet-stream', 'cache-control': CHUNK_CACHE, 'content-range': `bytes ${start}-${end}/${bytes.length}`, 'content-length': end - start + 1 })
          response.end(bytes.subarray(start, end + 1))
          return
        }
        response.writeHead(200, { 'content-type': 'application/octet-stream', 'cache-control': CHUNK_CACHE, 'content-length': bytes.length })
        response.end(bytes)
        return
      } catch {}
    }
    // Range doorgeven: pmtiles en chunks van de bron lezen in stukken.
    const upstream = await fetch(`${origin}${url.pathname}${url.search}`, { headers: request.headers.range ? { range: request.headers.range } : {} })
    const headers = { 'content-type': upstream.headers.get('content-type') ?? 'application/octet-stream' }
    for (const name of ['content-range', 'accept-ranges', 'etag', 'cache-control']) {
      const value = upstream.headers.get(name)
      if (value) headers[name] = value
    }
    const body = Buffer.from(await upstream.arrayBuffer())
    response.writeHead(upstream.status, { ...headers, 'content-length': body.length })
    response.end(body)
  } catch (error) {
    response.writeHead(502)
    response.end(String(error))
  }
}).listen(port, '127.0.0.1', () => console.log(`overlay op http://127.0.0.1:${port} → ${origin} + ${publication}`))
