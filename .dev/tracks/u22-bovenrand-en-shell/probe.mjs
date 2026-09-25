// Probe (U22): overlay-boxes + screenshots per viewport/thema. Gebruik: PROBE_BASE=http://127.0.0.1:4361 node tmp/probe.mjs <label> [viewports]
import { chromium, devices } from '@playwright/test'
import { mkdirSync } from 'node:fs'

const label = process.argv[2] ?? 'probe'
const only = process.argv[3]
const out = `tmp/shots/${label}`
mkdirSync(out, { recursive: true })
const base = process.env.PROBE_BASE ?? 'http://127.0.0.1:4361'
const fixed = Date.parse('2026-08-28T14:55:00Z') + 3 * 60_000
const viewports = {
  desktop: { ...devices['Desktop Chrome'] },
  desktop1000: { ...devices['Desktop Chrome'], viewport: { width: 1000, height: 700 } },
  pixel5: { ...devices['Pixel 5'] },
  w320: { ...devices['Pixel 5'], viewport: { width: 320, height: 640 } },
}
const selectors = { search: '.search-box', clock: '.map-clock', badge: '.freshness-badge', theme: '.mobile-map-theme', zoom: '.maplibregl-ctrl-top-right', brand: '.map-brand', uv: '.sidebar-uv-chip', nav: '.sidebar-nav', map: '.map-shell' }

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
    const shot = async (step) => {
      console.log(name, theme, step, JSON.stringify(await boxes()))
      await page.screenshot({ path: `${out}/${name}-${theme}-${step}.png` })
    }
    await shot('rust')
    await page.locator('.search-field').click()
    await page.waitForTimeout(400)
    await shot('zoek-open')
    await page.keyboard.press('Escape')
    await page.locator('.search-field').blur()
    const surface = await page.locator('.scrub-surface').boundingBox()
    await page.locator('.scrub-surface').click({ position: { x: 30, y: surface.height * 0.75 } })
    await page.waitForTimeout(400)
    await shot('observatie')
    await page.locator('.scrub-surface').click({ position: { x: surface.width - 12, y: surface.height * 0.75 } })
    await page.waitForTimeout(400)
    await shot('trend')
    await page.locator('.freshness-trigger').click()
    await page.waitForTimeout(300)
    await shot('versheid')
    await page.keyboard.press('Escape')
    const about = page.locator('.map-brand')
    await about.press('Enter')
    await page.waitForTimeout(400)
    await shot('modal')
    await page.keyboard.press('Escape')
    await context.close()
  }
}
await browser.close()
