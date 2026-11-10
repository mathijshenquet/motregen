import { chromium, firefox, type Browser } from '@playwright/test'

// U111: tekent de zakkenlaag met vuile rechthoeken hetzelfde als met een volle canvas? Met reducedMotion staan de
// zakken stil (geen wuiven), dus dezelfde camera en hetzelfde veld geven dezelfde zakken. Na een reeks pannen
// (elke tekening wist alleen rechthoeken) gaan de pixels naast die van een gedwongen volle hertekening.
//
// De referentie is steeds een volle tekening van dezelfde laag op zijn grote canvas langs het standaardpad (het gat
// rond de badge weggeveegd, U111 ronde 3). Getest wordt, naast elkaar te combineren:
// - --los (`?dev&zakcanvas=los`): de losse zakcanvassen, op hun plek samengelegd. Skia antialiast de omtrek op een
//   kleine canvas net anders (~0,1 % van de inktpixels): hooguit 0,5 % van de inktpixels met voorvermenigvuldigd
//   Δ > 2, nergens Δ > 64, niets buiten een zak.
// - --zakclip (`?dev&zakclip=aan`): het oude gat met clip(). Op de rand van het gat ander antialias (clip dekt elke
//   laag apart af, vegen het geheel één keer): pixels binnen 2 canvaspixels van die rand tellen apart. Een AA-clip
//   verschuift ook elders de randdekking een beetje (Skia tekent dan via de clipblitter), dus hier mag 1 % van de
//   inktpixels Δ > 2 hebben (gekozen na de eerste meting, 0,47–0,57 %; op 4× uitvergroot niet te zien).
// - --wuivend: reducedMotion uit en performance.now() bevroren tijdens getest en referentie (beide vers getekend),
//   zodat ook wuivende zakken meetellen.
// Zonder vlaggen: exact gelijk. U111_CROPS=<map> schrijft een uitvergrote uitsnede van het eerste duidelijke verschil.
//
// usage: xvfb-run -a pnpm exec tsx scripts/windsock-dirty-check.ts ORIGIN [--browser=firefox|chromium] [--theme=licht|donker] [--sabotage] [--los] [--zakclip] [--wuivend] [--query=a=b&c=d]

const args = process.argv.slice(2)
const origin = args.find((arg) => !arg.startsWith('--'))
if (!origin) throw new Error('usage: pnpm exec tsx scripts/windsock-dirty-check.ts ORIGIN [--browser=…] [--theme=…]')
const option = (name: string) => args.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3)
const browserName = option('browser') ?? 'firefox'
const theme = option('theme') ?? 'licht'
// Negatieve controle: vóór elke pan de oude rechthoeken vergeten; dan moet de check falen.
const sabotage = args.includes('--sabotage')
const separate = args.includes('--los')
const clip = args.includes('--zakclip')
const swaying = args.includes('--wuivend')

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
  viewport: { width: 402, height: 844 }, deviceScaleFactor: 3, hasTouch: true, reducedMotion: swaying ? 'no-preference' : 'reduce',
  colorScheme: theme === 'donker' ? 'dark' : 'light', timezoneId: 'Europe/Amsterdam',
})
const page = await context.newPage()
await page.goto(new URL(`/wind?dev${separate ? '&zakcanvas=los' : ''}${clip ? '&zakclip=aan' : ''}${option('query') ? `&${option('query')}` : ''}`, origin).href)
await page.locator('details.dev-panel').evaluate((panel) => panel.removeAttribute('open')).catch(() => {})
await page.waitForFunction(() => Number((document.querySelector('.map-overlay-windsocks') as HTMLCanvasElement | null)?.dataset.socks?.split('|')[0]) > 0, undefined, { timeout: 120_000 })
// Pauzeren, zodat het veld vaststaat.
await page.locator('.freshness-trigger').press(' ')
await page.locator('.clock-play').waitFor({ state: 'visible' })
await page.waitForTimeout(1_000)

