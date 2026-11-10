import { chromium, firefox, type Browser } from '@playwright/test'

// U111: tekent de zakkenlaag met vuile rechthoeken hetzelfde als met een volle canvas? Met reducedMotion staan de
// zakken stil (geen wuiven), dus dezelfde camera en hetzelfde veld geven dezelfde zakken. Na een reeks pannen
// (elke tekening wist alleen rechthoeken) gaan de pixels naast die van een gedwongen volle hertekening.
//
// usage: xvfb-run -a pnpm exec tsx scripts/windsock-dirty-check.ts ORIGIN [--browser=firefox|chromium] [--theme=licht|donker] [--sabotage]

const args = process.argv.slice(2)
const origin = args.find((arg) => !arg.startsWith('--'))
if (!origin) throw new Error('usage: pnpm exec tsx scripts/windsock-dirty-check.ts ORIGIN [--browser=…] [--theme=…]')
const option = (name: string) => args.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3)
const browserName = option('browser') ?? 'firefox'
const theme = option('theme') ?? 'licht'
// Negatieve controle: vóór elke pan de oude rechthoeken vergeten; dan moet de check falen.
const sabotage = args.includes('--sabotage')

const browser: Browser = browserName === 'firefox'
  ? await firefox.launch({
    headless: !process.env.DISPLAY,
    firefoxUserPrefs: { 'webgl.force-enabled': true, 'gfx.webrender.software': true },
    env: {
      ...process.env,
      LIBGL_ALWAYS_SOFTWARE: '1',
      ...process.env.MOTREGEN_FIREFOX_MESA ? {
        LIBGL_DRIVERS_PATH: `${process.env.MOTREGEN_FIREFOX_MESA}/lib/dri`,
        __EGL_VENDOR_LIBRARY_FILENAMES: `${process.env.MOTREGEN_FIREFOX_MESA}/share/glvnd/egl_vendor.d/50_mesa.json`,
        LD_LIBRARY_PATH: `${process.env.MOTREGEN_FIREFOX_MESA}/lib:${process.env.MOTREGEN_FIREFOX_GL}/lib`,
      } : {},
    } as Record<string, string>,
  })
  : await chromium.launch({ headless: true, args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader'] })
const context = await browser.newContext({
  viewport: { width: 402, height: 844 }, deviceScaleFactor: 3, hasTouch: true, reducedMotion: 'reduce',
  colorScheme: theme === 'donker' ? 'dark' : 'light', timezoneId: 'Europe/Amsterdam',
})
const page = await context.newPage()
await page.goto(new URL('/wind?dev', origin).href)
await page.locator('details.dev-panel').evaluate((panel) => panel.removeAttribute('open')).catch(() => {})
await page.waitForFunction(() => Number((document.querySelector('.map-overlay-windsocks') as HTMLCanvasElement | null)?.dataset.socks?.split('|')[0]) > 0, undefined, { timeout: 120_000 })
// Pauzeren, zodat het veld vaststaat.
await page.locator('.freshness-trigger').press(' ')
await page.locator('.clock-play').waitFor({ state: 'visible' })
await page.waitForTimeout(1_000)

// In de pagina, als tekst (tsx voegt anders `__name(…)` in): een tekening na het pannen (vuile rechthoeken) naast
// een gedwongen volle.
const compare = `(() => {
  const layer = window.__motregenWindsocks()
  const read = () => layer.canvas.getContext('2d').getImageData(0, 0, layer.canvas.width, layer.canvas.height).data
  const dirty = read()
  layer.drawnRects = undefined
  layer.draw()
  const full = read()
  let different = 0, maxDelta = 0, inked = 0
  for (let index = 0; index < full.length; index++) {
    const delta = Math.abs(full[index] - dirty[index])
    if (delta) { different++; maxDelta = Math.max(maxDelta, delta) }
    if (index % 4 === 3 && full[index]) inked++
  }
  return { different, maxDelta, inked, socks: layer.canvas.dataset.socks }
})()`

let failures = 0
const camera = await page.evaluate(() => (window as unknown as { __motregenCamera: () => { lng: number; lat: number; zoom: number } }).__motregenCamera())
for (const [step, [dx, dy]] of [[0.15, 0], [0.3, 0.1], [0.1, -0.2], [-0.25, 0.05], [0, 0]].entries()) {
  if (sabotage) await page.evaluate('window.__motregenWindsocks().drawnRects = []')
  // `free`: zonder kaartbegrenzing, anders staat het telefoonbeeld op heel Nederland vast.
  await page.evaluate(([lng, lat, zoom]) => (window as unknown as { __motregenJumpTo: (lng: number, lat: number, zoom: number, free: boolean) => void }).__motregenJumpTo(lng, lat, zoom, true), [camera.lng + dx, camera.lat + dy, camera.zoom + 0.5] as const)
  await page.waitForTimeout(800)
  const result = await page.evaluate(compare) as { different: number; maxDelta: number; inked: number; socks: string }
  const moved = await page.evaluate(() => (window as unknown as { __motregenCamera: () => { lng: number; lat: number } }).__motregenCamera())
  console.log(`stap ${step}: kaart ${moved.lng.toFixed(2)}, ${moved.lat.toFixed(2)}; zakken ${result.socks}, inktpixels ${result.inked}, verschillende kanalen ${result.different} (max Δ ${result.maxDelta})`)
  if (result.different || !result.inked) failures++
}
await browser.close()
console.log(failures ? `MISLUKT: ${failures} stappen` : 'GELIJK')
process.exit(failures ? 1 : 0)
