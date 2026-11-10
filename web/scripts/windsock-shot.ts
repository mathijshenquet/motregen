import { firefox } from '@playwright/test'

// U111: telefoonbeeld (402×844, DPR 3) van Wind met stilstaande zakken (reducedMotion, gepauzeerd), voor
// voor/na-vergelijkingen van de zakkenlaag. Donker = een nachtuur (het kaartthema volgt de kaarttijd): `--query=t=%2B12u` (twaalf uur verder). Met --zakken alleen de zakkencanvas (doorzichtig) i.p.v. het scherm.
//
// usage: xvfb-run -a pnpm exec tsx scripts/windsock-shot.ts ORIGIN UIT.png [--theme=licht|donker] [--query=a=b&c=d] [--zakken]

const args = process.argv.slice(2)
const [origin, output] = args.filter((arg) => !arg.startsWith('--'))
if (!origin || !output) throw new Error('usage: pnpm exec tsx scripts/windsock-shot.ts ORIGIN UIT.png [--theme=…] [--query=…] [--zakken]')
const option = (name: string) => args.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3)
const theme = option('theme') ?? 'licht'

const browser = await firefox.launch({
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
const context = await browser.newContext({
  viewport: { width: 402, height: 844 }, deviceScaleFactor: 3, hasTouch: true, reducedMotion: 'reduce',
  colorScheme: theme === 'donker' ? 'dark' : 'light', timezoneId: 'Europe/Amsterdam',
})
const page = await context.newPage()
const url = new URL(`/wind?dev&${option('query') ?? ''}`, origin)
await page.goto(url.href)
await page.locator('details.dev-panel').evaluate((panel) => panel.removeAttribute('open')).catch(() => {})
await page.waitForFunction(() => Number((document.querySelector('.map-overlay-windsocks') as HTMLCanvasElement | null)?.dataset.socks?.split('|')[0]) > 0, undefined, { timeout: 120_000 })
// Met `t=` in de query start de app al gepauzeerd; anders pauzeren zoals een gebruiker.
await page.waitForTimeout(1_000)
if (!await page.locator('.clock-play').isVisible()) await page.locator('.freshness-trigger').press(' ')
await page.locator('.clock-play').waitFor({ state: 'visible' })
await page.locator('.freshness-close').click({ timeout: 1_000 }).catch(() => {})
await page.waitForTimeout(2_000)
if (args.includes('--zakken')) {
  const data = await page.evaluate(() => (document.querySelector('.map-overlay-windsocks') as HTMLCanvasElement).toDataURL('image/png'))
  const { writeFileSync } = await import('node:fs')
  writeFileSync(output, Buffer.from(data.split(',')[1]!, 'base64'))
} else await page.screenshot({ path: output })
await browser.close()
