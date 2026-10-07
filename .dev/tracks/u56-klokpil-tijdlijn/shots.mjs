// Stills van de klokpil en het uitgerolde paneel (U56), desktop + Pixel 5, licht + donker.
// Gebruik (vanuit web/, preview draait): node ../.dev/tracks/u56-klokpil-tijdlijn/shots.mjs http://127.0.0.1:4345/ <uitvoermap>
import { mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'

const { chromium, devices } = createRequire(resolve('package.json'))('@playwright/test')
const [baseUrl = 'http://127.0.0.1:4345/', outputDirectory = 'tmp/u56-shots'] = process.argv.slice(2)
mkdirSync(outputDirectory, { recursive: true })

const profiles = [
  { name: 'desktop', context: { viewport: { width: 1440, height: 900 } } },
  { name: 'pixel5', context: { ...devices['Pixel 5'] } },
]

const browser = await chromium.launch({ args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader'] })
for (const profile of profiles) {
  for (const theme of ['light', 'dark']) {
    const context = await browser.newContext({ ...profile.context, colorScheme: theme })
    // Het thema is een opgeslagen keuze, geen prefers-color-scheme.
    await context.addInitScript((choice) => localStorage.setItem('motregen-theme', choice), theme)
    const page = await context.newPage()
    await page.goto(baseUrl)
    await page.locator('.map-splash.ready').waitFor({ state: 'attached', timeout: 60_000 })
    const scrubber = page.locator('.scrub-surface')
    await scrubber.waitFor()
    await page.waitForFunction(() => /window|complete/.test(document.querySelector('.scrub-surface')?.getAttribute('data-load-stage') ?? ''), undefined, { timeout: 60_000 })
    if (await scrubber.getAttribute('data-playing') !== null) await scrubber.press(' ')
    const still = (label) => page.screenshot({ path: `${outputDirectory}/${profile.name}-${label}-${theme}.png` })
    const clock = page.locator('.freshness-trigger')

    await still('klok')
    // Sleep met ingedrukte muis/vinger: 45 px naar rechts = anderhalf uur later.
    const box = await clock.boundingBox()
    const centerX = box.x + box.width / 2
    const centerY = box.y + box.height / 2
    await page.mouse.move(centerX, centerY)
    await page.mouse.down()
    await page.mouse.move(centerX + 45, centerY, { steps: 8 })
    await still('klok-slepen')
    await page.mouse.up()

    await clock.click()
    const dialog = page.locator('.freshness-dialog')
    await dialog.waitFor()
    await dialog.evaluate((element) => Promise.all(element.getAnimations().map((animation) => animation.finished)))
    await still('strook')
    await dialog.screenshot({ path: `${outputDirectory}/${profile.name}-paneel-${theme}.png` })
    await context.close()
  }
}
await browser.close()
