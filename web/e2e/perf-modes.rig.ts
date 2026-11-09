import { mkdirSync, writeFileSync } from 'node:fs'
import { loadavg } from 'node:os'
import { join } from 'node:path'
import { chromium, devices, test, type Browser, type BrowserContext, type CDPSession, type Page } from '@playwright/test'
import type { Manifest } from '../src/core/contract'
import type { LoadTraceSnapshot, PerfSnapshot, PerfTraceSlice } from '../src/core/perf'
import {
  framesCompleteMs, histogramFrames, longFramesIn, mapFrames, MODE_BUTTONS, totalsBySource,
  type LongFrame, type MapMode, type NetworkEntry, type PhaseWindow, type VisitReport,
} from '../scripts/perf-modes-report'

// U102 fase 1 (C7): kaartmodi × profielen op live data. Start via `pnpm perf:modes` (scripts/perf-modes.ts),
// die de opties in MOTREGEN_PERF_MODES_OPTIONS zet en de perf-lock neemt.

interface SuiteOptions { origin: string; modes: MapMode[]; profiles: ProfileId[]; repeat: number; outputDirectory: string; interactions: boolean; trace: boolean }
type ProfileId = 'telefoon' | 'desktop'

const options = JSON.parse(process.env.MOTREGEN_PERF_MODES_OPTIONS ?? '{}') as SuiteOptions
const megabit = 1_000_000 / 8

interface SuiteProfile {
  label: string
  contextOptions: Parameters<Browser['newContext']>[0]
  launchArgs: string[]
  network: { latency: number; downloadThroughput: number; uploadThroughput: number; connectionType: 'cellular4g' } | null
  loadTimeoutMs: number
}

// Telefoon = de rig gekalibreerd op de PO-telefoon (docs/perf.md §Profiel po-android: renderer-quota 40 %,
// page-CPU 1×), maar met het 4G-netwerk van mobile-4g in plaats van wifi naar de dev-host.
const PROFILES: Record<ProfileId, SuiteProfile> = {
  telefoon: {
    label: 'telefoon 4G',
    contextOptions: {
      ...devices['Pixel 5'],
      viewport: { width: 390, height: 844 },
      userAgent: 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Mobile Safari/537.36',
    },
    launchArgs: ['--renderer-cmd-prefix=systemd-run --user --scope --quiet -p CPUQuota=40% -p CPUQuotaPeriodSec=5ms --'],
    network: { latency: 60, downloadThroughput: 9 * megabit, uploadThroughput: 1.5 * megabit, connectionType: 'cellular4g' },
    loadTimeoutMs: 90_000,
  },
  desktop: {
    label: 'desktop',
    contextOptions: { viewport: { width: 1440, height: 900 } },
    launchArgs: [],
    network: null,
    loadTimeoutMs: 45_000,
  },
}

const NETWORK_QUIET_MS = 2_000
const MIN_COLD_VISIT_MS = 12_000

