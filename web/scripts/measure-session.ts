import { chromium, type Page } from '@playwright/test'

interface NetworkTotals {
  manifest: { requests: number; bytes: number }
  chunks: { requests: number; bytes: number }
  total: { requests: number; bytes: number }
}

const origin = process.argv[2]
if (!origin) throw new Error('usage: pnpm exec tsx scripts/measure-session.ts ORIGIN')

const browser = await chromium.launch({
  headless: true,
  args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader'],
})
const context = await browser.newContext({ viewport: { width: 1280, height: 720 } })
const page = await context.newPage()
const errors: string[] = []
page.on('console', (message) => { if (message.type() === 'error') errors.push(`console: ${message.text()}`) })
page.on('pageerror', (error) => errors.push(`page: ${error.message}`))
page.on('requestfailed', (request) => errors.push(`request: ${request.url()} (${request.failure()?.errorText ?? 'failed'})`))

const cdp = await context.newCDPSession(page)
let encodedBytes = 0
cdp.on('Network.loadingFinished', (event) => { encodedBytes += event.encodedDataLength })
await cdp.send('Network.enable')

await page.goto(new URL('/?perf=1', origin).href)
await page.waitForFunction(() => (globalThis as unknown as { __motregenPerf: { snapshot: () => { ttfrMs: number | null } } }).__motregenPerf.snapshot().ttfrMs !== null)
await page.locator('.location-label').filter({ hasText: /^De Bilt$/ }).waitFor()
await page.locator('tbody tr').first().locator('td').last().filter({ hasNotText: '—' }).waitFor()
await waitForNetworkIdle(page)
const passive = { encodedBytes, resources: await resourceTotals(page), perf: await perfSnapshot(page) }

const scrubber = page.getByRole('slider', { name: 'Tijd' })
const frames = Number(await scrubber.getAttribute('aria-valuemax')) + 1
await scrubber.focus()
await scrubber.press('Home')
for (let index = 1; index < frames; index++) await scrubber.press('ArrowRight')
await waitForNetworkIdle(page)
const scrubbed = { encodedBytes, resources: await resourceTotals(page), perf: await perfSnapshot(page) }

console.log(JSON.stringify({ frames, passive, scrubbed, scrubDeltaEncodedBytes: scrubbed.encodedBytes - passive.encodedBytes, errors }, null, 2))
await browser.close()

async function waitForNetworkIdle(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(1_000)
}

function perfSnapshot(page: Page) {
  return page.evaluate(() => (globalThis as unknown as { __motregenPerf: { snapshot: () => unknown } }).__motregenPerf.snapshot())
}

function resourceTotals(page: Page): Promise<NetworkTotals> {
  return page.evaluate(() => {
    const totals: NetworkTotals = {
      manifest: { requests: 0, bytes: 0 },
      chunks: { requests: 0, bytes: 0 },
      total: { requests: 0, bytes: 0 },
    }
    const entries = performance.getEntriesByType('resource') as unknown as Array<{ name: string; transferSize: number }>
    for (const entry of entries) {
      const path = new URL(entry.name).pathname
      const kind = path.endsWith('/manifest.json') ? 'manifest' : path.includes('/chunks/') ? 'chunks' : null
      totals.total.requests++
      totals.total.bytes += entry.transferSize
      if (kind) {
        totals[kind].requests++
        totals[kind].bytes += entry.transferSize
      }
    }
    return totals
  })
}
