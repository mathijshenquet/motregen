import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test, type CDPSession } from '@playwright/test'
import type { LoadTraceSnapshot } from '../src/core/perf'
import { analyzeLoadProfile, renderLoadTimeline, type HistogramSample, type NetworkRecord, type RawLoadProfile } from './load-profile-report'
import { applyEmulation, performanceProfile } from './profiles'

const target = process.env.MOTREGEN_PROFILE_TARGET ?? 'synth'
const outputDirectory = join(dirname(fileURLToPath(import.meta.url)), 'profiles')

test('cold load profile: histogram fill and data requests', async ({ page, context, baseURL }, testInfo) => {
  const profile = performanceProfile(testInfo.project.name)
  const fillTimeoutMs = profile.network ? 150_000 : 90_000
  testInfo.setTimeout(fillTimeoutMs + 60_000)

  const cdp = await context.newCDPSession(page)
  const network = await recordNetwork(cdp)
  await applyEmulation(cdp, profile)
  await page.addInitScript(installHistogramSampler)

  const startedAt = new Date().toISOString()
  await page.goto('/', { waitUntil: 'commit' })
  let complete = true
  try {
    await page.waitForFunction(() => {
      const samples = (window as typeof window & { __loadSamples?: HistogramSample[] }).__loadSamples ?? []
      const last = samples.at(-1)
      return last !== undefined && last.bars > 0 && last.pending === 0
    }, undefined, { timeout: fillTimeoutMs, polling: 250 })
  } catch {
    complete = false
  }
  await page.waitForTimeout(1_000)

  const page_ = await page.evaluate(() => {
    const win = window as typeof window & {
      __loadSamples?: HistogramSample[]
      __motregenPerf?: { snapshot: () => { ttfrMs: number | null }; loads?: { snapshot: () => LoadTraceSnapshot } }
    }
    return {
      samples: win.__loadSamples ?? [],
      ttfrMs: win.__motregenPerf?.snapshot().ttfrMs ?? null,
      trace: win.__motregenPerf?.loads?.snapshot() ?? null,
      timeOrigin: performance.timeOrigin,
    }
  })
  const raw: RawLoadProfile = {
    target,
    origin: baseURL ?? '',
    profile: profile.id,
    profileLabel: profile.label,
    emulation: profile.network?.label ?? 'Geen netwerkemulatie',
    cpuThrottleRate: profile.cpuThrottleRate,
    startedAt,
    complete,
    fillTimeoutMs,
    ttfrMs: page_.ttfrMs,
    samples: page_.samples,
    trace: page_.trace,
    network: network.records(page_.timeOrigin),
  }
  const analysis = analyzeLoadProfile(raw)
  const stamp = startedAt.replace(/[:.]/g, '-')
  const base = join(outputDirectory, `${target}-${profile.id}-${stamp}`)
  mkdirSync(outputDirectory, { recursive: true })
  writeFileSync(`${base}.json`, JSON.stringify({ raw, analysis }, null, 2))
  writeFileSync(`${base}.md`, renderLoadTimeline(analysis))
  console.log(`${profile.label}: histogram ${complete ? 'vol' : 'NIET vol'} na ${analysis.milestones.histogramFullMs?.toFixed(0) ?? '—'} ms → ${base}.md`)
})

/** Draait in de pagina vóór de app: bemonstert de histogrambalken bij iedere DOM-wijziging. */
function installHistogramSampler(): void {
  const samples: HistogramSample[] = []
  ;(window as typeof window & { __loadSamples?: HistogramSample[] }).__loadSamples = samples
  let queued = false
  const sample = () => {
    queued = false
    const bars = document.querySelectorAll('rect.rain-bar').length
    const pending = document.querySelectorAll('rect.rain-bar.pending').length
    const stage = document.querySelector('[role="slider"][aria-label="Tijd"]')?.getAttribute('data-load-stage') ?? null
    const last = samples.at(-1)
    if (last && last.bars === bars && last.pending === pending && last.stage === stage) return
    samples.push({ t: performance.now(), bars, pending, stage })
  }
  const observer = new MutationObserver(() => {
    if (queued) return
    queued = true
    queueMicrotask(sample)
  })
  const start = () => observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'data-load-stage'] })
  if (document.documentElement) start(); else document.addEventListener('DOMContentLoaded', start)
}

async function recordNetwork(cdp: CDPSession): Promise<{ records: (timeOrigin: number) => NetworkRecord[] }> {
  const byId = new Map<string, { url: string; range: string | null; wallTime: number; timestamp: number; status?: number; fromCache?: boolean; responseAt?: number; endAt?: number; bytes: number; failed?: string }>()
  cdp.on('Network.requestWillBeSent', (event) => {
    if (byId.has(event.requestId)) return
    const headers = event.request.headers as Record<string, string>
    byId.set(event.requestId, {
      url: event.request.url,
      range: headers.Range ?? headers.range ?? null,
      wallTime: event.wallTime * 1_000,
      timestamp: event.timestamp,
      bytes: 0,
    })
  })
  cdp.on('Network.responseReceived', (event) => {
    const record = byId.get(event.requestId)
    if (!record) return
    record.status = event.response.status
    record.fromCache = event.response.fromDiskCache || event.response.fromServiceWorker || event.response.fromPrefetchCache
    record.responseAt = event.timestamp
  })
  cdp.on('Network.loadingFinished', (event) => {
    const record = byId.get(event.requestId)
    if (!record) return
    record.endAt = event.timestamp
    record.bytes = event.encodedDataLength
  })
  cdp.on('Network.loadingFailed', (event) => {
    const record = byId.get(event.requestId)
    if (!record) return
    record.endAt = event.timestamp
    record.failed = event.errorText
  })
  await cdp.send('Network.enable')
  return {
    // CDP-timestamps zijn monotone seconden; wallTime van de start plaatst ze op de paginaklok.
    records: (timeOrigin) => [...byId.values()].map((record) => {
      const startMs = record.wallTime - timeOrigin
      const at = (timestamp: number | undefined) => timestamp === undefined ? null : startMs + (timestamp - record.timestamp) * 1_000
      return {
        url: record.url,
        range: record.range,
        startMs,
        responseMs: at(record.responseAt),
        endMs: at(record.endAt),
        bytes: record.bytes,
        status: record.status ?? null,
        fromCache: record.fromCache ?? false,
        failed: record.failed ?? null,
      }
    }),
  }
}
