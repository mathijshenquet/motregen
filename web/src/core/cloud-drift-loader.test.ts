import { describe, expect, it, vi } from 'vitest'
import { CloudDriftLoader } from './cloud-drift-loader'
import { cloudDriftAt, cloudDriftPath } from './cloud-map'

const HOUR = 3_600_000
const velocity = (epoch: number): readonly [number, number] => [10000 + epoch / HOUR * 100, -5000]

describe('progressive cloud trajectory', () => {
  it('shows the local window without requesting distant forecast hours', async () => {
    const load = vi.fn(async (epoch: number) => {
      if (epoch > 6 * HOUR) throw new Error('distant forecast is unavailable')
      return velocity(epoch)
    })
    const drift = new CloudDriftLoader(0, 48 * HOUR, 4 * HOUR, load)
    await drift.ensure(4 * HOUR)
    expect(load.mock.calls.map(([epoch]) => epoch)).toEqual([3 * HOUR, 4 * HOUR, 5 * HOUR])
    expect(drift.path.map((sample) => sample.epoch)).toEqual([3 * HOUR, 4 * HOUR, 5 * HOUR])
  })

  it('keeps both birth banks unchanged while extending in either direction and seeking back', async () => {
    const drift = new CloudDriftLoader(0, 12 * HOUR, 4 * HOUR, async (epoch) => velocity(epoch))
    const path = await drift.ensure(4 * HOUR)
    const epochs = Array.from({ length: 121 }, (_, minute) => 3 * HOUR + minute * 60000)
    const positions = epochs.map((epoch) => cloudDriftAt(path, epoch))
    await Promise.all([drift.ensure(10 * HOUR), drift.ensure(HOUR), drift.ensure(4 * HOUR)])
    expect(drift.path).toBe(path)
    expect(epochs.map((epoch) => cloudDriftAt(path, epoch))).toEqual(positions)
    const reference = cloudDriftPath(drift.path.map(({ epoch, velocity }) => ({ epoch, velocity })))
    const offset = cloudDriftAt(reference, 4 * HOUR)
    for (const epoch of epochs) {
      const expected = cloudDriftAt(reference, epoch)
      const actual = cloudDriftAt(path, epoch)
      expect(actual[0]).toBeCloseTo(expected[0] - offset[0], 6)
      expect(actual[1]).toBeCloseTo(expected[1] - offset[1], 6)
    }
  })

  it('fills the background only when enabled, without changing already visible positions', async () => {
    const load = vi.fn(async (epoch: number) => velocity(epoch))
    const drift = new CloudDriftLoader(0, 8 * HOUR, 4 * HOUR, load)
    await drift.ensure(4 * HOUR)
    const before = cloudDriftAt(drift.path, 4.25 * HOUR)
    drift.prefetch(() => true)
    await vi.waitFor(() => expect(drift.path).toHaveLength(9))
    expect(cloudDriftAt(drift.path, 4.25 * HOUR)).toEqual(before)
    expect(load).toHaveBeenCalledTimes(9)
  })

  it('preserves the anchor when a refreshed manifest drops history', async () => {
    const old = new CloudDriftLoader(0, 12 * HOUR, 4 * HOUR, async (epoch) => velocity(epoch))
    await old.ensure(4 * HOUR)
    const refreshed = new CloudDriftLoader(HOUR, 13 * HOUR, 4 * HOUR, async (epoch) => velocity(epoch), old.path)
    await refreshed.ensure(4 * HOUR)
    for (const epoch of [3 * HOUR, 3.75 * HOUR, 4.25 * HOUR, 5 * HOUR]) {
      expect(cloudDriftAt(refreshed.path, epoch)).toEqual(cloudDriftAt(old.path, epoch))
    }
  })

  it('retries failed loads without partially changing the trajectory', async () => {
    let fail = true
    const drift = new CloudDriftLoader(0, 8 * HOUR, 4 * HOUR, async (epoch) => {
      if (fail && epoch === 5 * HOUR) throw new Error('network')
      return velocity(epoch)
    })
    await expect(drift.ensure(4 * HOUR)).rejects.toThrow('network')
    expect(drift.path).toEqual([])
    fail = false
    await drift.ensure(4 * HOUR)
    expect(drift.path).toHaveLength(3)
  })
})
