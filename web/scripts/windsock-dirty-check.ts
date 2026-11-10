import { chromium, firefox, type Browser } from '@playwright/test'

// U111: tekent de zakkenlaag met vuile rechthoeken hetzelfde als met een volle canvas? Met reducedMotion staan de
// zakken stil (geen wuiven), dus dezelfde camera en hetzelfde veld geven dezelfde zakken. Na een reeks pannen
// (elke tekening wist alleen rechthoeken) gaan de pixels naast die van een gedwongen volle hertekening.
//
// Met --los (`?dev&zakcanvas=los`): de losse zakcanvassen, op hun plek samengelegd, naast een volle tekening op de
// grote canvas van dezelfde laag. Skia antialiast de omtrek op een kleine canvas net anders (~0,1 % van de
// inktpixels, voorvermenigvuldigd Δ ≤ ~50 van 255); daarom geldt daar: verschil alleen binnen een zak, hooguit
// 0,5 % van de inktpixels met Δ > 2 en nergens Δ > 64. U111_CROPS=<map> schrijft een uitvergrote uitsnede van het
// eerste verschil.
//
// usage: xvfb-run -a pnpm exec tsx scripts/windsock-dirty-check.ts ORIGIN [--browser=firefox|chromium] [--theme=licht|donker] [--sabotage] [--los]

const args = process.argv.slice(2)
const origin = args.find((arg) => !arg.startsWith('--'))
if (!origin) throw new Error('usage: pnpm exec tsx scripts/windsock-dirty-check.ts ORIGIN [--browser=…] [--theme=…]')
const option = (name: string) => args.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3)
const browserName = option('browser') ?? 'firefox'
const theme = option('theme') ?? 'licht'
// Negatieve controle: vóór elke pan de oude rechthoeken vergeten; dan moet de check falen.
const sabotage = args.includes('--sabotage')
const separate = args.includes('--los')

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
await page.goto(new URL(separate ? '/wind?dev&zakcanvas=los' : '/wind?dev', origin).href)
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

// --los: de zakcanvassen samengelegd (gehele canvaspixels, dus zonder herbemonstering), dan dezelfde laag één keer op
// zijn grote canvas laten tekenen en terugzetten. --sabotage verschuift één zakcanvas een pixel.
const compareSeparate = `(() => {
  const layer = window.__motregenWindsocks()
  const ratio = window.devicePixelRatio
  const width = Math.round(layer.width * ratio), height = Math.round(layer.height * ratio)
  const composed = document.createElement('canvas')
  composed.width = width
  composed.height = height
  const context = composed.getContext('2d')
  const canvases = [...layer.surface.querySelectorAll('canvas')].filter((canvas) => canvas.style.visibility !== 'hidden')
  canvases.forEach((canvas, index) => {
    const shift = ${sabotage ? 1 : 0} && index === 0 ? 1 : 0
    context.drawImage(canvas, Math.round(parseFloat(canvas.style.left) * ratio) + shift, Math.round(parseFloat(canvas.style.top) * ratio))
  })
  const separate = context.getImageData(0, 0, width, height).data
  const holder = layer.surface
  layer.surface = layer.canvas
  layer.draw()
  const full = layer.canvas.getContext('2d').getImageData(0, 0, layer.canvas.width, layer.canvas.height).data
  layer.surface = holder
  layer.canvas.width = layer.canvas.height = 0
  layer.draw()
  let different = 0, maxDelta = 0, inked = 0
  for (let index = 0; index < full.length; index++) {
    const delta = Math.abs(full[index] - separate[index])
    if (delta) { different++; maxDelta = Math.max(maxDelta, delta) }
    if (index % 4 === 3 && full[index]) inked++
  }
  const boxes = canvases.map((canvas) => { const x = Math.round(parseFloat(canvas.style.left) * ratio), y = Math.round(parseFloat(canvas.style.top) * ratio); return [x, y, x + canvas.width, y + canvas.height] })
  const where = { overlap: 0, edge: 0, inside: 0, outside: 0, maxPre: 0, visible: 0 }
  for (let index = 0; index < full.length; index += 4) {
    if (full[index] === separate[index] && full[index + 1] === separate[index + 1] && full[index + 2] === separate[index + 2] && full[index + 3] === separate[index + 3]) continue
    const preDelta = Math.max(...[0, 1, 2].map((channel) => Math.abs(full[index + channel] * full[index + 3] - separate[index + channel] * separate[index + 3]) / 255), Math.abs(full[index + 3] - separate[index + 3]))
    where.maxPre = Math.max(where.maxPre, preDelta)
    if (preDelta > 2) where.visible++
    const px = (index / 4) % width, py = Math.floor(index / 4 / width)
    const covering = boxes.filter(([x0, y0, x1, y1]) => px >= x0 && px < x1 && py >= y0 && py < y1)
    if (covering.length > 1) where.overlap++
    else if (!covering.length) where.outside++
    else if (covering.some(([x0, y0, x1, y1]) => px - x0 < 3 || x1 - px <= 3 || py - y0 < 3 || y1 - py <= 3)) where.edge++
    else where.inside++
  }
  let first = -1
  for (let index = 0; index < full.length && first < 0; index += 4) if (Math.abs(full[index + 3] - separate[index + 3]) > 8) first = index / 4
  if (first >= 0) {
    const fx = first % width, fy = Math.floor(first / width), size = 60
    const crop = (data) => {
      const out = document.createElement('canvas')
      out.width = out.height = size * 4
      const cropContext = out.getContext('2d')
      cropContext.fillStyle = 'white'
      cropContext.fillRect(0, 0, out.width, out.height)
      const image = new ImageData(new Uint8ClampedArray(data), width, height)
      const whole = document.createElement('canvas')
      whole.width = width
      whole.height = height
      whole.getContext('2d').putImageData(image, 0, 0)
      cropContext.imageSmoothingEnabled = false
      cropContext.drawImage(whole, fx - size / 2, fy - size / 2, size, size, 0, 0, size * 4, size * 4)
      return out.toDataURL()
    }
    where.crops = [crop(full), crop(separate)]
  }
  const pixels = canvases.reduce((sum, canvas) => sum + canvas.width * canvas.height, 0)
  const crops = where.crops
  delete where.crops
  const ok = !where.overlap && !where.edge && !where.outside && where.visible <= inked * 0.005 && where.maxPre <= 64
  const note = 'zichtbaar anders (Δ>2) ' + where.visible + ' px, max Δ ' + Math.round(where.maxPre) + ', buiten een zak ' + (where.overlap + where.edge + where.outside) + ' px'
  return { crops, ok, different, maxDelta, inked, socks: layer.canvas.dataset.socks + ', ' + canvases.length + ' canvassen, ' + (pixels / (width * height) * 100).toFixed(1) + ' % van het scherm; ' + note }
})()`

