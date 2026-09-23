import { describe, expect, it } from 'vitest'
import {
  advanceLife,
  bufferDecay,
  DEFAULT_WIND_TUNING,
  expectedLifetime,
  headAlpha,
  loadWindTuning,
  particleCountForViewport,
  pickSpawn,
  sanitizeWindTuning,
  spawnAcceptance,
  storeWindTuning,
  trailFloor,
  trailTargetSize,
  trailUvTransform,
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
  const life: ParticleLife = { age: 0, travelled: 0, distance, remaining: distance }
  const alphas: number[] = []
  // Inkt die de kop in de buffer stempelt: alpha × afgelegde lengte.
  let ink = 0
  while (advanceLife(life, speedPx * frame, frame, tuning)) {
    const alpha = headAlpha(life, tuning)
    alphas.push(alpha)
    ink += alpha * speedPx * frame
    if (life.age > 60) throw new Error('particle sterft nooit')
  }
  return { age: life.age, travelled: life.travelled, alphas, ink }
}

describe('wind particle life', () => {
  it('travels the same screen distance per life regardless of wind speed', () => {
    const tuning = DEFAULT_WIND_TUNING
    for (const windSpeed of [3, 6, 9, 12, 15]) {
      const speedPx = windScreenSpeed(windSpeed)
      expect(tuning.trailDistance / speedPx, `${windSpeed} m/s blijft onder maxAge`).toBeLessThan(tuning.maxAge)
      const { travelled } = simulate(speedPx)
      expect(travelled).toBeGreaterThan(tuning.trailDistance - 2 * speedPx * frame)
      expect(travelled).toBeLessThan(tuning.trailDistance + 2 * speedPx * frame)
    }
  })

  it('stamps the same ink per life regardless of wind speed, so the buffer does not favour fast wind', () => {
    const inks = [3, 6, 9, 12, 15].map((windSpeed) => simulate(windScreenSpeed(windSpeed)).ink)
    expect(Math.max(...inks) / Math.min(...inks)).toBeLessThan(1.05)
  })

  it('ramps the head in over fadeInPx and out over fadeOutPx without abrupt steps', () => {
    const tuning = DEFAULT_WIND_TUNING
    for (const speedPx of [20, 60, 150]) {
      const { alphas } = simulate(speedPx)
      // Smoothstep stijgt hooguit 1,5× zo snel als lineair: grens per frame = 1,5 × stap / kortste fade.
      const maxStep = 1.5 * speedPx * frame / Math.min(tuning.fadeInPx, tuning.fadeOutPx)
      expect(alphas[0]).toBeLessThan(maxStep)
      expect(Math.max(...alphas)).toBeCloseTo(1, 2)
      expect(alphas.at(-1)).toBeLessThan(maxStep)
      for (let index = 1; index < alphas.length; index++) {
        expect(Math.abs(alphas[index]! - alphas[index - 1]!), `stap ${index} bij ${speedPx} px/s`).toBeLessThanOrEqual(maxStep)
      }
      // Volle kopintensiteit zodra fade-in klaar is en tot fade-out begint.
      const fullFrom = Math.ceil(tuning.fadeInPx / (speedPx * frame))
      const fullUntil = Math.floor((tuning.trailDistance - tuning.fadeOutPx) / (speedPx * frame)) - 1
      for (let index = fullFrom; index < fullUntil; index++) expect(alphas[index]).toBeCloseTo(1, 5)
    }
  })

  it('fades out and dies at maxAge in calm air instead of stamping a dot forever', () => {
    const tuning = DEFAULT_WIND_TUNING
    const slow = simulate(10)
    expect(slow.age).toBeCloseTo(tuning.maxAge, 1)
    expect(slow.alphas.at(-1)).toBeLessThan(0.05)
    // Windstil: niets afgelegd, dus ook niets gestempeld.
    expect(simulate(0).alphas.every((alpha) => alpha === 0)).toBe(true)
  })

  it('stays invisible and stationary while its staggered birth is pending', () => {
    const life: ParticleLife = { age: -0.5, travelled: 0, distance: 80, remaining: 80 }
    expect(advanceLife(life, 0, frame, DEFAULT_WIND_TUNING)).toBe(true)
    expect(headAlpha(life, DEFAULT_WIND_TUNING)).toBe(0)
    expect(life.travelled).toBe(0)
  })
})