for (const profileId of options.profiles ?? []) {
  for (const mode of options.modes) {
    for (let run = 1; run <= options.repeat; run++) {
      test(`${profileId} / ${mode} / run ${run}`, async () => {
        const profile = PROFILES[profileId]
        test.setTimeout(2 * profile.loadTimeoutMs + 120_000)
        const browser = await chromium.launch({ args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader', ...profile.launchArgs] })
        try {
          const context = await browser.newContext({ ...profile.contextOptions, timezoneId: 'Europe/Amsterdam', locale: 'nl-NL' })
          await context.addInitScript(installPageProbes)
          // Rechtstreeks op productie telt elk bezoek als sessie (MIP-35): label ze en stuur geen baken.
          if (new URL(options.origin).hostname === 'motregen.nl') {
            await context.addInitScript(() => { try { localStorage.setItem('motregen-meetlabel', 'perf-u102') } catch { /* privémodus */ } })
            await context.route('**/hit', (route) => route.abort())
          }
          for (const visit of ['koud', 'warm'] as const) {
            const name = `${profileId}-${visit}-${mode}-run${run}`
            // Met --trace krijgt het warme bezoek een Chrome-trace en `?perf` (decodefasen per frame), voor
            // scripts/perf-trace-split.ts; het koude bezoek vult alleen de cache.
            const tracePath = options.trace && (visit === 'warm' || process.env.MOTREGEN_PERF_MODES_TRACE_COLD === '1') ? join(options.outputDirectory, `${name}.trace`) : undefined
            const report = await measureVisit(browser, context, profileId, profile, mode, visit, run, tracePath)
            mkdirSync(options.outputDirectory, { recursive: true })
            writeFileSync(join(options.outputDirectory, `${name}.json`), `${JSON.stringify(report, null, 2)}\n`)
            const shown = (ms: number | null) => ms === null ? '—' : `${Math.round(ms)} ms`
            console.log(`${name}: kaart ${shown(report.milestones.firstMapMs)}, histogram ${shown(report.milestones.histogramCompleteMs)}, tabel ${shown(report.milestones.tableCompleteMs)}, ${report.untilSettled.totaal.bytes} B in ${report.untilSettled.totaal.requests} requests${report.settled ? '' : ' (NIET compleet binnen de tijd)'}`)
          }
          await context.close()
        } finally {
          await browser.close()
        }
      })
    }
  }
}

async function measureVisit(browser: Browser, context: BrowserContext, profileId: ProfileId, profile: SuiteProfile, mode: MapMode, visit: 'koud' | 'warm', run: number, tracePath?: string): Promise<VisitReport & { traced?: TracedVisit; layers: LayerTimes; modeSwitches: ModeSwitch[]; phaseWindows: PhaseWindow[] }> {
  const page = await context.newPage()
  if (tracePath) await browser.startTracing(page, { path: tracePath, categories: TRACE_CATEGORIES })
  const cdp = await context.newCDPSession(page)
  const network = await recordNetwork(cdp)
  if (profile.network) {
    const conditions = { offline: false, ...profile.network }
    await cdp.send('Network.overrideNetworkState', conditions)
    await cdp.send('Network.emulateNetworkConditionsByRule', { matchedNetworkConditions: [{ urlPattern: '', ...conditions }] })
  }
  let manifest: Manifest | undefined
  page.on('response', (response) => {
    if (manifest || !new URL(response.url()).pathname.endsWith('/manifest.json') || response.status() !== 200) return
    void response.json().then((body: Manifest) => { manifest ??= body }).catch(() => undefined)
  })
  const capturedAt = new Date().toISOString()
  const loadAverage = Math.round(loadavg()[0]! * 100) / 100
  await page.goto(new URL(`/?modus=${mode}${tracePath && visit === 'warm' ? '&perf' : ''}`, options.origin).href, { waitUntil: 'commit' })

  let state = await readState(page)
  let histogram: ReturnType<typeof framesCompleteMs> = { completeMs: null, missing: [] }
  let map: ReturnType<typeof framesCompleteMs> = { completeMs: null, missing: [] }
  let wantedFrames = 0
  const deadline = Date.now() + profile.loadTimeoutMs
  let settled = false
  let quietDeadline: number | null = null
  // Pollen kost de pagina weinig: de tijden komen uit de trace en de paginasampler, niet uit dit ritme.
  while (Date.now() < (quietDeadline ?? deadline)) {
    await page.waitForTimeout(1_000)
    state = await readState(page)
    if (manifest && state.trace) {
      const wanted = histogramFrames(manifest, mode)
      wantedFrames = wanted.length
      histogram = framesCompleteMs(wanted, state.trace, true)
      map = framesCompleteMs(mapFrames(manifest, mode), state.trace)
    }
    settled = histogram.completeMs !== null && state.tableCompleteMs !== null && map.completeMs !== null
    // Een ruim apparaat laadt daarna gewoon door (eager); de laadfase wacht dan hooguit 3 s op rust.
    if (settled) quietDeadline ??= Date.now() + 3_000
    const quiet = network.inFlight() === 0 && state.now - network.lastActivityMs(state.timeOrigin) >= NETWORK_QUIET_MS
    if (settled && quiet) break
  }
  const settledMs = state.now
  let traced: TracedVisit | undefined
  if (tracePath && manifest) {
    // Het merkteken legt de paginaklok vast op de traceklok (ts van dezelfde mark in de trace).
    const page_ = await page.evaluate(() => {
      const mark = performance.mark('u102-trace-sync')
      const monitor = (window as typeof window & { __motregenPerf?: { traceSlice: () => PerfTraceSlice } }).__motregenPerf
      return { syncMs: mark.startTime, measures: monitor?.traceSlice().measures ?? [] }
    })
    // U109: MOTREGEN_PERF_MODES_TRACE_ALL=1 houdt de trace aan tot na de interacties (kosten per fase).
    if (process.env.MOTREGEN_PERF_MODES_TRACE_ALL !== '1') await browser.stopTracing()
    traced = { manifest, loadTrace: state.trace, syncMs: page_.syncMs, decodes: page_.measures.filter((measure) => measure.phase === 'frame-decode') }
  }
  const revealed = state.snapshot?.mapRevealedMs ?? null
  const firstMapMs = revealed === null || map.completeMs === null ? null : Math.max(revealed, map.completeMs)
  const entries = network.entries(state.timeOrigin)
  const phases: PhaseWindow[] = [{ name: 'laden', startMs: 0, endMs: settledMs }]
  const layers = await readLayers(page)
  const modeSwitches: ModeSwitch[] = []
  if (options.interactions) phases.push(...await interact(page, mode, modeSwitches))
  if (tracePath && manifest && process.env.MOTREGEN_PERF_MODES_TRACE_ALL === '1') await browser.stopTracing()
  // Het warme bezoek hoort de cache van een gewone sessie te zien. Sinds de regiobestanden (MIP-40) is een koud
  // bezoek al na ~7 s klaar, terwijl de afspeelframes nog binnenkomen; sloot de pagina dan, dan miste het warme bezoek
  // ze. Vóór MIP-40 duurde een koud bezoek vanzelf 11–12 s.
  if (visit === 'koud') await page.waitForTimeout(Math.max(0, MIN_COLD_VISIT_MS - await page.evaluate(() => performance.now())))
  const longFrames = await page.evaluate(() => (window as typeof window & { __u102LongFrames?: LongFrame[] }).__u102LongFrames ?? [])
  await page.close()
  return {
    mode, profile: PROFILES[profileId].label, visit, run, origin: options.origin, capturedAt, loadAverage, settled,
    milestones: { firstMapMs, ttfrMs: state.snapshot?.ttfrMs ?? null, ttfpMs: state.snapshot?.ttfpMs ?? null, histogramCompleteMs: histogram.completeMs, tableCompleteMs: state.tableCompleteMs, settledMs },
    histogram: { frames: wantedFrames, missing: histogram.missing.length },
    table: { rowsChecked: state.tableRows },
    untilHistogram: totalsBySource(entries, histogram.completeMs ?? settledMs),
    untilSettled: totalsBySource(entries, settledMs),
    longFrames: Object.fromEntries(phases.map((phase) => [phase.name, longFramesIn(longFrames, phase)])),
    network: entries.filter((entry) => entry.startMs <= settledMs),
    layers,
    modeSwitches,
    phaseWindows: phases,
    ...(traced ? { traced } : {}),
  }
}

export interface TracedVisit { manifest: Manifest; loadTrace: LoadTraceSnapshot | null; syncMs: number; decodes: PerfTraceSlice['measures'] }

// U109: v8 + v8.compile voor parse/compile-tijd per draad (scripts/u109-trace-v8.ts).
const TRACE_CATEGORIES = ['toplevel', 'devtools.timeline', 'disabled-by-default-devtools.timeline', 'v8.execute', 'v8', 'disabled-by-default-v8.compile', 'blink.user_timing', 'loading', '__metadata', ...process.env.MOTREGEN_PERF_MODES_CPU_PROFILE === '1' ? ['disabled-by-default-v8.cpu_profiler'] : []]

interface PageState { now: number; timeOrigin: number; snapshot: PerfSnapshot | null; trace: LoadTraceSnapshot | null; tableCompleteMs: number | null; tableRows: number }

async function readState(page: Page): Promise<PageState> {
  return page.evaluate(() => {
    const win = window as typeof window & {
      __motregenPerf?: { snapshot: () => PerfSnapshot; loads?: { snapshot: () => LoadTraceSnapshot } }
      __u102Table?: { completeMs: number | null; rows: number }
    }
    return {
      now: performance.now(),
      timeOrigin: performance.timeOrigin,
      snapshot: win.__motregenPerf?.snapshot() ?? null,
      trace: win.__motregenPerf?.loads?.snapshot() ?? null,
      tableCompleteMs: win.__u102Table?.completeMs ?? null,
      tableRows: win.__u102Table?.rows ?? 0,
    }
  })
}

/** Scrubben (slepen), afspelen en de drie andere modi aanklikken; elk een eigen tijdvak voor de lange frames. */
// U109: welke lagen een modus moet tonen voordat de kaart "staat" (PO 2026-11-09).
const MODE_LAYERS: Record<MapMode, string[]> = {
  weer: ['regen'],
  lucht: ['wolken'],
  gevoel: ['temperatuurvlakken', 'temperatuurgetallen'],
  wind: ['bft-vlakken', 'windzakken', 'deeltjes'],
}
const MODE_LEGENDS: Partial<Record<MapMode, string>> = { weer: '.rain-isoline-legend', gevoel: '.feels-legend', wind: '.wind-legend' }

export interface LayerTimes { firstMs: Record<string, number>; legends: Array<{ selector: string; ms: number }> }
export interface ModeSwitch { to: MapMode; layers: Record<string, number>; legendMs: number | null; complete: boolean }

async function readLayers(page: Page): Promise<LayerTimes> {
  return page.evaluate(() => {
    const win = window as typeof window & { __motregenPerf?: { snapshot: () => PerfSnapshot }; __u109Legends?: Array<{ selector: string; ms: number }> }
    return { firstMs: (win.__motregenPerf?.snapshot().layers?.firstMs ?? {}) as Record<string, number>, legends: win.__u109Legends ?? [] }
  })
}

/** Klik een modusknop en wacht (minstens 2 s, hooguit 12 s) tot de lagen van die modus getekend zijn. */
async function switchMode(page: Page, to: MapMode): Promise<ModeSwitch> {
  await page.getByRole('button', { name: MODE_BUTTONS[to], exact: true }).first().click()
  const clickedAt = Date.now()
  let state: { layers: Record<string, number>; atMs: number | null; legends: Array<{ selector: string; ms: number }> } = { layers: {}, atMs: null, legends: [] }
  const complete = () => MODE_LAYERS[to].every((layer) => state.layers[layer] !== undefined)
  while (Date.now() - clickedAt < 12_000) {
    await page.waitForTimeout(250)
    state = await page.evaluate(() => {
      const win = window as typeof window & { __motregenPerf?: { snapshot: () => PerfSnapshot }; __u109Legends?: Array<{ selector: string; ms: number }> }
      const modeSwitch = win.__motregenPerf?.snapshot().layers?.modeSwitch
      return { layers: (modeSwitch?.layers ?? {}) as Record<string, number>, atMs: modeSwitch?.atMs ?? null, legends: win.__u109Legends ?? [] }
    })
    if (complete() && Date.now() - clickedAt >= 2_000) break
  }
  const selector = MODE_LEGENDS[to]
  const legend = selector && state.atMs !== null ? state.legends.find((entry) => entry.selector === selector && entry.ms >= state.atMs!) : undefined
  return { to, layers: state.layers, legendMs: legend && state.atMs !== null ? Math.round(legend.ms - state.atMs) : null, complete: complete() }
}

async function interact(page: Page, mode: MapMode, modeSwitches: ModeSwitch[]): Promise<PhaseWindow[]> {
  const pageNow = () => page.evaluate(() => performance.now())
  const phases: PhaseWindow[] = []
  const slider = page.getByRole('slider', { name: 'Tijd' })
  await slider.scrollIntoViewIfNeeded()
  const box = await slider.boundingBox()
  if (box) {
    const startMs = await pageNow()
    const y = box.y + box.height / 2
    const sweep = [1 / 3, 0.9, 0.1, 1 / 3]
    await page.mouse.move(box.x + box.width * sweep[0]!, y)
    await page.mouse.down()
    for (let leg = 1; leg < sweep.length; leg++) {
      for (let step = 1; step <= 30; step++) {
        const fraction = sweep[leg - 1]! + (sweep[leg]! - sweep[leg - 1]!) * step / 30
        await page.mouse.move(box.x + box.width * fraction, y)
        await page.waitForTimeout(33)
      }
    }
    await page.mouse.up()
    await page.waitForTimeout(500)
    phases.push({ name: 'scrubben', startMs, endMs: await pageNow() })
  }
  {
    const startMs = await pageNow()
    if (await slider.getAttribute('data-playing') === null) {
      await slider.focus()
      await page.keyboard.press(' ')
    }
    await page.waitForTimeout(6_000)
    phases.push({ name: 'afspelen', startMs, endMs: await pageNow() })
  }
  {
    const startMs = await pageNow()
    const order = (['weer', 'lucht', 'gevoel', 'wind'] as const).filter((other) => other !== mode)
    for (const other of [...order, mode]) modeSwitches.push(await switchMode(page, other))
    phases.push({ name: 'modus wisselen', startMs, endMs: await pageNow() })
  }
  {
    // U109: rust (gepauzeerd, geen invoer); wat dan nog draait is rustkost.
    if (await slider.getAttribute('data-playing') !== null) {
      await slider.focus()
      await page.keyboard.press(' ')
    }
    await page.waitForTimeout(1_000)
    const startMs = await pageNow()
    await page.waitForTimeout(6_000)
    phases.push({ name: 'rust', startMs, endMs: await pageNow() })
  }
  return phases
}

/**
 * Draait vóór de app. Verzamelt lange animatieframes en het eerste moment waarop de tabelrijen in beeld
 * (minstens één, vanaf "nu") gevoel, temperatuur en wind tonen; "…" en "—" tellen als nog leeg.
 */
function installPageProbes(): void {
  const win = window as typeof window & { __u102LongFrames?: unknown[]; __u102Table?: { completeMs: number | null; rows: number } }
  const frames: unknown[] = []
  win.__u102LongFrames = frames
  win.__u102Table = { completeMs: null, rows: 0 }
  if (PerformanceObserver.supportedEntryTypes?.includes('long-animation-frame')) {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as Array<PerformanceEntry & { blockingDuration?: number }>) {
        frames.push({ startMs: entry.startTime, durationMs: entry.duration, blockingMs: entry.blockingDuration ?? 0 })
      }
    }).observe({ type: 'long-animation-frame', buffered: true })
  }
  // U109: elk moment waarop een legenda zichtbaar wordt (van verborgen naar zichtbaar).
  const legends: Array<{ selector: string; ms: number }> = []
  ;(win as typeof win & { __u109Legends?: typeof legends }).__u109Legends = legends
  const legendShown = new Map<string, boolean>()
  const checkLegends = () => {
    for (const selector of ['.feels-legend', '.wind-legend', '.rain-isoline-legend:not(.wind-legend)']) {
      const element = document.querySelector<HTMLElement>(selector)
      const rect = element?.getBoundingClientRect()
      const shown = !!element && !!rect && rect.width > 0 && rect.height > 0 && getComputedStyle(element).visibility !== 'hidden' && Number(getComputedStyle(element).opacity) > 0
      if (shown && !legendShown.get(selector)) legends.push({ selector: selector.split(':')[0]!, ms: performance.now() })
      legendShown.set(selector, shown)
    }
  }
  const filled = (text: string | null | undefined) => !!text && !text.includes('…') && !text.includes('—') && /\d/.test(text)
  const check = () => {
    if (win.__u102Table!.completeMs !== null) return
    const rows = Array.from(document.querySelectorAll<HTMLTableRowElement>('.forecast-table tr[data-epoch]:not(.past-hour)'))
      .filter((row) => { const rect = row.getBoundingClientRect(); return rect.bottom > 0 && rect.top < innerHeight && rect.height > 0 })
    if (!rows.length) return
    const complete = rows.every((row) => !row.classList.contains('pending-hour')
      && filled(row.querySelector('.temperature-cell')?.textContent)
      && filled(row.querySelector('.wind-cell')?.textContent))
    if (complete) win.__u102Table = { completeMs: performance.now(), rows: rows.length }
  }
  let scheduled = false
  const observer = new MutationObserver(() => {
    if (scheduled) return
    scheduled = true
    setTimeout(() => { scheduled = false; check(); checkLegends() }, 50)
  })
  const start = () => observer.observe(document.documentElement, { subtree: true, childList: true, characterData: true })
  if (document.documentElement) start(); else document.addEventListener('DOMContentLoaded', start)
}

