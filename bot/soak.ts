import { setTimeout as delay } from 'node:timers/promises'
import { StillRenderer } from './render.js'
import { LOOP_MODES, PREWARM_HOURS, type StillManifest } from './stills.js'

// Duurtest: rendert meerdere generaties in één proces en logt na elke ronde het Node-geheugen. Een lek over
// generaties is in een meting van één generatie per proces niet te zien (prod 2026-10-10).
const rounds = Number(process.argv[2] ?? 10)
const origin = process.env.MOTREGEN_ORIGIN ?? 'https://motregen.nl'
const cacheDirectory = process.env.MOTREGEN_RENDER_CACHE
if (!cacheDirectory) throw new Error('MOTREGEN_RENDER_CACHE ontbreekt')
const megabytes = (bytes: number) => Math.round(bytes / 1_048_576)
const renderer = new StillRenderer(origin, cacheDirectory)
const first = await renderer.manifest()
try {
  for (let round = 0; round < rounds; round++) {
    // Elke ronde een andere kaarttijd en generatie, zodat niets uit de cache komt en de tekstatlassen opnieuw ontstaan.
    const manifest: StillManifest = {
      ...first,
      now: new Date(Date.parse(first.now) - round * 300_000).toISOString(),
      generated: new Date(Date.parse(first.generated) + round * 1000).toISOString().replace('.000Z', 'Z'),
    }
    const started = performance.now()
    await renderer.prune()
    await Promise.all(LOOP_MODES.map(async (definition) => {
      await renderer.render({ mode: definition.mode, hour: 'loop' }, manifest)
      if (definition.mode === 'wind') return
      for (const hour of PREWARM_HOURS) await renderer.render({ mode: definition.mode, hour }, manifest)
    }))
    const seconds = Math.round((performance.now() - started) / 100) / 10
    globalThis.gc?.()
    await delay(1000)
    globalThis.gc?.()
    const memory = process.memoryUsage()
    console.info(JSON.stringify({ event: 'soak-round', round, seconds, rssMiB: megabytes(memory.rss), heapUsedMiB: megabytes(memory.heapUsed), externalMiB: megabytes(memory.external), arrayBuffersMiB: megabytes(memory.arrayBuffers) }))
  }
} finally {
  await renderer.close()
}
