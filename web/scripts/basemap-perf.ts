// U108: teken- en laadkosten van alleen de basiskaart, per variant, in een kale MapLibre-pagina (geen weerlagen).
// Per ronde en variant een koude context: laden tot de eerste `idle` (ms, tegelbytes), dan een vaste camerarit (zoom
// 7→9, pannen, uitzoomen naar 6; 9 s) met frame-intervallen en hoofddraadbezetting (CDP TaskDuration), de tekentijd per
// beeld op z7/z9/z10 (redraw + readPixels) en de JS-heap.
// Varianten om en om, n rondes; mediaan per meetwaarde. Headless Chromium tekent met SwiftShader (CPU): absolute tijden
// zijn opgeblazen, de verhouding tussen varianten is wat telt.
// Gebruik: pnpm exec tsx scripts/basemap-perf.ts ORIGIN UIT.json [n] [variant…]   (ORIGIN = preview, bv. :4308)
import { chromium, type Browser } from '@playwright/test'
import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { loadavg } from 'node:os'

const [origin, output, roundsText, ...requested] = process.argv.slice(2)
if (!origin || !output) throw new Error('Gebruik: basemap-perf.ts ORIGIN UIT.json [n] [variant…]')
const rounds = Number(roundsText ?? 3)
const variants = requested.length ? requested : ['nu', 'strak', 'diagram', 'diagram-wegen']
const require = createRequire(import.meta.url)
const packageFile = (name: string, file: string) => readFileSync(join(dirname(require.resolve(`${name}/package.json`)), file))
const maplibre = packageFile('maplibre-gl', 'dist/maplibre-gl.js')
const pmtiles = packageFile('pmtiles', 'dist/pmtiles.js')
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 }

const PAGE = `<!doctype html><html><head><style>html,body,#map{margin:0;width:100%;height:100%}</style>
<script src="/__kaartperf/maplibre-gl.js"></script><script src="/__kaartperf/pmtiles.js"></script></head><body><div id="map"></div></body></html>`

