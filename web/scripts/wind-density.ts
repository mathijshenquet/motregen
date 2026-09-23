import { chromium, devices, type BrowserContextOptions } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

// Spreidingsindex (variantie/gemiddelde per cel) van de zichtbare windkoppen
// bij verschillende spawn-jitters (track U3b). 1 ≈ uniform random, lager = gelijkmatiger.
const [origin, outDir, jitters = '1,0.6,0'] = process.argv.slice(2)
if (!origin || !outDir) throw new Error('usage: pnpm exec tsx scripts/wind-density.ts ORIGIN OUT_DIR [JITTERS]')
mkdirSync(outDir, { recursive: true })
// Raster ≈ vierkante cellen met ~2 koppen per cel bij volle dichtheid.
const profiles: Array<{ id: string; context: BrowserContextOptions; columns: number; rows: number }> = [
  { id: 'mobile', context: { ...devices['Pixel 5'] }, columns: 6, rows: 11 },
  { id: 'desktop', context: { viewport: { width: 1280, height: 720 } }, columns: 16, rows: 9 },
]
const browser = await chromium.launch({ headless: true, args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader'] })
for (const profile of profiles) {
  for (const jitter of jitters.split(',').map(Number)) {
    const context = await browser.newContext(profile.context)
    await context.addInitScript((value) => {
      localStorage.setItem('motregen-theme', 'dark')
      localStorage.setItem('motregen-wind-tuning-v2', JSON.stringify({ spawnJitter: value }))
    }, jitter)
    const page = await context.newPage()
    page.setDefaultTimeout(120_000)
    await page.goto(new URL('/', origin).href)
    await page.waitForFunction(() => (globalThis as unknown as { __motregenPerf?: { snapshot: () => { ttfrMs: number | null } } }).__motregenPerf?.snapshot().ttfrMs != null)
    await page.waitForTimeout(15_000)
    const samples: Array<{ particles: number; dispersion: number }> = []
    for (let index = 0; index < 8; index++) {
      samples.push(await page.evaluate(`globalThis.__motregenWind.dispersion(${profile.columns}, ${profile.rows})`) as { particles: number; dispersion: number })
      await page.waitForTimeout(700)
    }
    const mean = samples.reduce((sum, sample) => sum + sample.dispersion, 0) / samples.length
    console.log(`${profile.id} jitter=${jitter} dispersion=${mean.toFixed(3)} particles=${samples.map((sample) => sample.particles).join('/')} samples=${samples.map((sample) => sample.dispersion.toFixed(2)).join('/')}`)
    await page.locator('.map').first().screenshot({ path: join(outDir, `spawn-jitter-${jitter}-${profile.id}-dark.png`) })
    await context.close()
  }
}
await browser.close()
