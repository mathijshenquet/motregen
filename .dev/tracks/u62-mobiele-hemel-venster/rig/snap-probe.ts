// U62: wat gebeurt er met de pagina als ze 35 px naast het tabel-snappunt wordt gezet, met en zonder CSS-snap?
import { chromium, devices } from '@playwright/test'
const [baseURL = 'http://127.0.0.1:4320'] = process.argv.slice(2)
const browser = await chromium.launch({ args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader'] })
for (const snapOff of [false, true]) {
  const page = await (await browser.newContext({ ...devices['Pixel 5'], viewport: { width: 390, height: 844 } })).newPage()
  await page.goto(`${baseURL}/weer`)
  await page.locator('tr.current-hour').waitFor({ state: 'attached', timeout: 60_000 })
  await page.locator('.map-splash.ready').waitFor({ state: 'attached', timeout: 60_000 })
  if (snapOff) await page.addStyleTag({ content: 'html { scroll-snap-type: none !important; }' })
  await page.getByRole('button', { name: 'Tabel' }).click()
  await page.waitForTimeout(1_500)
  await page.evaluate('globalThis.__name = (target) => target')
  const trace = await page.evaluate(async () => {
    const top = () => Math.round(document.querySelector('.forecast-panel')!.getBoundingClientRect().top)
    const samples: string[] = [`start ${top()} (scrollY ${Math.round(scrollY)}, snap ${getComputedStyle(document.documentElement).scrollSnapType})`]
    window.scrollBy(0, -35)
    samples.push(`direct ${top()}`)
    for (const wait of [50, 100, 200, 400, 800]) { await new Promise((resolve) => setTimeout(resolve, wait)); samples.push(`+${wait} ${top()}`) }
    return samples
  })
  console.log(`CSS-snap ${snapOff ? 'uit' : 'aan'}: ${trace.join(' · ')}`)
  await page.close()
}
await browser.close()
