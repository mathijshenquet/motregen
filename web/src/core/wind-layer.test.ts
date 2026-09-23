import { describe, expect, it } from 'vitest'
import {
  advanceLife,
  clipTrail,
  expectedLifetime,
  DEFAULT_WIND_TUNING,
  lifeAlpha,
  loadWindTuning,
  particleCountForViewport,
  pickSpawn,
  sanitizeWindTuning,
  shortTrailAlpha,
  spawnAcceptance,
  storeWindTuning,
  trailIndices,
  viewportParticleRetention,
  WIND_TUNING_CONTROLS,
  WIND_TUNING_STORAGE_KEY,
  windColor,
  windScreenSpeed,
  windZoomCompensation,
  type ParticleLife,
  type WindTuning,
} from './wind-layer'

const frame = 1 / 60

function simulate(speedPx: number, tuning: WindTuning = DEFAULT_WIND_TUNING, distance = tuning.trailDistance) {
  const life: ParticleLife = { age: 0, travelled: 0, dyingAt: -1, expected: 0 }
  const alphas: number[] = []
  while (advanceLife(life, speedPx * frame, frame, distance, tuning)) {
    alphas.push(lifeAlpha(life, tuning))
    if (life.age > 60) throw new Error('particle sterft nooit')
  }
  return { age: life.age, travelled: life.travelled, alphas }
}

