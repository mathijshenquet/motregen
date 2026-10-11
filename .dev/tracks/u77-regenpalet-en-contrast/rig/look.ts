// U77: één schermbeeld van de app zoals hij is, om zelf te kijken. Gebruik (vanuit web/, rig gekopieerd naar tmp/u77/):
//   pnpm exec tsx tmp/u77/look.ts <baseURL> <uit.png> <390|1280> <dag|nacht-vast> <uren vooruit> [lng,lat,zoom] [sleutel=waarde,...]
// U77_TIME=2026-10-10T1430 zet een vaste kaarttijd (Amsterdam) in plaats van uren vooruit. De sleutel=waarde-paren
// gaan als `motregen-<sleutel>` in localStorage (bv. dev-regenpalet=blauw-grijs-rood).
import { chromium, devices } from '@playwright/test'

const [baseURL = 'http://127.0.0.1:4320', output = 'look.png', device = '1280', scene = 'dag', hoursAhead = '0', view = '', settings = ''] = process.argv.slice(2)

const target = new Date(Date.now() + Number(hoursAhead) * 3_600_000)
const amsterdam = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Amsterdam', dateStyle: 'short', timeStyle: 'short' }).format(target)
const timeParameter = process.env.U77_TIME ?? amsterdam.replace(' ', 'T').replace(':', '')

const browser = await chromium.launch({ args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader'] })
const mobile = device === '390'
const context = await browser.newContext(mobile ? { ...devices['Pixel 5'], viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 } : { viewport: { width: 1280, height: 800 } })
await context.addInitScript(([storedView, fixedNight, storedSettings]) => {
  if (storedView) {
    const [lng, lat, zoom] = storedView.split(',').map(Number)
    localStorage.setItem('motregen-map-view', JSON.stringify({ lng, lat, zoom }))
  }
  // De kaart volgt de kaarttijd zolang Expressief aan staat; een nachtbeeld op een dagtijd vraagt om een vast
  // donker thema met Expressief uit.
  if (fixedNight) { localStorage.setItem('motregen-theme', 'dark'); localStorage.setItem('motregen-expressive', 'off') }
  for (const pair of storedSettings.split(',').filter(Boolean)) {
    const [key, value] = pair.split('=')
    localStorage.setItem(`motregen-${key}`, value!)
  }
  addEventListener('DOMContentLoaded', () => { const style = document.createElement('style'); style.textContent = '.dev-panel { opacity: 0 !important; pointer-events: none !important; }'; document.head.append(style) })
}, [view, scene === 'nacht-vast' ? 'ja' : '', settings])
const page = await context.newPage()
await page.goto(`${baseURL}/?dev#t=${timeParameter}`)
await page.locator('.map-splash.ready').waitFor({ state: 'attached', timeout: 60_000 })
await page.waitForTimeout(2_500)
if (await page.locator('.freshness-dialog[open]').count()) {
  await page.keyboard.press('Escape')
  await page.locator('.freshness-dialog[open]').waitFor({ state: 'detached', timeout: 5_000 }).catch(() => undefined)
}
await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
await page.waitForTimeout(8_000)
const map = page.locator('[data-rain-blend]')
console.log(`${output} · ${timeParameter} · bronnen ${await page.locator('[data-rain-sources]').getAttribute('data-rain-sources') ?? '?'} · menging ${await map.getAttribute('data-rain-blend')} · dekking ${await map.getAttribute('data-rain-opacity')}`)
await page.screenshot({ path: output })
await browser.close()