async function recordNetwork(cdp: CDPSession) {
  const byId = new Map<string, { url: string; wallTimeMs: number; timestamp: number; endAt?: number; bytes: number; fromCache: boolean; failed: string | null }>()
  let lastTimestamp = 0
  // Wandklok min monotone CDP-klok, uit de eerste request.
  let wallOffsetMs: number | null = null
  const touch = (timestamp: number) => { lastTimestamp = Math.max(lastTimestamp, timestamp) }
  cdp.on('Network.requestWillBeSent', (event) => {
    if (byId.has(event.requestId)) return
    byId.set(event.requestId, { url: event.request.url, wallTimeMs: event.wallTime * 1_000, timestamp: event.timestamp, bytes: 0, fromCache: false, failed: null })
    wallOffsetMs ??= event.wallTime * 1_000 - event.timestamp * 1_000
    touch(event.timestamp)
  })
  cdp.on('Network.responseReceived', (event) => {
    const record = byId.get(event.requestId)
    if (record) record.fromCache = event.response.fromDiskCache || event.response.fromServiceWorker || event.response.fromPrefetchCache === true
    touch(event.timestamp)
  })
  cdp.on('Network.loadingFinished', (event) => {
    const record = byId.get(event.requestId)
    if (!record) return
    record.endAt = event.timestamp
    record.bytes = event.encodedDataLength
    touch(event.timestamp)
  })
  cdp.on('Network.loadingFailed', (event) => {
    const record = byId.get(event.requestId)
    if (!record) return
    record.endAt = event.timestamp
    record.failed = event.errorText
    touch(event.timestamp)
  })
  await cdp.send('Network.enable')
  return {
    inFlight: () => [...byId.values()].filter((record) => record.endAt === undefined && !record.url.startsWith('data:') && !record.url.startsWith('blob:')).length,
    // CDP-timestamps zijn monotone seconden; de wandklok van de eerste request zet ze op de paginaklok.
    lastActivityMs: (timeOrigin: number) => wallOffsetMs === null ? 0 : wallOffsetMs + lastTimestamp * 1_000 - timeOrigin,
    entries: (timeOrigin: number): NetworkEntry[] => [...byId.values()].map((record) => {
      const startMs = record.wallTimeMs - timeOrigin
      return {
        url: record.url,
        startMs,
        endMs: record.endAt === undefined ? null : startMs + (record.endAt - record.timestamp) * 1_000,
        bytes: record.bytes,
        fromCache: record.fromCache,
        failed: record.failed,
      }
    }),
  }
}
