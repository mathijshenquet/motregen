// U62: opent de dataversheid-dialoog vanzelf bij het laden? Probeert een paar adressen en rig-stappen.
import { chromium, devices } from '@playwright/test'
const [baseURL = 'http://127.0.0.1:4320'] = process.argv.slice(2)
const browser = await chromium.launch({ args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader'] })
for (const address of ['/', '/weer', '/weer?dev', '/weer#t=+14u', '/weer?dev#t=+14u']) {
  const page = await (await browser.newContext({ ...devices['Pixel 5'], viewport: { width: 390, height: 844 } })).newPage()
  await page.goto(`${baseURL}${address}`)
  await page.locator('.map-splash.ready').waitFor({ state: 'attached', timeout: 60_000 })
  await page.waitForTimeout(3_000)
  const afterLoad = await page.locator('.freshness-dialog[open]').count()
  const playing = await page.locator('.scrub-surface').getAttribute('data-playing')
  if (playing !== null) await page.locator('.scrub-surface').press(' ')
  await page.waitForTimeout(500)
  const afterPause = await page.locator('.freshness-dialog[open]').count()
  console.log(`${address}: dialoog open na laden ${afterLoad}, speelde ${playing !== null}, na pauze-toets ${afterPause}`)
  await page.close()
}
await browser.close()
