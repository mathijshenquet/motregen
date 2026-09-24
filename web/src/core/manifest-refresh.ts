import type { Manifest, TimelineFrame } from './contract'
import { timelineCursorAtEpoch, timelineEpochAtCursor } from './time-model'

export const manifestRefreshIntervalMs = 60_000
export const manifestFastRefreshMs = 15_000

// Een nieuw radarframe verschijnt elke 5 min, op prod 2026-09-24 164–178 s na zijn
// scantijd (LOG u17; T2h mat ~100 s). Vanaf de vroegst verwachte publicatie pollt
// de client een paar minuten elke 15 s (revalidatie via ETag, 304 zonder body),
// daarbuiten volstaat de minuutpoll; zo verdwijnt tot 60 s pollvertraging.
const RADAR_CADENCE_MS = 5 * 60_000
const EARLIEST_PUBLICATION_MS = 90_000
const PUBLICATION_WINDOW_MS = 4 * 60_000

export function nextManifestRefreshDelay(now: number, radarEpoch: number | undefined): number {
  if (radarEpoch === undefined) return manifestRefreshIntervalMs
  const due = radarEpoch + RADAR_CADENCE_MS + EARLIEST_PUBLICATION_MS
  if (now < due) return Math.max(1_000, Math.min(manifestRefreshIntervalMs, due - now))
  if (now < due + PUBLICATION_WINDOW_MS) return manifestFastRefreshMs
  return manifestRefreshIntervalMs
}

export interface ManifestRefreshHost {
  setTimeout: (callback: () => void, delay: number) => number
  clearTimeout: (handle: number | undefined) => void
  visibilityState: () => DocumentVisibilityState
  addVisibilityListener: (callback: () => void) => void
  removeVisibilityListener: (callback: () => void) => void
}

export function scheduleManifestRefresh(
  refresh: () => Promise<void>,
  host: ManifestRefreshHost,
  delay: () => number = () => manifestRefreshIntervalMs,
): () => void {
  let pending: Promise<void> | undefined
  let timer: number | undefined
  let stopped = false
  const arm = () => {
    host.clearTimeout(timer)
    if (!stopped) timer = host.setTimeout(run, delay())
  }
  const run = () => {
    if (pending) return
    host.clearTimeout(timer)
    pending = refresh().finally(() => { pending = undefined; arm() })
    void pending.catch(() => undefined)
  }
  const visibilityChanged = () => { if (host.visibilityState() === 'visible') run() }
  arm()
  host.addVisibilityListener(visibilityChanged)
  return () => {
    stopped = true
    host.clearTimeout(timer)
    host.removeVisibilityListener(visibilityChanged)
  }
}

export function isNewerManifest(current: Manifest, candidate: Manifest): boolean {
  const currentGenerated = Date.parse(current.generated)
  const candidateGenerated = Date.parse(candidate.generated)
  return Number.isFinite(candidateGenerated) && (!Number.isFinite(currentGenerated) || candidateGenerated > currentGenerated)
}

export function cursorAfterTimelineRefresh(
  previous: TimelineFrame[],
  next: TimelineFrame[],
  cursor: number,
): number {
  return timelineCursorAtEpoch(next, timelineEpochAtCursor(previous, cursor))
}

export function reconcileTimelineSeries(
  previous: TimelineFrame[],
  next: TimelineFrame[],
  values: Array<number | null>,
  loaded = previous.map(() => true),
): { values: Array<number | null>; loaded: boolean[] } {
  const previousIndexes = new Map(previous.map((frame, index) => [frameKey(frame), index]))
  const nextValues = new Array<number | null>(next.length).fill(null)
  const nextLoaded = next.map(() => false)
  for (let index = 0; index < next.length; index++) {
    const previousIndex = previousIndexes.get(frameKey(next[index]!))
    if (previousIndex === undefined || !loaded[previousIndex]) continue
    nextValues[index] = values[previousIndex] ?? null
    nextLoaded[index] = true
  }
  return { values: nextValues, loaded: nextLoaded }
}

function frameKey(frame: TimelineFrame): string {
  return `${frame.chunk.url}#${frame.frameIndex}`
}