// In de pagina, als tekst (tsx voegt anders `__name(…)` in). Getest: wat er na het pannen staat (vuile rechthoeken;
// met --los de zakcanvassen samengelegd op gehele canvaspixels, dus zonder herbemonstering). Referentie: dezelfde
// laag gedwongen vol op zijn grote canvas langs het standaardpad; daarna gaat de laag terug naar zijn eigen stand.
const compare = `(() => {
  const separate = ${separate}, tolerant = ${separate || clip}, loose = ${clip}, shift = ${sabotage && separate ? 1 : 0}
  const layer = window.__motregenWindsocks()
  if (${swaying}) {
    const frozen = performance.now()
    Object.defineProperty(performance, 'now', { value: () => frozen, configurable: true })
    // Geen tijd verstreken: de veren springen naar hun doel en de golffase blijft staan, in beide tekeningen.
    layer.drawnAt = frozen / 1000
    layer.drawnRects = undefined
    layer.draw()
  }
  const ratio = window.devicePixelRatio
  const width = Math.round(layer.width * ratio), height = Math.round(layer.height * ratio)
  const readMain = () => layer.canvas.getContext('2d').getImageData(0, 0, width, height).data
  const canvases = separate ? [...layer.surface.querySelectorAll('canvas')].filter((canvas) => canvas.style.visibility !== 'hidden') : []
  const boxes = canvases.map((canvas) => {
    const x = Math.round(parseFloat(canvas.style.left) * ratio), y = Math.round(parseFloat(canvas.style.top) * ratio)
    return [x, y, x + canvas.width, y + canvas.height]
  })
  let tested
  if (separate) {
    const composed = document.createElement('canvas')
    composed.width = width
    composed.height = height
    const context = composed.getContext('2d')
    canvases.forEach((canvas, index) => context.drawImage(canvas, boxes[index][0] + (index === 0 ? shift : 0), boxes[index][1]))
    tested = context.getImageData(0, 0, width, height).data
  } else tested = readMain()

  const holder = layer.surface, options = { ...layer.options }
  const rings = [], drawSock = layer.drawSock
  layer.drawSock = function (context, draw, ...rest) {
    rings.push([(draw.x + draw.badge.x) * ratio, (draw.y + draw.badge.y) * ratio, draw.badge.cutRadius * ratio])
    return drawSock.call(this, context, draw, ...rest)
  }
  layer.surface = layer.canvas
  layer.options.clipCut = false
  layer.drawnRects = undefined
  layer.draw()
  delete layer.drawSock
  const full = readMain()
  layer.surface = holder
  Object.assign(layer.options, options)
  if (separate) layer.canvas.width = layer.canvas.height = 0
  layer.draw()
  if (${swaying}) delete performance.now

  let different = 0, maxDelta = 0, inked = 0, visible = 0, maxPre = 0, outsideSock = 0, first = -1, ringEdge = 0, maxRing = 0
  for (let index = 0; index < full.length; index += 4) {
    if (full[index + 3]) inked++
    let pixelDifferent = false
    for (let channel = 0; channel < 4; channel++) {
      const delta = Math.abs(full[index + channel] - tested[index + channel])
      if (delta) { different++; maxDelta = Math.max(maxDelta, delta); pixelDifferent = true }
    }
    if (!pixelDifferent) continue
    const colourDelta = [0, 1, 2].map((channel) => Math.abs(full[index + channel] * full[index + 3] - tested[index + channel] * tested[index + 3]) / 255)
    const preDelta = Math.max(...colourDelta, Math.abs(full[index + 3] - tested[index + 3]))
    const px = (index / 4) % width + 0.5, py = Math.floor(index / 4 / width) + 0.5
    if (${clip} && rings.some(([cx, cy, radius]) => Math.abs(Math.hypot(px - cx, py - cy) - radius) <= 2)) {
      if (preDelta > 2) ringEdge++
      maxRing = Math.max(maxRing, preDelta)
      continue
    }
    maxPre = Math.max(maxPre, preDelta)
    if (preDelta > 2) visible++
    if (preDelta > ${Number(process.env.U111_CROP_MIN ?? 8)} && first < 0) first = index / 4
    if (separate && !boxes.some(([x0, y0, x1, y1]) => px >= x0 && px < x1 && py >= y0 && py < y1)) outsideSock++
  }
  const ok = tolerant ? visible <= inked * (loose ? 0.01 : 0.005) && maxPre <= 64 && !outsideSock : different === 0

  let crops
  if (first >= 0) {
    const fx = first % width, fy = Math.floor(first / width), size = 60
    const crop = (data) => {
      const whole = document.createElement('canvas')
      whole.width = width
      whole.height = height
      whole.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(data), width, height), 0, 0)
      const out = document.createElement('canvas')
      out.width = out.height = size * 4
      const cropContext = out.getContext('2d')
      cropContext.fillStyle = 'white'
      cropContext.fillRect(0, 0, out.width, out.height)
      cropContext.imageSmoothingEnabled = false
      cropContext.drawImage(whole, fx - size / 2, fy - size / 2, size, size, 0, 0, size * 4, size * 4)
      return out.toDataURL()
    }
    crops = [crop(full), crop(tested)]
  }
  const pixels = canvases.reduce((sum, canvas) => sum + canvas.width * canvas.height, 0)
  const socks = layer.canvas.dataset.socks + (separate ? ', ' + canvases.length + ' canvassen, ' + (pixels / (width * height) * 100).toFixed(1) + ' % van het scherm' : '')
  const note = 'zichtbaar anders (Δ>2) ' + visible + ' px, max Δ ' + Math.round(maxPre) + (separate ? ', buiten een zak ' + outsideSock + ' px' : '') + (${clip} ? '; rand van het gat ' + ringEdge + ' px (max Δ ' + Math.round(maxRing) + ')' : '')
  return { ok, crops, different, maxDelta, inked, socks: socks + '; ' + note }
})()`

