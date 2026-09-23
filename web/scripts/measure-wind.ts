import { chromium, devices, type BrowserContextOptions } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

// Windlaag-frametijd en screenshots (track U3). SwiftShader rendert WebGL op
// de CPU, dus fragmentkosten van de windlaag tellen mee in de frame-intervallen.
const [origin, outDir, label = 'run'] = process.argv.slice(2)
if (!origin || !outDir) throw new Error('usage: pnpm exec tsx scripts/measure-wind.ts ORIGIN OUT_DIR [LABEL]')
mkdirSync(outDir, { recursive: true })

const profiles: Array<{ id: string; context: BrowserContextOptions; cpuThrottleRate: number }> = [
  { id: 'mobile', context: { ...devices['Pixel 5'] }, cpuThrottleRate: 4 },
  { id: 'desktop', context: { viewport: { width: 1280, height: 720 } }, cpuThrottleRate: 1 },
]
const sampleMs = Number(process.env.MEASURE_SAMPLE_MS ?? 8_000)
const profileFilter = process.env.MEASURE_PROFILES?.split(',')
const screenshots = process.env.MEASURE_SCREENSHOTS !== '0'
const browser = await chromium.launch({
  headless: true,
  args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader'],
})
const results: Record<string, unknown> = {}

for (const profile of profiles.filter((candidate) => !profileFilter || profileFilter.includes(candidate.id))) {
  for (const theme of ['light', 'dark'] as const) {
    const context = await browser.newContext(profile.context)
    await context.addInitScript((value) => localStorage.setItem('motregen-theme', value), theme)
    const page = await context.newPage()
    page.setDefaultTimeout(120_000)
    const cdp = await context.newCDPSession(page)
    await page.goto(new URL('/?perf=0', origin).href)
    await page.waitForFunction(() => (globalThis as unknown as { __motregenPerf?: { snapshot: () => { ttfrMs: number | null } } }).__motregenPerf?.snapshot().ttfrMs != null)
    await page.waitForTimeout(6_000)
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: profile.cpuThrottleRate })
    await cdp.send('Performance.enable')
    const before = await taskDuration(cdp)
    // Als string: tsx' keepNames injecteert anders een __name-helper die in de pagina ontbreekt.
    const intervals = await page.evaluate(`new Promise((resolve) => {
      const values = []
      let previous = 0
      const start = performance.now()
      requestAnimationFrame(function tick(now) {
        if (previous) values.push(now - previous)
        previous = now
        if (now - start < ${sampleMs}) requestAnimationFrame(tick)
        else resolve(values)
      })
    })`) as number[]
    const after = await taskDuration(cdp)
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 })
    const sorted = [...intervals].sort((a, b) => a - b)
    const mean = intervals.reduce((sum, value) => sum + value, 0) / Math.max(1, intervals.length)
    const key = `${profile.id}-${theme}`
    results[key] = {
      frames: intervals.length,
      meanFrameMs: round(mean),
      p50FrameMs: round(sorted[Math.floor(sorted.length * 0.5)] ?? 0),
      p95FrameMs: round(sorted[Math.floor(sorted.length * 0.95)] ?? 0),
      mainThreadBusyPct: round((after - before) / (sampleMs / 1_000) * 100),
    }
    console.log(label, key, JSON.stringify(results[key]))
    if (screenshots) await page.locator('.map').first().screenshot({ path: join(outDir, `${label}-${key}.png`) })
    await context.close()
  }
}
await browser.close()
writeFileSync(join(outDir, `${label}-frametimes.json`), JSON.stringify(results, null, 2))

async function taskDuration(cdp: import('@playwright/test').CDPSession): Promise<number> {
  const { metrics } = await cdp.send('Performance.getMetrics')
  return metrics.find((metric) => metric.name === 'TaskDuration')?.value ?? 0
}

function round(value: number): number {
  return Math.round(value * 100) / 100
}