describe('wind particle lifetime', () => {
  it('travels the same screen distance per life regardless of wind speed', () => {
    const tuning = DEFAULT_WIND_TUNING
    const distances: number[] = []
    for (const windSpeed of [3, 6, 9, 12, 15]) {
      const speedPx = windScreenSpeed(windSpeed)
      const lifetime = tuning.trailDistance / speedPx
      expect(lifetime, `${windSpeed} m/s ligt binnen de leeftijdsgrenzen`).toBeGreaterThan(tuning.minAge)
      expect(lifetime).toBeLessThan(tuning.maxAge)
      const { travelled } = simulate(speedPx)
      distances.push(travelled)
      expect(travelled).toBeGreaterThan(tuning.trailDistance - 2 * speedPx * frame)
      expect(travelled).toBeLessThan(tuning.trailDistance + 2 * speedPx * frame)
    }
    expect(Math.max(...distances) / Math.min(...distances)).toBeLessThan(1.1)
  })

  it('never dies before the minimum age, so no stub trails appear', () => {
    const tuning = DEFAULT_WIND_TUNING
    for (const speedPx of [0, 5, 50, 200, 1_000, 5_000]) {
      const { age } = simulate(speedPx)
      expect(age, `${speedPx} px/s`).toBeGreaterThanOrEqual(tuning.minAge - frame)
      expect(age).toBeLessThanOrEqual(tuning.maxAge + 2 * frame)
    }
  })

  it('caps life at the maximum age in calm air and dims trails shorter than the minimum', () => {
    const tuning = DEFAULT_WIND_TUNING
    const calm = simulate(2)
    expect(calm.age).toBeCloseTo(tuning.maxAge, 1)
    expect(shortTrailAlpha(2 * tuning.maxAge, tuning.minTrail)).toBeLessThan(0.3)
    expect(shortTrailAlpha(tuning.minTrail, tuning.minTrail)).toBe(1)
    expect(shortTrailAlpha(0, 0)).toBe(1)
  })

  it('fades in after spawn and out before death without abrupt alpha steps', () => {
    for (const speedPx of [20, 60, 150]) {
      const { alphas } = simulate(speedPx)
      expect(alphas[0]).toBeLessThan(0.05)
      expect(Math.max(...alphas)).toBeCloseTo(1, 2)
      expect(alphas.at(-1)).toBeLessThan(0.05)
      for (let index = 1; index < alphas.length; index++) {
        expect(Math.abs(alphas[index]! - alphas[index - 1]!), `stap ${index} bij ${speedPx} px/s`).toBeLessThan(0.15)
      }
    }
  })

  it('stays invisible and stationary while its staggered birth is pending', () => {
    const life: ParticleLife = { age: -0.5, travelled: 0, dyingAt: -1, expected: 0 }
    expect(advanceLife(life, 0, frame, 80, DEFAULT_WIND_TUNING)).toBe(true)
    expect(lifeAlpha(life, DEFAULT_WIND_TUNING)).toBe(0)
    expect(life.travelled).toBe(0)
  })

  it('spawns in inverse proportion to lifetime so visible density does not depend on wind speed', () => {
    const tuning = DEFAULT_WIND_TUNING
    for (const speedPx of [0, 10, 40, 100, 400]) {
      expect(spawnAcceptance(speedPx, tuning) * expectedLifetime(speedPx, tuning)).toBeCloseTo(tuning.minAge)
      expect(spawnAcceptance(speedPx, tuning)).toBeLessThanOrEqual(1)
    }
    // 1D-wereld: west (x < 0,5) harde wind, oost zwakke wind. Tijdgemiddelde bezetting per helft moet gelijk zijn.
    let state = 12345
    const random = () => (state = (state * 1_103_515_245 + 12_345) % 2 ** 31) / 2 ** 31
    const speedAt = (x: number) => x < 0.5 ? windScreenSpeed(16) : windScreenSpeed(3)
    const bounds = { west: 0, north: 0, east: 1, south: 1 }
    const occupancy = [0, 0]
    for (let particle = 0; particle < 200; particle++) {
      let elapsed = 0
      while (elapsed < 200) {
        const [x] = pickSpawn(bounds, 32, random, (candidateX) => spawnAcceptance(speedAt(candidateX), tuning))
        const lifetime = expectedLifetime(speedAt(x), tuning)
        occupancy[x < 0.5 ? 0 : 1] += lifetime
        elapsed += lifetime
      }
    }
    expect(occupancy[0]! / occupancy[1]!).toBeGreaterThan(0.95)
    expect(occupancy[0]! / occupancy[1]!).toBeLessThan(1.05)
  })

  it('avoids spawning where there is no wind data unless every candidate lacks it', () => {
    let state = 7
    const random = () => (state = (state * 16_807) % 2_147_483_647) / 2_147_483_647
    const bounds = { west: 0, north: 0, east: 1, south: 1 }
    for (let draw = 0; draw < 200; draw++) {
      const [x] = pickSpawn(bounds, 32, random, (candidateX) => candidateX < 0.5 ? 0 : 1)
      if (x < 0.5) expect.fail('spawn in gebied zonder wind terwijl er alternatieven waren')
    }
    const [x, y] = pickSpawn(bounds, 32, random, () => 0)
    expect(x).toBeGreaterThanOrEqual(0)
    expect(y).toBeLessThanOrEqual(1)
  })

  it('keeps screen speed tied to wind speed and zoom-independent', () => {
    expect(windScreenSpeed(10)).toBeCloseTo(2 * windScreenSpeed(5))
    expect(windScreenSpeed(10, 2)).toBeCloseTo(2 * windScreenSpeed(10))
    expect(windZoomCompensation(6.4)).toBe(1)
    expect(windZoomCompensation(7.4)).toBeCloseTo(0.5)
    expect(windZoomCompensation(5.4)).toBeCloseTo(2)
  })
})

describe('wind trail geometry', () => {
  it('clips the polyline to the trail distance and tapers towards the tail', () => {
    const xs = [0, 10, 20, 30, 40]
    const ys = [0, 0, 0, 0, 0]
    const outX = new Float64Array(5)
    const outY = new Float64Array(5)
    const fade = new Float32Array(5)
    const count = clipTrail(xs, ys, 5, 25, 1, outX, outY, fade)
    expect(count).toBe(4)
    expect(outX[3]).toBeCloseTo(25)
    expect(Array.from(fade.slice(0, 4))).toEqual([1, 0.6000000238418579, 0.20000000298023224, 0])
    expect(clipTrail(xs, ys, 5, 100, 0, outX, outY, fade)).toBe(5)
    expect(fade[4]).toBe(1)
  })

  it('skips zero-length segments', () => {
    const outX = new Float64Array(4)
    const outY = new Float64Array(4)
    const fade = new Float32Array(4)
    expect(clipTrail([0, 0, 3], [0, 0, 4], 3, 100, 1, outX, outY, fade)).toBe(2)
    expect(clipTrail([0], [0], 1, 100, 1, outX, outY, fade)).toBe(1)
  })

  it('indexes two triangles per polyline segment inside each particle slot', () => {
    const indices = trailIndices(2, 3)
    expect(Array.from(indices)).toEqual([
      0, 1, 2, 1, 3, 2, 2, 3, 4, 3, 5, 4,
      6, 7, 8, 7, 9, 8, 8, 9, 10, 9, 11, 10,
    ])
  })
})

