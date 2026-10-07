// Echte touch-events (CDP) op de Pixel 5-emulatie (U56): horizontaal vegen over de klokpil scrubt
// zonder het paneel te openen, een tik opent het. De e2e sleept met de muis en dekt dit niet.
// Gebruik (vanuit web/, preview draait): node ../.dev/tracks/u56-klokpil-tijdlijn/touch-check.mjs http://127.0.0.1:4345/
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'

const { chromium, devices } = createRequire(resolve('package.json'))('@playwright/test')
const baseUrl = process.argv[2] ?? 'http://127.0.0.1:4345/'
const browser = await chromium.launch({ args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader'] })
const context = await browser.newContext({ ...devices['Pixel 5'] })
const page = await context.newPage()
await page.goto(baseUrl)
await page.locator('.map-splash.ready').waitFor({ state: 'attached', timeout: 60_000 })
await page.waitForFunction(() => /window|complete/.test(document.querySelector('.scrub-surface')?.getAttribute('data-load-stage') ?? ''), undefined, { timeout: 60_000 })
const scrubber = page.locator('.scrub-surface')
if (await scrubber.getAttribute('data-playing') !== null) await scrubber.press(' ')
const cursor = async () => Number(await scrubber.getAttribute('aria-valuenow'))
const dialogOpen = () => page.locator('.freshness-dialog').evaluate((dialog) => dialog.open)

const session = await context.newCDPSession(page)
const touch = (type, x, y) => session.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] })
const box = await page.locator('.freshness-trigger').boundingBox()
const startX = box.x + box.width / 2
const y = box.y + box.height / 2

const before = await cursor()
await touch('touchStart', startX, y)
for (let step = 1; step <= 8; step++) await touch('touchMove', startX + step * 5, y)
await touch('touchEnd')
await page.waitForTimeout(200)
const afterSwipe = await cursor()
assert.ok(afterSwipe > before, `vegen naar rechts hoort later te zijn: ${before} → ${afterSwipe}`)
assert.equal(await dialogOpen(), false, 'vegen opent het paneel niet')

await touch('touchStart', startX, y)
await touch('touchEnd')
await page.waitForTimeout(600)
assert.equal(await dialogOpen(), true, 'een tik opent het paneel')
assert.equal(await cursor(), afterSwipe, 'een tik verzet de tijd niet')
console.log(`touch ok: cursor ${before} → ${afterSwipe} na 40 px vegen; tik opent het paneel`)
await browser.close()
