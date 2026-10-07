import { createServer } from 'node:http'
import { mkdir, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { validateChromeTrace } from './prof-check'

const port = Number(process.env.MOTREGEN_PROF_SINK_PORT ?? 4331)
const host = process.env.MOTREGEN_PROF_SINK_HOST ?? '127.0.0.1'
const outputDir = process.env.MOTREGEN_PROFILE_DIR ?? join(homedir(), 'motregen-profiles')
const maxBytes = 50 * 1024 * 1024

const server = createServer((request, response) => {
  if (request.method !== 'POST' || request.url !== '/prof') {
    response.writeHead(404).end('Niet gevonden')
    return
  }
  let size = 0
  const chunks: Buffer[] = []
  request.on('data', (chunk: Buffer) => {
    size += chunk.length
    if (size > maxBytes) request.destroy(new Error('Profiel is groter dan 50 MB'))
    else chunks.push(chunk)
  })
  request.on('error', (error) => {
    if (!response.headersSent) response.writeHead(413).end(error.message)
  })
  request.on('end', () => {
    void save(Buffer.concat(chunks)).then((file) => {
      response.writeHead(201, { 'Content-Type': 'application/json' }).end(JSON.stringify({ file }))
    }, (error: unknown) => {
      response.writeHead(400, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }))
    })
  })
})

async function save(body: Buffer): Promise<string> {
  const parsed = JSON.parse(body.toString('utf8')) as { metadata?: { platform?: unknown } }
  validateChromeTrace(parsed)
  const platform = safePart(typeof parsed.metadata?.platform === 'string' ? parsed.metadata.platform : 'unknown')
  const stamp = new Date().toISOString()
  const filename = `${stamp}-${platform}.json`
  await mkdir(outputDir, { recursive: true })
  await writeFile(join(outputDir, filename), body, { flag: 'wx', mode: 0o600 })
  return filename
}

function safePart(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'unknown'
}

server.listen(port, host, () => {
  console.log(`prof-sink luistert op http://${host}:${port}/prof → ${outputDir}`)
})

function stop(): void {
  server.close((error) => {
    if (error) throw error
  })
}

process.on('SIGINT', stop)
process.on('SIGTERM', stop)
