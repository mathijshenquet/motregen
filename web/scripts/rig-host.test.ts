import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadavg } from 'node:os'
import { permittedStartLoad, rigBuild, waitForQuietHost } from './rig-host'

vi.mock('node:os', () => ({ loadavg: vi.fn() }))

afterEach(() => {
  vi.useRealTimers()
  vi.resetAllMocks()
  vi.unstubAllEnvs()
})

describe('rustig meetvenster', () => {
  it('houdt eigen kaart op productie-URLs voor SW-precache en rangecache', () => {
    expect(rigBuild(4393, 8393, 'own').buildCommand).not.toContain('VITE_BASEMAP_STYLE_URL')
    expect(rigBuild(4393, 8393, 'fixture').buildCommand).toContain('VITE_BASEMAP_STYLE_URL=http://127.0.0.1:8393/style.json')
  })
  it('accepteert de absolute grens 8 en weigert daarboven', async () => {
    vi.mocked(loadavg).mockReturnValue([8, 0, 0])
    expect(await waitForQuietHost(0, () => {})).toBe(true)
    expect(permittedStartLoad(8.01)).toBe(false)
  })

  it('staat alleen expliciet gepaarde opnames tot en met 16 toe', () => {
    expect(permittedStartLoad(12)).toBe(false)
    vi.stubEnv('MOTREGEN_RIG_PAIRED', '1')
    expect(permittedStartLoad(16)).toBe(true)
    expect(permittedStartLoad(16.01)).toBe(false)
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
