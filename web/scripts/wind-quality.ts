/// <reference lib="dom" />
import { chromium, type Page } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

// Windkwaliteit (track U24), per build gelijk: 1280×800 op DPR 2 (Mac-profiel), live data, z7 boven
// Nederland, adaptief budget uit. Inkt = alpha van de windcanvas zelf (readback direct na de
// windrender, dus na de composite met intensiteit), gesplitst naar land en zee via het basisbeeld.
//   ink   — gemiddelde alpha en dekking (> 8/255) over land/zee, 5 samples
//   crop  — 200 %-uitsneden (DPR 2) boven zee en land
//   zoom  — continue zoom 7→9 (100 stappen van 0,02, één per animatieframe) tegen één sprong 7→9,
//           inkt per windframe
//   profile — dichtheidsprofiel langs de wind (loef/lij), als de build `windProfile` heeft
// WIND_TUNING = JSON met afwijkingen voor `motregen-wind-tuning-v4`; SCENARIOS=ink,crop,zoom; THEMES; DPR.
const [origin, outDir, label = 'run'] = process.argv.slice(2)
if (!origin || !outDir) throw new Error('usage: pnpm exec tsx scripts/wind-quality.ts ORIGIN OUT_DIR [LABEL]')
mkdirSync(outDir, { recursive: true })
const scenarios = (process.env.SCENARIOS ?? 'ink,crop,zoom').split(',')
const themes = (process.env.THEMES ?? 'dark,light').split(',')
const tuning = process.env.WIND_TUNING ?? ''
const dpr = Number(process.env.DPR ?? 2)
const size = { width: 1280, height: 800 }
const start = { lng: 5.2, lat: 52.2, zoom: 7 }

type Wind = Record<string, unknown> & { map: MapHandle; render: (...args: unknown[]) => void; gl: WebGL2RenderingContext }
type MapHandle = { jumpTo: (options: object) => void; getZoom: () => number; once: (event: string, callback: () => void) => void }
interface Probe { capture: boolean; mask?: Uint8Array; frames: Array<Record<string, number>> }

