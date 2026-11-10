import { chromium, firefox } from '@playwright/test'

// U111 ronde 4: zet `?dev&camera=<lon>,<lat>,<zoom>` de kaart vast, ook met een verleende locatie en een opgeslagen
// kaartstand, en schrijft hij niets naar de opslag? Opent de pagina twee keer in dezelfde context: eerst zonder knop
// (om een stand en een locatie op te slaan, met een geolocatie elders), dan met de knop. Drukt per browser de camera en
// de gewijzigde opslagsleutels af.
//
// usage: xvfb-run -a pnpm exec tsx scripts/camera-check.ts ORIGIN [--camera=5.29,52.13,7] [--browser=firefox|chromium]

const args = process.argv.slice(2)
const origin = args.find((arg) => !arg.startsWith('--'))
if (!origin) throw new Error('usage: pnpm exec tsx scripts/camera-check.ts ORIGIN [--camera=…] [--browser=…]')
const option = (name: string) => args.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3)
const camera = option('camera') ?? '5.29,52.13,7'
const browserName = option('browser') ?? 'firefox'

const browser = browserName === 'firefox'
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
  viewport: { width: 402, height: 844 }, deviceScaleFactor: 3, hasTouch: true, timezoneId: 'Europe/Amsterdam',
  // Groningen: een fix ver van de gevraagde camera.
  geolocation: { latitude: 53.22, longitude: 6.57 }, permissions: ['geolocation'],
})
const page = await context.newPage()
const cameraNow = () => page.evaluate(() => (window as unknown as { __motregenCamera: () => { lng: number; lat: number; zoom: number } | undefined }).__motregenCamera())
const storage = () => page.evaluate(() => Object.fromEntries(Object.keys(localStorage).map((key) => [key, localStorage.getItem(key)])))

await page.goto(new URL('/wind', origin).href)
await page.locator('[data-playing]').waitFor({ state: 'attached', timeout: 120_000 })
await page.waitForTimeout(3_000)
const before = await storage()
console.log('zonder knop:', JSON.stringify(await cameraNow()))

await page.goto(new URL(`/wind?dev&camera=${camera}`, origin).href)
await page.locator('[data-playing]').waitFor({ state: 'attached', timeout: 120_000 })
await page.waitForTimeout(4_000)
const after = await storage()
console.log(`met camera=${camera}:`, JSON.stringify(await cameraNow()))
const changed = Object.keys({ ...before, ...after }).filter((key) => before[key] !== after[key])
console.log('opslag gewijzigd met de knop:', changed.length ? changed.join(', ') : 'niets')
await browser.close()
