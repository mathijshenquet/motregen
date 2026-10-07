import { chromium } from '@playwright/test'
import { applyEmulation, performanceProfile, performanceProjects } from '../e2e/profiles'
import type { PerfMeasure, PerfSnapshot, PerfTraceSlice } from '../src/core/perf'

// Gebruik: pnpm prof:capture [origin] [desktop|mobile-4g|mobile-fast-3g] [--no-send]
// Koude-startopname (`?perf=start`, de eerste 30 s na timeOrigin) met een vaste journey; print
// het decode-budget (U49) en stuurt de opname naar de profielsink tenzij --no-send.
const positional = process.argv.slice(2).filter((argument) => !argument.startsWith('--'))
const origin = positional[0] ?? 'http://127.0.0.1:4330'
const profile = performanceProfile(positional[1] ?? 'desktop')
const send = !process.argv.includes('--no-send')
const windowMs = 30_000

interface PerfWindow {
  __motregenPerf: {
    snapshot: () => PerfSnapshot
    traceSlice: (startTime: number, endTime: number) => PerfTraceSlice
  }
}

const project = performanceProjects.find((candidate) => candidate.name === profile.id)!
const browser = await chromium.launch({ headless: true, args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader'] })
const context = await browser.newContext(profile.network ? project.use : { viewport: { width: 1280, height: 720 } })
const page = await context.newPage()

try {
  await applyEmulation(await context.newCDPSession(page), profile)

  await page.goto(`${origin}/?perf=start`, { waitUntil: 'domcontentloaded', timeout: 120_000 })
  await page.waitForFunction(() => (window as unknown as PerfWindow).__motregenPerf?.snapshot().ttfrMs != null, undefined, { timeout: 120_000 })
  const profilerAvailable = await page.evaluate(() => 'Profiler' in globalThis)

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

  await page.locator('.perf-recording').getByText(/Opname gereed/).waitFor({ timeout: 120_000 })
  let sent: string | null = null
  if (send) {
    await page.getByRole('button', { name: 'Stuur' }).click()
    const notice = page.locator('.perf-recording').getByText(/Verstuurd als/)
    await notice.waitFor({ timeout: 15_000 })
    sent = await notice.textContent()
  }

  const captured = await page.evaluate((endTime) => {
    const perf = (window as unknown as PerfWindow).__motregenPerf
    return { snapshot: perf.snapshot(), slice: perf.traceSlice(0, endTime) }
  }, windowMs)

  const decodes = captured.slice.measures.filter((measure) => measure.phase === 'frame-decode' && measure.startTime <= windowMs)
  const durations = decodes.map((measure) => measure.duration).sort((left, right) => left - right)
  console.log(JSON.stringify({
    origin,
    profile: profile.id,
    cpuThrottleRate: profile.cpuThrottleRate,
    hardwareConcurrency: await page.evaluate(() => navigator.hardwareConcurrency),
    profilerAvailable,
    sent,
    ttfrMs: captured.snapshot.ttfrMs,
    decodes: decodes.length,
    decodeTotalMs: Math.round(durations.reduce((total, duration) => total + duration, 0)),
    decodeP50Ms: percentile(durations, 0.5),
    decodeP95Ms: percentile(durations, 0.95),
    scrub: captured.snapshot.scrub,
    // CDP kan workers niet remmen ("only supported for pages"): de decodetijd hieronder is die van
    // deze host, ook onder mobile-4g. Het aantal is de robuuste maat; zie docs/perf.md.
    byLayer: breakdown(decodes, 'layer'),
    byField: breakdown(decodes, 'field'),
  }, null, 2))
} finally {
  await browser.close()
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
