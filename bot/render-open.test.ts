import type { Page } from 'playwright'
import { afterEach, expect, it, vi } from 'vitest'
import { openRenderPage } from './render-open.js'

const manifest = { version: 0, generated: '2026-10-07T12:00:00Z', now: '2026-10-07T12:00:00Z', chunks: [] }

function setup() {
  const page = { addInitScript: vi.fn(), goto: vi.fn(), waitForFunction: vi.fn() }
  const output = vi.spyOn(console, 'info').mockImplementation(() => undefined)
  return { page, output, open: () => openRenderPage(page as unknown as Page, 'https://motregen.nl', 'weather', manifest, Date.parse(manifest.now)) }
}

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

it('retries a loaded-host timeout after five seconds while preserving the requested generation', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'performance'] })
  const { page, output, open } = setup()
  const timeout = Object.assign(new Error('navigation timed out'), { name: 'TimeoutError' })
  page.goto.mockRejectedValueOnce(timeout).mockResolvedValueOnce(undefined)
  const result = open()
  await vi.advanceTimersByTimeAsync(4999)
  expect(page.goto).toHaveBeenCalledTimes(1)
  await vi.advanceTimersByTimeAsync(1)
  expect(await result).toBe(5000)
  expect(page.goto).toHaveBeenCalledTimes(2)
  expect(page.goto.mock.calls[1]).toEqual(page.goto.mock.calls[0])
  expect(page.goto.mock.calls[0]![1].timeout).toBe(90_000)
  expect(page.addInitScript).toHaveBeenCalledExactlyOnceWith(expect.any(Function), manifest)
  expect(output.mock.calls.map(([line]) => JSON.parse(line).event)).toEqual(['sequence-open-failed', 'sequence-open-retry', 'sequence-open'])
  expect(JSON.parse(output.mock.calls[2]![0])).toMatchObject({ generated: manifest.generated, attempt: 2, openMs: 5000 })
})

it('bounds two failed open attempts and preserves the original timeout for failure reporting', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'performance'] })
  const { page, output, open } = setup()
  const timeout = Object.assign(new Error('navigation timed out'), { name: 'TimeoutError' })
  page.goto.mockRejectedValue(timeout)
  const result = expect(open()).rejects.toBe(timeout)
  await vi.advanceTimersByTimeAsync(5000)
  await result
  expect(page.goto).toHaveBeenCalledTimes(2)
  expect(output.mock.calls.map(([line]) => JSON.parse(line).event)).toEqual(['sequence-open-failed', 'sequence-open-retry', 'sequence-open-failed'])
})

it('shares one timeout budget between navigation and both readiness checks', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'performance'] })
  const { page, open } = setup()
  page.goto.mockImplementation(async () => { vi.advanceTimersByTime(20_000) })
  page.waitForFunction.mockImplementationOnce(async () => { vi.advanceTimersByTime(30_000) })
  expect(await open()).toBe(50_000)
  expect(page.waitForFunction.mock.calls[0]![2]).toEqual({ timeout: 70_000 })
  expect(page.waitForFunction.mock.calls[1]![2]).toEqual({ timeout: 40_000 })
})
