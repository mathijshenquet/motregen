import { chromium, type Page } from '@playwright/test'
import { mkdirSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

// Windbeeld rond een zoom z6 → z8 → z6 (track U20), per build gelijk: 1280×800 DPR 2, live data,
// land + zee in beeld. Stills in rust en ~0,3/2/4 s na elke zoom, inkt land/zee per still tegen hetzelfde beeld met
// de windcanvas verborgen (wind-ink-methode), en de effectieve opacity/intensiteit van de laag.
// WIND_TUNING = JSON voor `motregen-wind-tuning-v2` (leeg = geen opgeslagen tuning).
const [origin, outDir, label = 'run'] = process.argv.slice(2)
if (!origin || !outDir) throw new Error('usage: pnpm exec tsx scripts/wind-bisect.ts ORIGIN OUT_DIR [LABEL]  (VIDEO=1, THEMES=light,dark, WIND_TUNING=json, CYCLES=n, NOSTILLS=1)')
mkdirSync(outDir, { recursive: true })
const video = process.env.VIDEO === '1'
const themes = (process.env.THEMES ?? 'light,dark').split(',')
const tuning = process.env.WIND_TUNING ?? ''
const size = { width: 1280, height: 800 }
const view = { lng: 4.9, lat: 52.35, zoom: 6.5 }
const zoomedIn = 8
const cycles = Number(process.env.CYCLES ?? 1)
// Video zonder stills: de verborgen-windbasis flitst anders mee in de opname.
const noStills = process.env.NOSTILLS === '1'

type MapHandle = { easeTo: (options: object) => void; getZoom: () => number }
const browser = await chromium.launch({ headless: true, args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader'] })
const results: Record<string, unknown> = {}
for (const theme of themes) {
  const context = await browser.newContext({ viewport: size, deviceScaleFactor: 2, ...(video ? { recordVideo: { dir: outDir, size } } : {}) })
  await context.addInitScript(([value, custom, start]) => {
    localStorage.setItem('motregen-theme', value!)
    localStorage.setItem('motregen-map-view', start!)
    localStorage.removeItem('motregen-wind-tuning-v3')
    if (custom) localStorage.setItem('motregen-wind-tuning-v2', custom)
    else localStorage.removeItem('motregen-wind-tuning-v2')
  }, [theme, tuning, JSON.stringify(view)])
  const page = await context.newPage()
  page.setDefaultTimeout(120_000)
  await page.goto(new URL('/', origin).href)
  await page.waitForFunction(() => (globalThis as { __motregenWind?: { map?: unknown } }).__motregenWind?.map !== undefined)
  // Adaptief budget uit en volle dichtheid (zoals wind-zoom.ts), anders meet swiftshader op DPR 2
  // zijn eigen terugschaling mee en verschilt het particle-aantal per build.
  await page.evaluate(() => {
    const wind = (globalThis as unknown as { __motregenWind: Record<string, unknown> }).__motregenWind
    wind.frameCount = -1e12
    if ('budget' in wind) {
      wind.budget = wind.target
      ;(wind.balance as () => void).call(wind)
    } else wind.active = wind.target
  })
  await page.waitForTimeout(6_000)
  const pause = page.getByRole('button', { name: 'Pauzeren' })
  if (await pause.count()) await pause.first().evaluate((element) => (element as unknown as { click: () => void }).click())
  await page.addStyleTag({ content: '.wind-debug,.perf-hud{visibility:hidden!important}' })
  await page.waitForTimeout(4_000)
  const layerState = await page.evaluate(() => {
    const wind = (globalThis as unknown as { __motregenWind: { tuning: { intensity: number; visibility: number } } }).__motregenWind
    return { intensity: wind.tuning.intensity, visibility: wind.tuning.visibility }
  })

  const startZoom = await page.evaluate(() => (globalThis as unknown as { __motregenWind: { map: MapHandle } }).__motregenWind.map.getZoom())
  const box = (await page.locator('.map').boundingBox())!
  const clip = { x: box.x, y: box.y, width: Math.min(box.width, size.width - box.x), height: Math.min(box.height, size.height - box.y) }
  const shots: Array<{ phase: string; afterMs: number; zoom: number; active: number; retries: number; png: Buffer; base: Buffer }> = []
  // Basisbeeld direct na elke still met alleen de windcanvas verborgen (kaart staat stil): labels
  // en tegels laden na een zoom nog na en zouden anders als windinkt meetellen.
  const windVisible = (visible: boolean) => page.evaluate((value) => {
    const document = (globalThis as unknown as { document: { querySelector: (selector: string) => { style: { visibility: string } } | null } }).document
    const canvas = document.querySelector('.map-overlay-motregen-wind')
    if (canvas) canvas.style.visibility = value ? '' : 'hidden'
  }, visible)
  const still = async (phase: string, since: number) => {
    if (noStills) return
    const zoom = await page.evaluate(() => (globalThis as unknown as { __motregenWind: { map: MapHandle } }).__motregenWind.map.getZoom())
    const active = await page.evaluate(() => (globalThis as unknown as { __motregenWind: { active: number } }).__motregenWind.active)
    // Basis vóór en na de still moeten byte-gelijk zijn, anders veranderde de kaart zelf (tegels,
    // labels) tussen de opnames en telt dat als windinkt; dan opnieuw (hooguit drie keer).
    const hidden = async () => { await windVisible(false); const shot = await page.screenshot({ clip }); await windVisible(true); return shot }
    let base = await hidden()
    let afterMs = Date.now() - since
    let png = await page.screenshot({ clip })
    let retries = 0
    for (let after = await hidden(); !after.equals(base) && retries < 3; after = await hidden()) {
      base = after
      afterMs = Date.now() - since
      png = await page.screenshot({ clip })
      retries++
    }
    shots.push({ phase, afterMs, zoom, active, retries, png, base })
  }
  // Zoom tot moveend; daarna stills op ~0,3/2/4 s (swiftshader-screenshots op DPR 2 kosten ~1 s,
  // de werkelijke tijd na moveend staat in afterMs).
  const zoomTo = async (zoom: number) => {
    await page.evaluate((target) => new Promise<void>((resolve) => {
      const map = (globalThis as unknown as { __motregenWind: { map: MapHandle & { once: (event: string, callback: () => void) => void } } }).__motregenWind.map
      map.once('moveend', () => resolve())
      map.easeTo({ zoom: target, duration: 1_200 })
    }), zoom)
    return Date.now()
  }
  // Opwarmronde zonder opnames: de eerste zoom naar z8 laadt tegels en labels na.
  await zoomTo(zoomedIn)
  await page.waitForTimeout(3_000)
  await zoomTo(startZoom)
  await page.waitForTimeout(4_000)
  await still('rust', Date.now())
  for (let cycle = 0; cycle < cycles; cycle++) for (const [phase, zoom] of [['in', zoomedIn], ['uit', startZoom]] as const) {
    const ended = await zoomTo(zoom)
    await page.waitForTimeout(300)
    await still(phase, ended)
    for (const t of [2_000, 4_000]) {
      const wait = ended + t - Date.now()
      if (wait > 0) await page.waitForTimeout(wait)
      await still(phase, ended)
    }
  }

  const stills: unknown[] = []
  for (const [index, shot] of shots.entries()) {
    writeFileSync(join(outDir, `${label}-${theme}-${index}-${shot.phase}-${(shot.afterMs / 1_000).toFixed(1)}s.png`), shot.png)
    stills.push({ phase: shot.phase, afterMs: shot.afterMs, zoom: +shot.zoom.toFixed(2), active: shot.active, retries: shot.retries, ink: await analyse(page, shot.base, shot.png) })
  }
  results[theme] = { layer: layerState, startZoom, stills }
  console.log(label, theme, JSON.stringify(results[theme]))
  const recording = page.video()
  await context.close()
  if (recording) renameSync(await recording.path(), join(outDir, `${label}-${theme}.webm`))
}
writeFileSync(join(outDir, `${label}.json`), JSON.stringify(results, null, 2))
await browser.close()

// Gemiddelde absolute RGB-afwijking per pixel (wind-ink.ts), apart voor land en zee, plus het
// deel van de pixels dat meer dan 24 afwijkt (dichtheid van zichtbare strepen).
async function analyse(page: Page, base: Buffer, shot: Buffer) {
  return page.evaluate(`(async () => {
    const decode = async (b64) => {
      const image = new Image()
      image.src = 'data:image/png;base64,' + b64
      await image.decode()
      const canvas = document.createElement('canvas')
      canvas.width = image.width
      canvas.height = image.height
      const context = canvas.getContext('2d')
      context.drawImage(image, 0, 0)
      return context.getImageData(0, 0, image.width, image.height).data
    }
    const base = await decode(${JSON.stringify(base.toString('base64'))})
    const shot = await decode(${JSON.stringify(shot.toString('base64'))})
    const counts = new Map()
    for (let i = 0; i < base.length; i += 4) {
      const key = (base[i] >> 2) << 16 | (base[i + 1] >> 2) << 8 | (base[i + 2] >> 2)
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    const decodeKey = (key) => [(key >> 16 & 255) << 2, (key >> 8 & 255) << 2, (key & 255) << 2]
    const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([key]) => decodeKey(key))
    const isBlue = ([r, g, b]) => b > r + 25 && b > g
    const sea = ranked.find(isBlue)
    const land = ranked.find((color) => !isBlue(color))
    const near = (i, color) => Math.abs(base[i] - color[0]) + Math.abs(base[i + 1] - color[1]) + Math.abs(base[i + 2] - color[2]) < 24
    const result = { sea: { pixels: 0, ink: 0, strong: 0 }, land: { pixels: 0, ink: 0, strong: 0 } }
    for (let i = 0; i < base.length; i += 4) {
      const bucket = near(i, sea) ? result.sea : near(i, land) ? result.land : null
      if (!bucket) continue
      bucket.pixels++
      const delta = Math.abs(shot[i] - base[i]) + Math.abs(shot[i + 1] - base[i + 1]) + Math.abs(shot[i + 2] - base[i + 2])
      bucket.ink += delta
      if (delta > 24) bucket.strong++
    }
    return {
      seaInk: +(result.sea.ink / Math.max(1, result.sea.pixels)).toFixed(3),
      landInk: +(result.land.ink / Math.max(1, result.land.pixels)).toFixed(3),
      seaStrong: +(result.sea.strong / Math.max(1, result.sea.pixels)).toFixed(4),
      landStrong: +(result.land.strong / Math.max(1, result.land.pixels)).toFixed(4),
      seaPixels: result.sea.pixels,
      landPixels: result.land.pixels,
    }
  })()`)
}
