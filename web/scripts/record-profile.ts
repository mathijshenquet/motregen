import { chromium } from '@playwright/test'
import { dirname, resolve } from 'node:path'
import { mkdir } from 'node:fs/promises'
import { applyEmulation, performanceProfile, performanceProjects } from '../e2e/profiles'
import type { Manifest } from '../src/core/contract'
import type { LoadFrameTrace, LoadTraceSnapshot, PerfMeasure, PerfSnapshot, PerfTraceSlice } from '../src/core/perf'
import { READY_WINDOW_MS } from '../src/core/window-ready'

// Gebruik: pnpm prof:capture [origin] [uitvoer.json] [--profile=desktop|mobile-4g|mobile-fast-3g]
//                            [--passive | --water-mask] [--decode-cost=<ms>] [--no-send]
// Koude-startopname (`?perf=start`, de eerste 30 s na timeOrigin) onder een e2e-profiel. Scenario:
// de vaste journey (wind, gevoel, zoom, scrub), met --passive alleen kijken (de app speelt zelf
// af), of met --water-mask pannen en zoomen (U48). Print het decode-budget (U49). Met een
// uitvoerpad wordt de opname gedownload; anders gaat ze naar de profielsink, tenzij --no-send.
// --decode-cost=<ms> laat elke decode-worker zoveel ms extra rekenen per frame: CDP kan workers
// niet remmen, en op een telefoon is juist de decode de bottleneck (PO-opname: 26 ms per frame).
const flags = process.argv.slice(2).filter((argument) => argument.startsWith('--'))
const positional = process.argv.slice(2).filter((argument) => !argument.startsWith('--'))
const origin = positional[0] ?? 'http://127.0.0.1:4330'
const output = positional[1]
const profile = performanceProfile(flags.find((flag) => flag.startsWith('--profile='))?.slice('--profile='.length) ?? 'desktop')
const waterMask = flags.includes('--water-mask')
const passive = flags.includes('--passive')
const send = !flags.includes('--no-send')
const decodeCostMs = Number(flags.find((flag) => flag.startsWith('--decode-cost='))?.slice('--decode-cost='.length) ?? 0)
const windowMs = 30_000

interface PerfWindow {
  __motregenPerf: {
    snapshot: () => PerfSnapshot
    traceSlice: (startTime: number, endTime: number) => PerfTraceSlice
    loads: { snapshot: () => LoadTraceSnapshot }
  }
  __motregenWind?: { waterMask?: Uint8Array; waterWorker?: Worker; waterWorkerFailed: boolean; waterTileBuffers: Map<string, ArrayBuffer> }
}

