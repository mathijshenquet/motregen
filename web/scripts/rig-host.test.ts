import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadavg } from 'node:os'
import { waitForQuietHost } from './rig-host'

vi.mock('node:os', () => ({ loadavg: vi.fn() }))

afterEach(() => {
  vi.useRealTimers()
  vi.resetAllMocks()
})

describe('rustig meetvenster', () => {
  it('weigert ook een loadavg van precies 8 wanneer de wachttijd verloopt', async () => {
    vi.mocked(loadavg).mockReturnValue([8, 0, 0])
    expect(await waitForQuietHost(0, () => {})).toBe(false)
  })

  it('wacht tussen opnames tot de loadavg onder 8 zakt', async () => {
    vi.useFakeTimers()
    vi.mocked(loadavg).mockReturnValue([9, 0, 0])
    const waiting = waitForQuietHost(120_000, () => {})
    vi.mocked(loadavg).mockReturnValue([7.9, 0, 0])
    await vi.advanceTimersByTimeAsync(20_000)
    expect(await waiting).toBe(true)
  })
})