let failures = 0
const camera = await page.evaluate(() => (window as unknown as { __motregenCamera: () => { lng: number; lat: number; zoom: number } }).__motregenCamera())
for (const [step, [dx, dy]] of [[0.15, 0], [0.3, 0.1], [0.1, -0.2], [-0.25, 0.05], [0, 0]].entries()) {
  if (sabotage && !separate) await page.evaluate('window.__motregenWindsocks().drawnRects = []')
  // `free`: zonder kaartbegrenzing, anders staat het telefoonbeeld op heel Nederland vast.
  await page.evaluate(([lng, lat, zoom]) => (window as unknown as { __motregenJumpTo: (lng: number, lat: number, zoom: number, free: boolean) => void }).__motregenJumpTo(lng, lat, zoom, true), [camera.lng + dx, camera.lat + dy, camera.zoom + 0.5] as const)
  await page.waitForTimeout(800)
  const result = await page.evaluate(separate ? compareSeparate : compare) as { different: number; maxDelta: number; inked: number; socks: string; crops?: string[]; ok?: boolean }
  if (result.crops && process.env.U111_CROPS) {
    const { writeFileSync } = await import('node:fs')
    result.crops.forEach((url, index) => writeFileSync(`${process.env.U111_CROPS}/stap${step}-${index ? 'los' : 'vol'}.png`, Buffer.from(url.split(',')[1]!, 'base64')))
  }
  const moved = await page.evaluate(() => (window as unknown as { __motregenCamera: () => { lng: number; lat: number } }).__motregenCamera())
  console.log(`stap ${step}: kaart ${moved.lng.toFixed(2)}, ${moved.lat.toFixed(2)}; zakken ${result.socks}, inktpixels ${result.inked}, verschillende kanalen ${result.different} (max Δ ${result.maxDelta})`)
  const passed = result.ok ?? result.different === 0
  if (!passed || !result.inked) failures++
}
await browser.close()
console.log(failures ? `MISLUKT: ${failures} stappen` : 'GELIJK')
process.exit(failures ? 1 : 0)