const project = performanceProjects.find((candidate) => candidate.name === profile.id)!
const browser = await chromium.launch({ headless: true, args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader'] })
const context = await browser.newContext(profile.network ? project.use : { viewport: { width: 1280, height: 720 } })
const page = await context.newPage()

try {
  await applyEmulation(await context.newCDPSession(page), profile)

  if (decodeCostMs > 0) await slowDecodeWorkers(decodeCostMs)

  await page.goto(`${origin}/?perf=start`, { waitUntil: 'domcontentloaded', timeout: 120_000 })
  await page.waitForFunction(() => (window as unknown as PerfWindow).__motregenPerf?.snapshot().ttfrMs != null, undefined, { timeout: 120_000 })
  const profilerAvailable = await page.evaluate(() => 'Profiler' in globalThis)

  if (waterMask) await panAndZoom()
  else if (!passive) await journey()

  await page.locator('.perf-recording').getByText(/Opname gereed/).waitFor({ timeout: 120_000 })
  let delivered: string | null = null
  if (output) {
    await mkdir(dirname(resolve(output)), { recursive: true })
    const download = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Download' }).click()
    await (await download).saveAs(output)
    delivered = output
  } else if (send) {
    await page.getByRole('button', { name: 'Stuur' }).click()
    const notice = page.locator('.perf-recording').getByText(/Verstuurd als/)
    await notice.waitFor({ timeout: 15_000 })
    delivered = await notice.textContent()
  }

  const captured = await page.evaluate((endTime) => {
    const state = window as unknown as PerfWindow
    const mask = state.__motregenWind?.waterMask
    return {
      snapshot: state.__motregenPerf.snapshot(),
      slice: state.__motregenPerf.traceSlice(0, endTime),
      loads: state.__motregenPerf.loads.snapshot(),
      waterMask: mask ? {
        cells: mask.length, waterCells: mask.filter((value) => value === 255).length,
        landCells: mask.filter((value) => value === 0).length, worker: !!state.__motregenWind?.waterWorker,
        workerFailed: state.__motregenWind?.waterWorkerFailed, cachedTiles: state.__motregenWind?.waterTileBuffers.size,
      } : undefined,
    }
  }, windowMs)
  if (waterMask && (!captured.waterMask?.waterCells || !captured.waterMask?.landCells)) throw new Error('watermasker-scenario mist water of land')

  const manifest = await (await fetch(`${origin}/data/manifest.json`)).json() as Manifest
  const decodes = captured.slice.measures.filter((measure) => measure.phase === 'frame-decode' && measure.startTime <= windowMs)
  const durations = decodes.map((measure) => measure.duration).sort((left, right) => left - right)
  console.log(JSON.stringify({
    origin,
    profile: profile.id,
    scenario: waterMask ? 'pannen en zoomen' : passive ? 'passief' : 'wind, gevoel, zoom, scrub',
    cpuThrottleRate: profile.cpuThrottleRate,
    decodeCostMs,
    hardwareConcurrency: await page.evaluate(() => navigator.hardwareConcurrency),
    profilerAvailable,
    delivered,
    ttfrMs: captured.snapshot.ttfrMs,
    // Per veld het moment waarop nu ± 1 u compleet was, en hoe lang na de eerste regen-draw (U52).
    windowReady: Object.fromEntries(Object.entries(captured.snapshot.windowReadyMs)
      .sort(([, left], [, right]) => left - right)
      .map(([field, readyMs]) => [field, { readyMs, afterFirstRainMs: readyMs - (captured.snapshot.ttfrMs ?? 0) }])),
    decodes: decodes.length,
    decodeTotalMs: Math.round(durations.reduce((total, duration) => total + duration, 0)),
    decodeP50Ms: percentile(durations, 0.5),
    decodeP95Ms: percentile(durations, 0.95),
    // Per veld de frames binnen nu ± 1 u: wanneer gevraagd, wanneer de bytes er waren en wanneer
    // gedecodeerd. Het gat bytes → decode is wachtrij, het gat vraag → bytes is netwerk.
    windowFront: windowFront(manifest, captured.loads.frames),
    scrub: captured.snapshot.scrub,
    // CDP kan workers niet remmen ("only supported for pages"): de decodetijd hieronder is die van
    // deze host, ook onder mobile-4g. Het aantal is de robuuste maat; zie docs/perf.md.
    byLayer: breakdown(decodes, 'layer'),
    byField: breakdown(decodes, 'field'),
    waterMask: captured.waterMask,
    snapshot: captured.snapshot,
    requests: captured.loads.requests.map((request) => ({
      chunk: new URL(request.url).pathname.split('/').at(-1)!.split('-').slice(0, 2).join('-'),
      layer: request.layer, priority: request.priority, frames: request.frames.length, bytes: request.bytes,
      startMs: Math.round(request.startMs), responseMs: request.responseMs && Math.round(request.responseMs), endMs: request.endMs && Math.round(request.endMs),
    })),
    stages: captured.loads.marks.flatMap((mark) => mark.kind === 'stage' ? [{ stage: mark.stage, atMs: Math.round(mark.t) }] : []),
  }, null, 2))
} finally {
  await browser.close()
}

// De worker rekent eerst de opgegeven tijd weg en decodeert dan pas; de gemeten decodeduur zelf
// (fase `frame-decode`) blijft dus die van deze host.
async function slowDecodeWorkers(costMs: number): Promise<void> {
  await page.route('**/assets/zstd.worker-*.js', async (route) => {
    const response = await route.fetch()
    const slowed = `${await response.text()}
;{
  const decode = self.onmessage
  self.onmessage = (event) => {
    const busyUntil = performance.now() + ${costMs}
    while (performance.now() < busyUntil);
    decode(event)
  }
}`
    await route.fulfill({ response, body: slowed })
  })
}

async function journey(): Promise<void> {
  const wind = page.getByRole('button', { name: 'Wind' })
  if (await wind.isVisible()) await wind.click({ force: true })
  await page.waitForTimeout(2_000)
  const feelsLike = page.getByRole('button', { name: 'Gevoel' })
  if (await feelsLike.isVisible()) await feelsLike.click({ force: true })
  await page.waitForTimeout(2_000)
  const map = page.locator('.maplibregl-canvas')
  if (await map.isVisible()) {
    await map.hover({ position: { x: 320, y: 240 } })
    await page.mouse.wheel(0, -400)
  }
  const scrubber = page.getByRole('slider', { name: 'Tijd' })
  await scrubber.focus()
  await scrubber.press('Home')
  for (let step = 0; step < 20; step++) await scrubber.press('ArrowRight')
}

async function panAndZoom(): Promise<void> {
  const map = page.locator('.maplibregl-canvas')
  const box = await map.boundingBox()
  if (!box) throw new Error('kaart ontbreekt in watermasker-scenario')
  const started = performance.now()
  for (let step = 0; step < 20; step++) {
    const direction = step % 2 === 0 ? 1 : -1
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width * 0.5 + direction * 80, box.y + box.height * 0.5 + direction * 30, { steps: 6 })
    await page.mouse.up()
    await page.mouse.wheel(0, step < 10 ? -80 : 80)
    await page.waitForTimeout(Math.max(0, started + (step + 1) * 500 - performance.now()))
  }
  await page.waitForTimeout(10_000)
}

interface FieldFront { frames: number; decoded: number; firstRequestedMs: number; lastBytesReadyMs: number | null; lastDecodedMs: number | null }

function windowFront(manifest: Manifest, frames: LoadFrameTrace[]): Record<string, FieldFront> {
  const now = Date.parse(manifest.now)
  const chunkByPath = new Map(manifest.chunks.map((chunk) => [new URL(chunk.url, `${origin}/data/manifest.json`).pathname, chunk]))
  const inWindow = new Map<string, LoadFrameTrace[]>()
  for (const frame of frames) {
    const chunk = chunkByPath.get(new URL(frame.url).pathname)
    const time = chunk?.times[frame.frameIndex]
    if (!chunk || time === undefined || Math.abs(Date.parse(time) - now) > READY_WINDOW_MS) continue
    const field = chunk.field ?? 'rain_rate'
    inWindow.set(field, [...(inWindow.get(field) ?? []), frame])
  }
  const latest = (times: Array<number | undefined>) => {
    const known = times.filter((time): time is number => time !== undefined)
    return known.length ? Math.round(Math.max(...known)) : null
  }
  return Object.fromEntries([...inWindow].map(([field, traces]) => [field, {
    frames: traces.length,
    decoded: traces.filter((trace) => trace.decodedMs !== undefined).length,
    firstRequestedMs: Math.round(Math.min(...traces.map((trace) => trace.requestedMs))),
    lastBytesReadyMs: latest(traces.map((trace) => trace.bytesReadyMs)),
    lastDecodedMs: latest(traces.map((trace) => trace.decodedMs)),
  }]))
}

function percentile(sorted: number[], fraction: number): number | null {
  if (!sorted.length) return null
  return Math.round(sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))]! * 10) / 10
}

function breakdown(decodes: PerfMeasure[], key: 'layer' | 'field'): Record<string, { decodes: number; totalMs: number }> {
  const groups: Record<string, { decodes: number; totalMs: number }> = {}
  for (const decode of decodes) {
    const group = groups[String(decode.detail?.[key] ?? 'onbekend')] ??= { decodes: 0, totalMs: 0 }
    group.decodes++
    group.totalMs += decode.duration
  }
  for (const group of Object.values(groups)) group.totalMs = Math.round(group.totalMs)
  return groups
}