describe('wind spawn balance', () => {
  // 1D-wereld: west (x < 0,5) harde wind, oost zwakke wind; N slots die steeds respawnen.
  function spawnWorld(spawnBalance: number) {
    const tuning = { ...DEFAULT_WIND_TUNING, spawnBalance }
    let state = 12345
    const random = () => (state = (state * 1_103_515_245 + 12_345) % 2 ** 31) / 2 ** 31
    const speedAt = (x: number) => x < 0.5 ? windScreenSpeed(16) : windScreenSpeed(3)
    const bounds = { west: 0, north: 0, east: 1, south: 1 }
    const occupancy = [0, 0]
    const ink = [0, 0]
    for (let particle = 0; particle < 200; particle++) {
      let elapsed = 0
      while (elapsed < 200) {
        const [x] = pickSpawn(bounds, 32, random, (candidateX) => spawnAcceptance(speedAt(candidateX), tuning))
        const lifetime = expectedLifetime(speedAt(x), tuning)
        occupancy[x < 0.5 ? 0 : 1] += lifetime
        ink[x < 0.5 ? 0 : 1] += Math.min(tuning.trailDistance, speedAt(x) * lifetime)
        elapsed += lifetime
      }
    }
    return { heads: occupancy[0]! / occupancy[1]!, ink: ink[0]! / ink[1]! }
  }

  it('balance 0 spawns uniformly: equal ink per area in fast and slow wind', () => {
    const { ink, heads } = spawnWorld(0)
    expect(ink).toBeGreaterThan(0.93)
    expect(ink).toBeLessThan(1.07)
    expect(heads).toBeLessThan(0.3)
  })

  it('balance 1 equalises head density instead, at the cost of more ink in fast wind', () => {
    const { ink, heads } = spawnWorld(1)
    expect(heads).toBeGreaterThan(0.93)
    expect(heads).toBeLessThan(1.07)
    expect(ink).toBeGreaterThan(3)
  })

  it('negative balance thins out fast wind, lowering its share of the ink', () => {
    const neutral = spawnWorld(0)
    const thinned = spawnWorld(-0.5)
    expect(thinned.ink).toBeLessThan(0.85 * neutral.ink)
    for (const balance of [-1, -0.5, 0, 0.5, 1]) {
      for (const speedPx of [0, 10, 100, 1_000]) {
        const acceptance = spawnAcceptance(speedPx, { ...DEFAULT_WIND_TUNING, spawnBalance: balance })
        expect(acceptance).toBeGreaterThan(0)
        expect(acceptance).toBeLessThanOrEqual(1)
      }
    }
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

describe('wind trail buffer', () => {
  it('fades by the same amount per second at any frame rate', () => {
    for (const hz of [30, 60, 120, 144]) {
      expect(bufferDecay(0.063, 1 / hz) ** hz, `${hz} Hz`).toBeCloseTo(0.063, 6)
    }
    expect(bufferDecay(0.063, 1 / 60)).toBeCloseTo(0.955, 3)
  })

  it('never lets an 8-bit trail pixel stall at a non-zero value (t3i ghosts)', () => {
    for (const hz of [30, 60, 120, 144]) {
      const seconds = 1 / hz
      const decay = bufferDecay(DEFAULT_WIND_TUNING.bufferFade, seconds)
      let value = 255
      let frames = 0
      while (value > 0) {
        const next = Math.round(Math.max(0, value / 255 * decay - trailFloor(seconds)) * 255)
        expect(next, `${hz} Hz bij ${value}`).toBeLessThan(value)
        value = next
        frames++
      }
      expect(frames / hz, `${hz} Hz`).toBeLessThan(3)
    }
  })

  it('sizes the trail target by canvas, scale and texture limit', () => {
    expect(trailTargetSize(1_080, 2_000, 4_096)).toEqual([1_080, 2_000])
    expect(trailTargetSize(1_080, 2_000, 4_096, 0.5)).toEqual([540, 1_000])
    expect(trailTargetSize(8_000, 4_000, 4_096)).toEqual([4_096, 2_048])
  })

  it('reprojects the previous buffer on pan and dims it on zoom-out', () => {
    const view = { centerX: 0.5, centerY: 0.5, zoom: 6, width: 800, height: 600 }
    expect(trailUvTransform(view, view)).toEqual({ scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0, retention: 1 })
    const panned = trailUvTransform(view, { ...view, centerX: 0.5 + 80 / (512 * 2 ** 6) })
    expect(panned.offsetX).toBeCloseTo(0.1)
    expect(trailUvTransform(view, { ...view, zoom: 5 }).retention).toBeCloseTo(0.25)
  })
})

describe('wind tuning', () => {
  it('exposes every tuning key as a control with its default in range', () => {
    for (const control of WIND_TUNING_CONTROLS) {
      expect(DEFAULT_WIND_TUNING[control.key], control.key).toBeGreaterThanOrEqual(control.min)
      expect(DEFAULT_WIND_TUNING[control.key], control.key).toBeLessThanOrEqual(control.max)
    }
    expect(WIND_TUNING_CONTROLS.map((control) => control.key).sort()).toEqual(Object.keys(DEFAULT_WIND_TUNING).sort())
  })

  it('sanitizes stored tuning: clamps ranges, ignores junk and U3 leftovers, fills defaults', () => {
    expect(sanitizeWindTuning(undefined)).toEqual(DEFAULT_WIND_TUNING)
    expect(sanitizeWindTuning('nee')).toEqual(DEFAULT_WIND_TUNING)
    const tuned = sanitizeWindTuning({ trailDistance: 10_000, intensity: 'veel', fadeInPx: 20, trailOpacity: 0.3, minAge: 1 })
    expect(tuned.trailDistance).toBe(400)
    expect(tuned.intensity).toBe(DEFAULT_WIND_TUNING.intensity)
    expect(tuned.fadeInPx).toBe(20)
    expect('trailOpacity' in tuned).toBe(false)
    expect('minAge' in tuned).toBe(false)
  })

  it('persists only non-default tuning so later default changes still reach users', () => {
    const values = new Map<string, string>()
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => void values.set(key, value),
      removeItem: (key: string) => void values.delete(key),
    }
    storeWindTuning({ ...DEFAULT_WIND_TUNING, intensity: 0.3 }, storage)
    expect(loadWindTuning(storage).intensity).toBe(0.3)
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