let failures = 0
const camera = await page.evaluate(() => (window as unknown as { __motregenCamera: () => { lng: number; lat: number; zoom: number } }).__motregenCamera())
for (const [step, [dx, dy]] of [[0.15, 0], [0.3, 0.1], [0.1, -0.2], [-0.25, 0.05], [0, 0]].entries()) {
  if (sabotage && !separate) await page.evaluate('window.__motregenWindsocks().drawnRects = []')
  // `free`: zonder kaartbegrenzing, anders staat het telefoonbeeld op heel Nederland vast.
  await page.evaluate(([lng, lat, zoom]) => (window as unknown as { __motregenJumpTo: (lng: number, lat: number, zoom: number, free: boolean) => void }).__motregenJumpTo(lng, lat, zoom, true), [camera.lng + dx, camera.lat + dy, camera.zoom + 0.5] as const)
  await page.waitForTimeout(800)
  const result = await page.evaluate(compare) as { ok: boolean; different: number; maxDelta: number; inked: number; socks: string; crops?: string[] }
  if (result.crops && process.env.U111_CROPS) {
    const { writeFileSync } = await import('node:fs')
    result.crops.forEach((url, index) => writeFileSync(`${process.env.U111_CROPS}/stap${step}-${index ? 'getest' : 'referentie'}.png`, Buffer.from(url.split(',')[1]!, 'base64')))
  }
  const moved = await page.evaluate(() => (window as unknown as { __motregenCamera: () => { lng: number; lat: number } }).__motregenCamera())
  console.log(`stap ${step}: kaart ${moved.lng.toFixed(2)}, ${moved.lat.toFixed(2)}; zakken ${result.socks}, inktpixels ${result.inked}, verschillende kanalen ${result.different} (max Δ ${result.maxDelta})`)
  if (!result.ok || !result.inked) failures++
}
await browser.close()
console.log(failures ? `MISLUKT: ${failures} stappen` : 'GELIJK')
process.exit(failures ? 1 : 0)