async function run(browser: Browser, variant: string) {
  const context = await browser.newContext({ ...PHONE, serviceWorkers: 'block' })
  let tileBytes = 0
  context.on('requestfinished', async (request) => {
    if (/\/data\/basemap\/nl-[0-9a-f]{16}\.pmtiles/.test(request.url())) tileBytes += (await request.sizes()).responseBodySize
  })
  // tsx (esbuild keepNames) zet __name(...) in functies die naar page.evaluate gaan.
  await context.addInitScript('globalThis.__name = (target) => target')
  const page = await context.newPage()
  await page.route('**/__kaartperf.html', (route) => route.fulfill({ contentType: 'text/html', body: PAGE }))
  await page.route('**/__kaartperf/maplibre-gl.js', (route) => route.fulfill({ contentType: 'text/javascript', body: maplibre }))
  await page.route('**/__kaartperf/pmtiles.js', (route) => route.fulfill({ contentType: 'text/javascript', body: pmtiles }))
  await page.goto(new URL('/__kaartperf.html', origin).href)
  const cdp = await context.newCDPSession(page)
  await cdp.send('Performance.enable')
  const taskSeconds = async () => (await cdp.send('Performance.getMetrics')).metrics.find((metric) => metric.name === 'TaskDuration')!.value
  const styleUrl = variant === 'nu' ? '/basemap/licht.json' : `/dev-kaart/${variant}-licht.json`
  const load = await page.evaluate(async (styleUrl) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const win = window as any
    const style = await (await fetch(styleUrl)).json()
    for (const source of Object.values(style.sources) as Array<{ url?: string }>) {
      if (source.url?.startsWith('pmtiles://')) source.url = `pmtiles://${new URL(source.url.slice('pmtiles://'.length), location.href).href}`
    }
    style.glyphs = new URL(style.glyphs, location.href).href.replaceAll('%7B', '{').replaceAll('%7D', '}')
    win.maplibregl.addProtocol('pmtiles', new win.pmtiles.Protocol().tile)
    const start = performance.now()
    const map = new win.maplibregl.Map({ container: 'map', style, center: [5.3, 52.1], zoom: 7, attributionControl: false, fadeDuration: 0 })
    win.map = map
    await new Promise((done) => map.once('idle', done))
    return { loadMs: Math.round(performance.now() - start) }
  }, styleUrl)
  await page.waitForTimeout(500)
  const loadBytes = tileBytes
  const before = await taskSeconds()
  const motion = await page.evaluate(async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const map = (window as any).map
    const frames: number[] = []
    const onRender = () => frames.push(performance.now())
    map.on('render', onRender)
    const start = performance.now()
    const ease = (options: object) => new Promise((done) => { map.once('moveend', done); map.easeTo({ ...options, easing: (t: number) => t }) })
    await ease({ zoom: 9, center: [5.12, 52.09], duration: 3000 })
    await ease({ center: [5.9, 52.2], duration: 3000 })
    await ease({ zoom: 6, center: [5.3, 52.2], duration: 3000 })
    const wall = performance.now() - start
    map.off('render', onRender)
    const intervals = frames.slice(1).map((time, index) => time - frames[index]!).sort((a, b) => a - b)
    await new Promise((done) => map.once('idle', done))
    return { wallMs: wall, frames: frames.length, medianFrameMs: intervals[Math.floor(intervals.length / 2)] ?? 0, p95FrameMs: intervals[Math.floor(intervals.length * 0.95)] ?? 0 }
  })
  const busy = (await taskSeconds()) - before
  // Tekenkosten per beeld: map.redraw() is synchroon; een readPixels van 1 px wacht ook het GPU-werk af (SwiftShader). Mediaan van
  // 30 beelden per vaste stand, na `idle` (alle tegels geladen).
  const draw = await page.evaluate(async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const map = (window as any).map
    const gl = map.painter.context.gl as WebGLRenderingContext
    const result: Record<string, number> = {}
    const pixel = new Uint8Array(4)
    for (const [name, center, zoom] of [['z7', [5.3, 52.1], 7], ['z9', [4.85, 52.3], 9], ['z10', [4.85, 52.27], 10]] as const) {
      map.jumpTo({ center, zoom })
      await new Promise((done) => map.once('idle', done))
      const times: number[] = []
      for (let index = 0; index < 30; index++) {
        const start = performance.now()
        map.redraw()
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel)
        times.push(performance.now() - start)
      }
      times.sort((a, b) => a - b)
      result[name] = +times[15]!.toFixed(2)
    }
    return result
  })
  const heap = (await cdp.send('Performance.getMetrics')).metrics.find((metric) => metric.name === 'JSHeapUsedSize')!.value
  await context.close()
  return {
    variant, loadMs: load.loadMs, loadTileBytes: loadBytes, totalTileBytes: tileBytes,
    fps: +(motion.frames / (motion.wallMs / 1000)).toFixed(1), medianFrameMs: +motion.medianFrameMs.toFixed(1), p95FrameMs: +motion.p95FrameMs.toFixed(1),
    mainThreadBusyMsPerS: Math.round(busy * 1000 / (motion.wallMs / 1000)), heapMB: +(heap / 1048576).toFixed(1),
    drawMsZ7: draw.z7!, drawMsZ9: draw.z9!, drawMsZ10: draw.z10!,
  }
}

const browser = await chromium.launch({ headless: true, args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader'] })
const runs: Array<Awaited<ReturnType<typeof run>>> = []
for (let round = 0; round < rounds; round++) {
  for (const variant of round % 2 ? [...variants].reverse() : variants) {
    const result = await run(browser, variant)
    runs.push(result)
    console.log(JSON.stringify({ round, ...result }))
  }
}
await browser.close()
const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]!
const keys = ['loadMs', 'loadTileBytes', 'totalTileBytes', 'drawMsZ7', 'drawMsZ9', 'drawMsZ10', 'fps', 'p95FrameMs', 'mainThreadBusyMsPerS', 'heapMB'] as const
const summary = variants.map((variant) => Object.fromEntries([['variant', variant], ...keys.map((key) => [key, median(runs.filter((run) => run.variant === variant).map((run) => run[key]))])]))
writeFileSync(output, `${JSON.stringify({ rounds, loadavg: loadavg().map((value) => +value.toFixed(1)), summary, runs }, null, 2)}\n`)
console.table(summary)
