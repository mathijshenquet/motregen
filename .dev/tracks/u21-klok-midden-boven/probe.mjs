// Probe: overlay-boxes + screenshots per viewport/thema. Gebruik: node tmp/probe.mjs <label>
import { chromium, devices } from '@playwright/test'
import { mkdirSync } from 'node:fs'

const label = process.argv[2] ?? 'probe'
const only = process.argv[3]
const out = `tmp/shots/${label}`
mkdirSync(out, { recursive: true })
const base = 'http://127.0.0.1:4358'
const fixed = Date.parse('2026-08-28T14:55:00Z') + 3 * 60_000
const viewports = {
  desktop: { ...devices['Desktop Chrome'] },
  desktop960: { ...devices['Desktop Chrome'], viewport: { width: 1000, height: 700 } },
  pixel5: { ...devices['Pixel 5'] },
  w320: { ...devices['Pixel 5'], viewport: { width: 320, height: 640 } },
}
const selectors = { search: '.search-box', results: '.search-results', pill: '.map-clock', theme: '.mobile-map-theme', zoom: '.maplibregl-ctrl-top-right', brand: '.map-brand', uv: '.sidebar-uv-chip', map: '.map-shell' }

const browser = await chromium.launch({ args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader'] })
for (const [name, device] of Object.entries(viewports)) {
  if (only && !only.split(',').includes(name)) continue
  for (const theme of ['light', 'dark']) {
    const context = await browser.newContext({ ...device, colorScheme: theme })
    const page = await context.newPage()
    await page.addInitScript((t) => localStorage.setItem('motregen-theme', t), theme)
    await page.clock.setFixedTime(fixed)
    await page.goto(base + '/' + (process.env.PROBE_QUERY ?? ''))
    await page.locator('.map-splash.ready').waitFor({ state: 'attached' })
    await page.waitForTimeout(1500)
    const boxes = async () => {
      const result = {}
      for (const [key, selector] of Object.entries(selectors)) {
        const locator = page.locator(selector).first()
        if (await locator.count() && await locator.isVisible()) {
          const box = await locator.boundingBox()
          result[key] = box && [box.x, box.y, box.width, box.height].map(Math.round).join(',')
        }
      }
      result.insetTop = await page.locator('.map').getAttribute('data-inset-top')
      return result
    }
    console.log(name, theme, 'rust', JSON.stringify(await boxes()))
    await page.screenshot({ path: `${out}/${name}-${theme}-rust.png` })
    await page.locator('.search-field').click()
    await page.waitForTimeout(400)
    console.log(name, theme, 'open', JSON.stringify(await boxes()))
    await page.screenshot({ path: `${out}/${name}-${theme}-zoek-open.png` })
    await page.keyboard.press('Escape')
    await page.locator('.search-field').blur()
    await page.locator('.scrub-surface').click({ position: { x: 30, y: 60 } })
    await page.waitForTimeout(400)
    console.log(name, theme, 'kaarttijd', JSON.stringify(await boxes()))
    await page.screenshot({ path: `${out}/${name}-${theme}-kaarttijd.png` })
    const surface = (await page.locator('.scrub-surface').boundingBox())
    await page.locator('.scrub-surface').click({ position: { x: surface.width - 12, y: 60 } })
    await page.waitForTimeout(400)
    console.log(name, theme, 'model', JSON.stringify(await boxes()))
    await page.screenshot({ path: `${out}/${name}-${theme}-model.png` })
    await page.locator('.freshness-trigger').click()
    await page.waitForTimeout(300)
    await page.screenshot({ path: `${out}/${name}-${theme}-paneel.png` })
    await page.keyboard.press('Escape')
    await context.close()
  }
}
await browser.close()
