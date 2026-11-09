// U109: wat haalt de serviceworker bij een eerste bezoek op? De perf-rigs zien SW-requests niet (CDP op de
// pagina), maar op een telefoon delen ze dezelfde lijn met de weerdata. Meet aantallen, bytes en starttijd.
// Gebruik: pnpm exec tsx scripts/u109-sw-install.ts <origin> [<origin> ...]
import { chromium } from '@playwright/test'

for (const origin of process.argv.slice(2)) {
  const browser = await chromium.launch()
  const context = await browser.newContext({ serviceWorkers: 'allow' })
  const page = await context.newPage()
  const started = Date.now()
  const fromWorker: Array<Promise<{ url: string; startMs: number; bytes: number }>> = []
  context.on('request', (request) => {
    if (!request.serviceWorker()) return
    const startMs = Date.now() - started
    fromWorker.push(request.response().then(async (response) => ({ url: request.url(), startMs, bytes: response ? (await request.sizes()).responseBodySize : 0 })))
  })
  await page.goto(origin)
  await page.evaluate(async () => { await navigator.serviceWorker.ready })
  await page.waitForTimeout(3_000)
  const requests = await Promise.all(fromWorker)
  const bytes = requests.reduce((sum, request) => sum + request.bytes, 0)
  console.log(`${origin}: ${requests.length} SW-requests, ${bytes} B body, eerste na ${Math.min(...requests.map((request) => request.startMs))} ms`)
  for (const request of requests.sort((a, b) => b.bytes - a.bytes).slice(0, 12)) console.log(`  ${String(request.bytes).padStart(8)} ${new URL(request.url).pathname}`)
  await browser.close()
}