describe('wind tuning', () => {
  it('reduces the default intensity by a fifth', () => {
    expect(DEFAULT_WIND_TUNING.intensity).toBe(0.8)
    for (const control of WIND_TUNING_CONTROLS) {
      expect(DEFAULT_WIND_TUNING[control.key], control.key).toBeGreaterThanOrEqual(control.min)
      expect(DEFAULT_WIND_TUNING[control.key], control.key).toBeLessThanOrEqual(control.max)
    }
    expect(WIND_TUNING_CONTROLS.map((control) => control.key).sort()).toEqual(Object.keys(DEFAULT_WIND_TUNING).sort())
  })

  it('sanitizes stored tuning: clamps ranges, ignores junk, fills defaults', () => {
    expect(sanitizeWindTuning(undefined)).toEqual(DEFAULT_WIND_TUNING)
    expect(sanitizeWindTuning('nee')).toEqual(DEFAULT_WIND_TUNING)
    const tuned = sanitizeWindTuning({ trailDistance: 10_000, intensity: 'veel', fadeIn: 0.5, thickness: 3 })
    expect(tuned.trailDistance).toBe(300)
    expect(tuned.intensity).toBe(DEFAULT_WIND_TUNING.intensity)
    expect(tuned.fadeIn).toBe(0.5)
    expect('thickness' in tuned).toBe(false)
  })

  it('persists only non-default tuning so later default changes still reach users', () => {
    const values = new Map<string, string>()
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => void values.set(key, value),
      removeItem: (key: string) => void values.delete(key),
    }
    storeWindTuning({ ...DEFAULT_WIND_TUNING, intensity: 0.5 }, storage)
    expect(loadWindTuning(storage).intensity).toBe(0.5)
    storeWindTuning({ ...DEFAULT_WIND_TUNING }, storage)
    expect(values.has(WIND_TUNING_STORAGE_KEY)).toBe(false)
    values.set(WIND_TUNING_STORAGE_KEY, '{kapot')
    expect(loadWindTuning(storage)).toEqual(DEFAULT_WIND_TUNING)
  })
})

describe('wind presentation', () => {
  it('uses white particles on dark and the Beaufort contrast ramp on light', () => {
    const light = windColor(8, 'light')
    const dark = windColor(8, 'dark')
    expect(light).not.toEqual(dark)
    expect(dark).toEqual([1, 1, 1])
    expect(Math.max(...light)).toBeLessThan(0.65)
    expect(windColor(25, 'light')).not.toEqual(light)
  })

  it('keeps particle density tied to screen area', () => {
    expect(particleCountForViewport(1_000, 1_000)).toBe(620)
    expect(particleCountForViewport(500, 500)).toBeLessThan(620)
    expect(particleCountForViewport(1_000, 1_000, 1_200)).toBe(1_200)
  })

  it('redistributes only the excess particle density when the viewport expands', () => {
    const focused = { west: 0.25, north: 0.25, east: 0.75, south: 0.75 }
    const full = { west: 0, north: 0, east: 1, south: 1 }
    expect(viewportParticleRetention(focused, full)).toBe(0.25)
    expect(viewportParticleRetention(full, focused)).toBe(1)
    expect(viewportParticleRetention(full, full)).toBe(1)
  })
})