const browser = await chromium.launch({ headless: true, args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader'] })
const results: Record<string, unknown> = {}
for (const theme of themes) {
  const context = await browser.newContext({ viewport: size, deviceScaleFactor: dpr })
  // tsx (esbuild keepNames) wikkelt benoemde functies in __name(), ook binnen page.evaluate.
  await context.addInitScript('globalThis.__name = (value) => value')
  await context.addInitScript(([value, custom, view]) => {
    localStorage.setItem('motregen-theme', value!)
    localStorage.setItem('motregen-map-view', view!)
    localStorage.removeItem('motregen-wind-tuning-v3')
    if (custom) localStorage.setItem('motregen-wind-tuning-v4', custom)
    else localStorage.removeItem('motregen-wind-tuning-v4')
  }, [theme, tuning, JSON.stringify(start)])
  const page = await context.newPage()
  page.setDefaultTimeout(120_000)
  await page.goto(new URL('/', origin).href)
  await page.waitForFunction(() => (globalThis as { __motregenWind?: { map?: unknown } }).__motregenWind?.map !== undefined)
  await page.evaluate(() => {
    const wind = (globalThis as unknown as { __motregenWind: Record<string, unknown> }).__motregenWind
    wind.frameCount = -1e12
    wind.budget = wind.target
    ;(wind.balance as () => void).call(wind)
  })
  await page.waitForTimeout(5_000)
  const pause = page.getByRole('button', { name: 'Pauzeren' })
  if (await pause.count()) await pause.first().evaluate((element) => (element as unknown as { click: () => void }).click())
  await page.addStyleTag({ content: '.wind-debug,.perf-hud{visibility:hidden!important}' })
  await jump(page, start.zoom)
  await page.waitForTimeout(6_000)
  await installProbe(page)
  const themeResults: Record<string, unknown> = {}

  if (scenarios.includes('ink')) {
    await setMask(page)
    const samples: Array<Record<string, number>> = []
    for (let sample = 0; sample < 5; sample++) {
      samples.push(await captureOne(page))
      await page.waitForTimeout(400)
    }
    const summary = average(samples)
    console.log(`${label} ${theme} ink ${JSON.stringify(summary)}`)
    themeResults.ink = { summary, samples }
  }

  if (scenarios.includes('crop')) {
    const box = (await page.locator('.map').boundingBox())!
    for (const [name, fx, fy] of [['zee', 0.18, 0.35], ['land', 0.62, 0.55]] as const) {
      const clip = { x: box.x + box.width * fx, y: box.y + box.height * fy, width: 240, height: 150 }
      await page.screenshot({ clip, path: join(outDir, `${label}-${theme}-crop-${name}.png`) })
    }
    // Alleen de windcanvas (over zwart), het drukste venster van 240×150 device-px, ×3 zonder filtering.
    const windOnly = await page.evaluate(async () => {
      const probe = (globalThis as unknown as { __u24: Probe & { keep?: boolean; pixels?: Uint8Array; size?: [number, number] } }).__u24
      probe.keep = true
      probe.pixels = undefined
      probe.capture = true
      while (!probe.pixels) await new Promise((resolve) => requestAnimationFrame(resolve))
      probe.capture = false
      probe.keep = false
      const [width, height] = probe.size!
      const pixels = probe.pixels
      const cropWidth = 240
      const cropHeight = 150
      let best = [0, 0, -1]
      for (let top = 0; top + cropHeight <= height; top += 25) {
        for (let left = 0; left + cropWidth <= width; left += 40) {
          let sum = 0
          for (let row = top; row < top + cropHeight; row += 3) for (let column = left; column < left + cropWidth; column += 3) sum += pixels[(row * width + column) * 4 + 3]!
          if (sum > best[2]!) best = [left, top, sum]
        }
      }
      const source = document.createElement('canvas')
      source.width = cropWidth
      source.height = cropHeight
      const image = source.getContext('2d')!.createImageData(cropWidth, cropHeight)
      for (let row = 0; row < cropHeight; row++) {
        for (let column = 0; column < cropWidth; column++) {
          const from = ((height - 1 - (best[1]! + row)) * width + best[0]! + column) * 4
          const to = (row * cropWidth + column) * 4
          image.data[to] = pixels[from]!
          image.data[to + 1] = pixels[from + 1]!
          image.data[to + 2] = pixels[from + 2]!
          image.data[to + 3] = 255
        }
      }
      source.getContext('2d')!.putImageData(image, 0, 0)
      const scaled = document.createElement('canvas')
      scaled.width = cropWidth * 3
      scaled.height = cropHeight * 3
      const context = scaled.getContext('2d')!
      context.imageSmoothingEnabled = false
      context.drawImage(source, 0, 0, scaled.width, scaled.height)
      return scaled.toDataURL('image/png').slice('data:image/png;base64,'.length)
    })
    writeFileSync(join(outDir, `${label}-${theme}-wind-x3.png`), Buffer.from(windOnly, 'base64'))
  }

  if (scenarios.includes('zoom')) {
    const runs: Record<string, unknown> = {}
    for (const mode of ['sprong', 'continu'] as const) {
      await jump(page, start.zoom)
      await page.waitForTimeout(5_000)
      const series = await page.evaluate(async (continuous) => {
        const wind = (globalThis as unknown as { __motregenWind: Wind }).__motregenWind
        const probe = (globalThis as unknown as { __u24: Probe }).__u24
        probe.mask = undefined
        probe.frames = []
        probe.capture = true
        // Virtuele klok: elk animatieframe telt als 1/60 s, ook als swiftshader (plus de readback)
        // veel trager rendert; anders krijgt een trail veel minder warps per levensduur dan op een Mac.
        const realNow = performance.now.bind(performance)
        let virtual = realNow()
        performance.now = () => virtual
        const frame = async () => {
          await new Promise((resolve) => requestAnimationFrame(resolve))
          virtual += 1_000 / 60
        }
        const started = virtual
        for (let index = 0; index < 30; index++) await frame()
        const gestureStart = virtual
        if (continuous) {
          for (let step = 1; step <= 100; step++) {
            wind.map.jumpTo({ zoom: 7 + step * 0.02 })
            await frame()
          }
        } else {
          wind.map.jumpTo({ zoom: 9 })
          await frame()
        }
        const gestureEnd = virtual
        for (let index = 0; index < 90; index++) await frame()
        probe.capture = false
        performance.now = realNow
        return { started, gestureStart, gestureEnd, frames: probe.frames.slice() }
      }, mode === 'continu')
      const before = series.frames.filter((entry) => entry.t < series.gestureStart)
      const during = series.frames.filter((entry) => entry.t >= series.gestureStart && entry.t <= series.gestureEnd)
      const after = series.frames.filter((entry) => entry.t > series.gestureEnd)
      const baseline = mean(before.map((entry) => entry.alphaAll!))
      const at = (ms: number) => after.find((entry) => entry.t >= series.gestureEnd + ms)?.alphaAll ?? NaN
      const window500 = mean(after.filter((entry) => entry.t <= series.gestureEnd + 500).map((entry) => entry.alphaAll!))
      const summary = {
        gestureMs: Math.round(series.gestureEnd - series.gestureStart),
        framesDuring: during.length,
        baselineAlpha: round(baseline, 5),
        minDuringRatio: round(Math.min(...during.map((entry) => entry.alphaAll!)) / baseline),
        endRatio: round((after[0]?.alphaAll ?? NaN) / baseline),
        endAlpha: round(after[0]?.alphaAll ?? NaN, 5),
        mean500msAlpha: round(window500, 5),
        ratio300ms: round(at(300) / baseline),
        ratio1000ms: round(at(1_000) / baseline),
        coverageEnd: round(after[0]?.coverageAll ?? NaN, 4),
      }
      console.log(`${label} ${theme} zoom-${mode} ${JSON.stringify(summary)}`)
      runs[mode] = { summary, gestureStart: series.gestureStart, gestureEnd: series.gestureEnd, frames: series.frames }
      await page.screenshot({ path: join(outDir, `${label}-${theme}-zoom-${mode}-eind.png`) })
    }
    themeResults.zoom = runs
  }

  if (scenarios.includes('profile')) {
    await jump(page, start.zoom)
    await page.waitForTimeout(8_000)
    const samples: Array<{ inkRatio: number; ink: number[]; heads: unknown }> = []
    for (let sample = 0; sample < 8; sample++) {
      samples.push(await page.evaluate(async () => {
        const wind = (globalThis as unknown as { __motregenWind: Wind & { active: number; x: Float32Array; y: Float32Array; east: number; north: number; sampleWind: (x: number, y: number) => boolean; windProfile?: () => unknown } }).__motregenWind
        const probe = (globalThis as unknown as { __u24: Probe & { keep?: boolean; pixels?: Uint8Array; size?: [number, number] } }).__u24
        probe.keep = true
        probe.pixels = undefined
        probe.capture = true
        while (!probe.pixels) await new Promise((resolve) => requestAnimationFrame(resolve))
        probe.capture = false
        probe.keep = false
        let east = 0
        let north = 0
        for (let index = 0; index < wind.active; index++) {
          if (!wind.sampleWind(wind.x[index]!, wind.y[index]!)) continue
          east += wind.east
          north += wind.north
        }
        // Inkt (alpha van de windcanvas) per band van gelijk oppervlak langs de windrichting, loef → lij.
        const [width, height] = probe.size!
        const pixels = probe.pixels
        const length = Math.hypot(east, north)
        const ux = east / length
        const uy = -north / length
        const project = (column: number, row: number) => column * ux + row * uy
        const values: number[] = []
        for (let row = 0; row < height; row += 16) for (let column = 0; column < width; column += 16) values.push(project(column, row))
        values.sort((left, right) => left - right)
        const bins = 10
        const edges = Array.from({ length: bins - 1 }, (_, band) => values[Math.floor((band + 1) * values.length / bins)]!)
        const sums = new Array<number>(bins).fill(0)
        for (let row = 0; row < height; row += 2) {
          for (let column = 0; column < width; column += 2) {
            const alpha = pixels[((height - 1 - row) * width + column) * 4 + 3]!
            if (!alpha) continue
            const t = project(column, row)
            let band = 0
            while (band < edges.length && t > edges[band]!) band++
            sums[band] += alpha
          }
        }
        const total = sums.reduce((sum, value) => sum + value, 0)
        const ink = sums.map((value) => value / total * bins)
        return { inkRatio: (ink[0]! + ink[1]!) / (ink[bins - 2]! + ink[bins - 1]!), ink, heads: wind.windProfile?.() ?? null, wind: [east / wind.active, north / wind.active] }
      }))
      await page.waitForTimeout(500)
    }
    const meanOf = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length
    const profile = samples[0]!.ink.map((_, band) => round(meanOf(samples.map((entry) => entry.ink[band]!)), 2))
    const headRatios = samples.map((entry) => (entry.heads as { ratio?: number } | null)?.ratio).filter((value): value is number => value !== undefined)
    console.log(`${label} ${theme} profile ${JSON.stringify({ inkRatio: round(meanOf(samples.map((entry) => entry.inkRatio)), 2), profile, headRatio: headRatios.length ? round(meanOf(headRatios), 2) : null, wind: (samples[0] as unknown as { wind: number[] }).wind.map((value) => round(value, 1)) })}`)
    themeResults.profile = samples
  }
  results[theme] = themeResults
  await context.close()
}
await browser.close()
writeFileSync(join(outDir, `${label}.json`), JSON.stringify(results))

async function jump(page: Page, zoom: number): Promise<void> {
  await page.evaluate((value) => new Promise<void>((resolve) => {
    const map = (globalThis as unknown as { __motregenWind: Wind }).__motregenWind.map
    map.once('idle', () => resolve())
    map.jumpTo({ center: [5.2, 52.2], zoom: value })
  }), zoom)
}

// Na elke windrender de windcanvas teruglezen; alpha is premultiplied en bevat de intensiteit.
async function installProbe(page: Page): Promise<void> {
  await page.evaluate(() => {
    const wind = (globalThis as unknown as { __motregenWind: Wind }).__motregenWind
    const probe: Probe = { capture: false, frames: [] }
    ;(globalThis as unknown as { __u24: Probe }).__u24 = probe
    const render = wind.render.bind(wind)
    let pixels = new Uint8Array(0)
    wind.render = (...args: unknown[]) => {
      render(...args)
      if (!probe.capture) return
      const gl = args[0] as WebGL2RenderingContext
      const width = gl.drawingBufferWidth
      const height = gl.drawingBufferHeight
      if (pixels.length !== width * height * 4) pixels = new Uint8Array(width * height * 4)
      gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels)
      const keeper = probe as Probe & { keep?: boolean; pixels?: Uint8Array; size?: [number, number] }
      if (keeper.keep) { keeper.pixels = pixels.slice(); keeper.size = [width, height] }
      const sums = { all: 0, land: 0, sea: 0 }
      const counts = { all: 0, land: 0, sea: 0 }
      const covered = { all: 0, land: 0, sea: 0 }
      for (let row = 0; row < height; row++) {
        for (let column = 0; column < width; column++) {
          const alpha = pixels[(row * width + column) * 4 + 3]!
          // readPixels is ondersteboven; het masker staat in schermvolgorde.
          const kind = probe.mask ? probe.mask[(height - 1 - row) * width + column]! : 0
          const bucket = kind === 1 ? 'land' : kind === 2 ? 'sea' : null
          sums.all += alpha
          counts.all++
          if (alpha > 8) covered.all++
          if (!bucket) continue
          sums[bucket] += alpha
          counts[bucket]++
          if (alpha > 8) covered[bucket]++
        }
      }
      probe.frames.push({
        t: performance.now(),
        zoom: wind.map.getZoom(),
        alphaAll: sums.all / Math.max(1, counts.all) / 255,
        alphaLand: sums.land / Math.max(1, counts.land) / 255,
        alphaSea: sums.sea / Math.max(1, counts.sea) / 255,
        coverageAll: covered.all / Math.max(1, counts.all),
        coverageLand: covered.land / Math.max(1, counts.land),
        coverageSea: covered.sea / Math.max(1, counts.sea),
        landPixels: counts.land,
        seaPixels: counts.sea,
      })
    }
  })
}

// Land/zee-masker uit het basisbeeld zonder wind (meest voorkomende blauwige en niet-blauwige kleur).
async function setMask(page: Page): Promise<void> {
  const canvas = page.locator('.map-overlay-motregen-wind')
  const box = (await canvas.boundingBox())!
  await canvas.evaluate((element: HTMLElement) => { element.style.visibility = 'hidden' })
  const shot = await page.screenshot({ clip: box })
  await canvas.evaluate((element: HTMLElement) => { element.style.visibility = '' })
  await page.evaluate(async (base64) => {
    const wind = (globalThis as unknown as { __motregenWind: Wind }).__motregenWind
    const probe = (globalThis as unknown as { __u24: Probe }).__u24
    const image = new Image()
    image.src = `data:image/png;base64,${base64}`
    await image.decode()
    const width = wind.gl.drawingBufferWidth
    const height = wind.gl.drawingBufferHeight
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')!
    context.drawImage(image, 0, 0, width, height)
    const base = context.getImageData(0, 0, width, height).data
    const counts = new Map<number, number>()
    for (let index = 0; index < base.length; index += 4) {
      const key = (base[index]! >> 2) << 16 | (base[index + 1]! >> 2) << 8 | (base[index + 2]! >> 2)
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    const decode = (key: number) => [(key >> 16 & 255) << 2, (key >> 8 & 255) << 2, (key & 255) << 2] as const
    const ranked = [...counts.entries()].sort((left, right) => right[1] - left[1]).map(([key]) => decode(key))
    const isBlue = ([red, green, blue]: readonly number[]) => blue! > red! + 25 && blue! > green!
    const sea = ranked.find(isBlue)!
    const land = ranked.find((color) => !isBlue(color))!
    const near = (index: number, color: readonly number[]) => Math.abs(base[index]! - color[0]!) + Math.abs(base[index + 1]! - color[1]!) + Math.abs(base[index + 2]! - color[2]!) < 24
    const mask = new Uint8Array(width * height)
    for (let pixel = 0; pixel < mask.length; pixel++) mask[pixel] = near(pixel * 4, sea) ? 2 : near(pixel * 4, land) ? 1 : 0
    probe.mask = mask
  }, shot.toString('base64'))
}

async function captureOne(page: Page): Promise<Record<string, number>> {
  return page.evaluate(async () => {
    const probe = (globalThis as unknown as { __u24: Probe }).__u24
    probe.frames = []
    probe.capture = true
    while (!probe.frames.length) await new Promise((resolve) => requestAnimationFrame(resolve))
    probe.capture = false
    return probe.frames[0]!
  })
}

function average(samples: Array<Record<string, number>>): Record<string, number> {
  const result: Record<string, number> = {}
  for (const key of Object.keys(samples[0]!)) if (key !== 't') result[key] = round(mean(samples.map((sample) => sample[key]!)), 5)
  return result
}

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length)
}

function round(value: number, digits = 3): number {
  const scale = 10 ** digits
  return Math.round(value * scale) / scale
}
