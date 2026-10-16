import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Grid } from './contract'
import { RainContourTracer, traceRainContours, type RainContourMessage } from './rain-contours'

const grid: Grid = { crs: 'EPSG:3857', x0: 0, y0: 0, dx: 1000, dy: -1000, width: 40, height: 40 }
const frame = Uint8Array.from({ length: grid.width * grid.height }, (_, index) =>
  Math.max(0, Math.round(200 - 12 * Math.hypot(index % grid.width - 20, Math.floor(index / grid.width) - 20))))

afterEach(() => vi.unstubAllGlobals())

describe('rain contours', () => {
  it('traces only the requested half-byte thresholds, with smooth closed rings', () => {
    const result = traceRainContours(frame, grid, [31.5, 132.5, 184.5])
    expect(result.levels.map((level) => level.level)).toEqual([31.5, 132.5, 184.5])
    for (const level of result.levels) {
      expect(level.data.length).toBeGreaterThan(0)
      const radius = (200 - level.level) / 12
      for (let offset = 0; offset < level.data.length; offset += 6) {
        expect(Math.hypot(level.data[offset]! - 20, level.data[offset + 1]! - 20)).toBeCloseTo(radius, 0)
      }
      expect(Array.from(level.data.subarray(0, 2))).toEqual(Array.from(level.data.subarray(-4, -2)))
    }
  })

  it('treats no-data as dry without changing the decoded frame', () => {
    const missing = new Uint8Array(frame.length).fill(255)
    expect(traceRainContours(missing, grid, [31.5]).levels[0]!.data).toHaveLength(0)
    expect(missing[0]).toBe(255)
    const dry = frame.slice()
    const noData = frame.slice()
    dry.fill(0, 700, 850)
    noData.fill(255, 700, 850)
    expect(traceRainContours(noData, grid, [31.5, 132.5]).levels).toEqual(traceRainContours(dry, grid, [31.5, 132.5]).levels)
  })

  it('reuses frame geometry across draws, and invalidates it for a different filter or thresholds', () => {
    vi.stubGlobal('Worker', undefined)
    const tracer = new RainContourTracer(grid, vi.fn())
    const read = vi.fn(() => frame.slice())
    const first = tracer.get(frame, 'blur-5', [31.5], read)
    expect(first.result).toBeDefined()
    for (let draw = 0; draw < 20; draw++) expect(tracer.get(frame, 'blur-5', [31.5], read)).toBe(first)
    expect(read).toHaveBeenCalledTimes(1)
    expect(tracer.get(frame, 'blur-9', [31.5], read)).not.toBe(first)
    expect(tracer.get(frame, 'blur-5', [31.5, 132.5], read)).not.toBe(first)
    expect(read).toHaveBeenCalledTimes(3)
    tracer.dispose()
  })

  it('keeps one worker job in flight and drops queued frames that were scrubbed past', () => {
    const posted: RainContourMessage[] = []
    let reply: (event: { data: ReturnType<typeof traceRainContours> }) => void
    const terminate = vi.fn()
    vi.stubGlobal('Worker', class {
      set onmessage(callback: typeof reply) { reply = callback }
      postMessage(message: RainContourMessage) { posted.push(message) }
      terminate = terminate
    })
    const repaint = vi.fn()
    const tracer = new RainContourTracer(grid, repaint)
    const first = tracer.get(frame, 'blur-5', [31.5], () => frame.slice())
    const skipped = tracer.get(frame.slice(), 'blur-5', [31.5], () => frame.slice())
    const lastFrame = frame.slice()
    const last = tracer.get(lastFrame, 'blur-5', [31.5], () => lastFrame.slice())
    tracer.retain([last])
    expect(posted).toHaveLength(1)
    expect(skipped.pending).toBe(false)
    reply!({ data: traceRainContours(posted[0]!.bytes, grid, posted[0]!.levels) })
    expect(first.result).toBeDefined()
    expect(posted).toHaveLength(2)
    reply!({ data: traceRainContours(posted[1]!.bytes, grid, posted[1]!.levels) })
    expect(last.result).toBeDefined()
    expect(repaint).toHaveBeenCalledTimes(2)
    tracer.dispose()
    expect(terminate).toHaveBeenCalledOnce()
  })
})
