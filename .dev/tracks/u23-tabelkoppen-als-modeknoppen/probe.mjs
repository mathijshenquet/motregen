// Probe: tabelkoppen + zonrij per viewport/thema. Gebruik (vanuit web/, preview op 4362):
//   cp ../.dev/tracks/u23-tabelkoppen-als-modeknoppen/probe.mjs tmp/ && node tmp/probe.mjs <label>
import { chromium, devices } from '@playwright/test'
import { mkdirSync } from 'node:fs'

const label = process.argv[2] ?? 'probe'
const out = `tmp/shots/${label}`
mkdirSync(out, { recursive: true })
const base = 'http://127.0.0.1:4362'
const fixed = Date.parse('2026-08-28T14:55:00Z') + 3 * 60_000
const viewports = {
  desktop: { ...devices['Desktop Chrome'] },
  pixel5: { ...devices['Pixel 5'] },
  w320: { ...devices['Pixel 5'], viewport: { width: 320, height: 640 } },
}

const browser = await chromium.launch({ args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader'] })
for (const [name, device] of Object.entries(viewports)) {
  for (const theme of ['light', 'dark']) {
    const context = await browser.newContext({ ...device, colorScheme: theme })
    const page = await context.newPage()
    await page.addInitScript((t) => localStorage.setItem('motregen-theme', t), theme)
    await page.clock.setFixedTime(fixed)
    await page.goto(base + '/')
    await page.locator('.map-splash.ready').waitFor({ state: 'attached' })
    await page.locator('.temperature-cell').first().waitFor()
    await page.waitForTimeout(1200)
    const table = page.locator('.forecast-panel table')
    const widths = await page.evaluate(() => [...document.querySelectorAll('.forecast-panel thead th')].map((th) => `${th.textContent?.trim() || th.getAttribute('aria-label')}:${Math.round(th.getBoundingClientRect().width)}`).join(' '))
    const scroll = await page.evaluate(() => { const s = document.querySelector('.table-scroll'); return s ? `${s.scrollWidth}/${s.clientWidth}` : '' })
    console.log(name, theme, widths, 'scroll', scroll)
    const top = () => page.evaluate(() => { const t = document.querySelector('.forecast-panel table'); if (t) { t.style.scrollMarginTop = (innerWidth < 960 ? document.querySelector('.scrubber').getBoundingClientRect().height + 8 : 120) + 'px'; t.scrollIntoView({ block: 'start' }) } })
    await top()
    await page.waitForTimeout(300)
    await page.screenshot({ path: `${out}/${name}-${theme}-tabel.png` })
    const pin = page.locator('.temperature-focus')
    if (await pin.count()) {
      await pin.click()
      await page.mouse.move(2, 2)
      await pin.blur()
      await top()
      await page.waitForTimeout(500)
      await page.screenshot({ path: `${out}/${name}-${theme}-gevoel-gepind.png` })
    }
    await context.close()
  }
}
await browser.close()
