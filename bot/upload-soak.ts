import { createServer } from 'node:http'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { TelegramApi } from './api.js'

// Duurtest voor het uploadpad: N uploads van een bestand van 2 MB tegen een lokale server; ArrayBuffers moet na
// GC rond nul blijven. Start met --expose-gc. (Prod 2026-10-10: ingelezen Buffers bleven na elke upload hangen.)
const uploads = Number(process.argv[2] ?? 240)
const server = createServer((request, response) => {
  request.resume()
  request.on('end', () => { response.setHeader('content-type', 'application/json'); response.end(JSON.stringify({ ok: true, result: { message_id: 1 } })) })
})
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
const address = server.address()
if (!address || typeof address === 'string') throw new Error('Geen lokale poort')
const directory = await mkdtemp(join(tmpdir(), 'motregen-upload-soak-'))
const path = join(directory, 'loop.mp4')
await writeFile(path, Buffer.alloc(2_200_000, 7))
const api = new TelegramApi('soak', (url, options) => fetch(String(url).replace('https://api.telegram.org', `http://127.0.0.1:${address.port}`), options))
const megabytes = (bytes: number) => Math.round(bytes / 1_048_576)
let worst = 0
try {
  for (let upload = 0; upload <= uploads; upload++) {
    await api.upload('sendAnimation', { chat_id: '1' }, path, { name: 'animation', mime: 'video/mp4', filename: 'loop.mp4' })
    if (upload % 60 !== 0) continue
    globalThis.gc?.()
    await delay(300)
    globalThis.gc?.()
    const memory = process.memoryUsage()
    worst = Math.max(worst, memory.arrayBuffers)
    console.info(JSON.stringify({ event: 'upload-soak', upload, rssMiB: megabytes(memory.rss), arrayBuffersMiB: megabytes(memory.arrayBuffers) }))
  }
} finally {
  server.close()
  await rm(directory, { recursive: true, force: true })
}
if (megabytes(worst) > 20) { console.error('Uploadpad houdt buffers vast'); process.exitCode = 1 }
