import type { Manifest, TimelineFrame } from './contract'
import { timelineCursorAtEpoch, timelineEpochAtCursor } from './time-model'

export const manifestRefreshIntervalMs = 60_000

export interface ManifestRefreshHost {
  setInterval: (callback: () => void, interval: number) => number
  clearInterval: (handle: number) => void
  visibilityState: () => DocumentVisibilityState
  addVisibilityListener: (callback: () => void) => void
  removeVisibilityListener: (callback: () => void) => void
}

export function scheduleManifestRefresh(
  refresh: () => Promise<void>,
  host: ManifestRefreshHost,
  interval = manifestRefreshIntervalMs,
): () => void {
  let pending: Promise<void> | undefined
  const run = () => {
    if (pending) return
    pending = refresh().finally(() => { pending = undefined })
    void pending.catch(() => undefined)
  }
  const visibilityChanged = () => { if (host.visibilityState() === 'visible') run() }
  const timer = host.setInterval(run, interval)
  host.addVisibilityListener(visibilityChanged)
  return () => {
    host.clearInterval(timer)
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
