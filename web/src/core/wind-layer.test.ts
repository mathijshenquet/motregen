import { describe, expect, it } from 'vitest'
import {
  advanceLife,
  anchorExhausted,
  bufferDecay,
  cellDispersion,
  DEFAULT_WIND_TUNING,
  downwindProfile,
  expectedLifetime,
  jitteredCellPoint,
  leastOccupiedCell,
  LEGACY_WIND_TUNING_STORAGE_KEY,
  occupancyGrid,
  headAlpha,
  loadWindTuning,
  particleCountForViewport,
  pickSpawn,
  sanitizeWindTuning,
  speedDamping,
  storeWindTuning,
  trailFloor,
  trailTargetSize,
  trailUvTransform,
  viewportParticleRetention,
  WIND_PARAMETERS,
  WIND_TUNING_CONTROLS,
  WIND_TUNING_STORAGE_KEY,
  windColor,
  windScreenSpeed,
  windZoomCompensation,
  type ParticleLife,
  type WindParameters,
} from './wind-layer'

const frame = 1 / 60

function simulate(speedPx: number, tuning: WindParameters = WIND_PARAMETERS, distance = tuning.trailDistance) {
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
    const tuning = WIND_PARAMETERS
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
    const tuning = WIND_PARAMETERS
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
    const tuning = WIND_PARAMETERS
    const slow = simulate(10)
    expect(slow.age).toBeCloseTo(tuning.maxAge, 1)
    expect(slow.alphas.at(-1)).toBeLessThan(0.05)
    // Windstil: niets afgelegd, dus ook niets gestempeld.
    expect(simulate(0).alphas.every((alpha) => alpha === 0)).toBe(true)
  })

  it('stays invisible and stationary while its staggered birth is pending', () => {
    const life: ParticleLife = { age: -0.5, travelled: 0, distance: 80, remaining: 80 }
    expect(advanceLife(life, 0, frame, WIND_PARAMETERS)).toBe(true)
    expect(headAlpha(life, WIND_PARAMETERS)).toBe(0)
    expect(life.travelled).toBe(0)
  })
})

describe('wind spawn', () => {
  function lcg(seed: number) {
    let state = seed
    return () => (state = (state * 16_807) % 2_147_483_647) / 2_147_483_647
  }

  // Stilstaande particles op een 10×10-raster (100 slots); west harde wind (korte levens),
  // oost zwakke wind. Tijdgemiddelde koppen en inkt per helft plus spreiding over de cellen.
  function spawnWorld(jitter: number, gamma = 1) {
    const tuning = { ...WIND_PARAMETERS, spawnJitter: jitter }
    const random = lcg(4242)
    const [columns, rows] = [10, 10]
    const slots = columns * rows
    const speeds = [16, 3]
    const xs = new Float64Array(slots)
    const ys = new Float64Array(slots)
    const deaths = new Float64Array(slots)
    const counts = new Uint16Array(slots)
    const heads = [0, 0]
    const ink = [0, 0]
    let dispersionSum = 0
    let samples = 0
    const place = (slot: number, now: number) => {
      const cell = leastOccupiedCell(counts, slots, random())
      const [x, y] = jitteredCellPoint(cell, columns, rows, tuning.spawnJitter, random)
      xs[slot] = x
      ys[slot] = y
      const half = x < 0.5 ? 0 : 1
      const speedPx = windScreenSpeed(speeds[half]!)
      deaths[slot] = now + expectedLifetime(speedPx, tuning)
      ink[half]! += Math.min(tuning.trailDistance, speedPx * expectedLifetime(speedPx, tuning)) * speedDamping(speeds[half]!, gamma)
    }
    const recount = () => {
      counts.fill(0)
      for (let slot = 0; slot < slots; slot++) counts[Math.floor(ys[slot]! * rows) * columns + Math.floor(xs[slot]! * columns)]!++
    }
    for (let slot = 0; slot < slots; slot++) {
      place(slot, random() * 2)
      recount()
    }
    for (let now = 0; now < 200; now += 0.05) {
      recount()
      for (let slot = 0; slot < slots; slot++) {
        if (deaths[slot]! > now) continue
        counts[Math.floor(ys[slot]! * rows) * columns + Math.floor(xs[slot]! * columns)]!--
        place(slot, now)
        counts[Math.floor(ys[slot]! * rows) * columns + Math.floor(xs[slot]! * columns)]!++
      }
      if (now < 20) continue
      for (let slot = 0; slot < slots; slot++) heads[xs[slot]! < 0.5 ? 0 : 1]!++
      dispersionSum += cellDispersion(xs, ys, slots, 5, 5)
      samples++
    }
    return { heads: heads[0]! / heads[1]!, ink: ink[0]! / ink[1]!, dispersion: dispersionSum / samples }
  }

  it('respawns into the emptiest cell: even head density in fast and slow wind for any jitter', () => {
    for (const jitter of [0, WIND_PARAMETERS.spawnJitter, 1]) {
      const { heads, dispersion } = spawnWorld(jitter)
      expect(heads, `jitter ${jitter}`).toBeGreaterThan(0.9)
      expect(heads, `jitter ${jitter}`).toBeLessThan(1.1)
      // Uniform random zou ~1 geven (Poisson); hier blijft het ver daaronder.
      expect(dispersion, `jitter ${jitter}`).toBeLessThan(0.3)
    }
  })

  it('damps heads in hard wind so ink per area stays speed-independent at gamma 1', () => {
    const undamped = spawnWorld(WIND_PARAMETERS.spawnJitter, 0)
    const damped = spawnWorld(WIND_PARAMETERS.spawnJitter, 1)
    expect(undamped.ink).toBeGreaterThan(3)
    expect(damped.ink).toBeGreaterThan(0.8)
    expect(damped.ink).toBeLessThan(1.25)
    expect(speedDamping(2, 1)).toBe(1)
    expect(speedDamping(6, 1)).toBeCloseTo(0.5)
    expect(speedDamping(6, 0)).toBe(1)
  })

  it('jitters around the cell centre without leaving the cell', () => {
    expect(jitteredCellPoint(5, 4, 2, 0, () => 0.9)).toEqual([0.375, 0.75])
    const random = lcg(1)
    for (const jitter of [0, 0.3, 0.6, 1]) {
      for (let cell = 0; cell < 8; cell++) {
        const [x, y] = jitteredCellPoint(cell, 4, 2, jitter, random)
        expect(Math.floor(x * 4) + Math.floor(y * 2) * 4, `cel ${cell}, jitter ${jitter}`).toBe(cell)
      }
    }
  })

  it('picks the emptiest cell with a random tie-break start and sizes square-ish cells', () => {
    expect(leastOccupiedCell([3, 0, 2, 5], 4, 0.9)).toBe(1)
    expect(leastOccupiedCell([1, 0, 1, 0], 4, 0.6)).toBe(3)
    expect(leastOccupiedCell([1, 0, 1, 0], 4, 0)).toBe(1)
    expect(occupancyGrid(1_280, 720, 570)).toEqual([32, 18])
    expect(occupancyGrid(393, 727, 177)).toEqual([10, 18])
  })

  it('computes dispersion 0 for a perfectly even grid', () => {
    expect(cellDispersion([0.25, 0.75, 0.25, 0.75], [0.25, 0.25, 0.75, 0.75], 4, 2, 2)).toBe(0)
    expect(cellDispersion([0.1, 0.1], [0.1, 0.1], 2, 2, 1)).toBe(1)
  })

  it('avoids spawning where there is no wind data unless every candidate lacks it', () => {
    const random = lcg(7)
    const uniform = (): [number, number] => [random(), random()]
    for (let draw = 0; draw < 200; draw++) {
      const [x] = pickSpawn(32, uniform, random, (candidateX) => candidateX < 0.5 ? 0 : 1)
      if (x < 0.5) expect.fail('spawn in gebied zonder wind terwijl er alternatieven waren')
    }
    const [x, y] = pickSpawn(32, uniform, random, () => 0)
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
      const decay = bufferDecay(WIND_PARAMETERS.bufferFade, seconds)
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
    expect(trailUvTransform(view, { ...view, zoom: 5 }).retention).toBeCloseTo(0.5)
  })

  it('keeps the trail buffer anchored through small moves and reanchors on a large zoom or pan (U24)', () => {
    const anchor = { centerX: 0.5, centerY: 0.5, zoom: 7, width: 800, height: 600 }
    const exhausted = (current: typeof anchor) => anchorExhausted(anchor, current, trailUvTransform(anchor, current))
    expect(exhausted({ ...anchor, zoom: 7.3 })).toBe(false)
    expect(exhausted({ ...anchor, zoom: 7.6 })).toBe(true)
    // Uitzoomen: het beeld valt meteen buiten het anker, na ~0,07 zoomniveau voorbij de marge.
    expect(exhausted({ ...anchor, zoom: 6.97 })).toBe(false)
    expect(exhausted({ ...anchor, zoom: 6.8 })).toBe(true)
    const world = 512 * 2 ** 7
    expect(exhausted({ ...anchor, centerX: 0.5 + 30 / world })).toBe(false)
    expect(exhausted({ ...anchor, centerX: 0.5 + 60 / world })).toBe(true)
  })
})

describe('wind profile (U24)', () => {
  it('measures density from windward to leeward in equal-area bands', () => {
    const us: number[] = []
    const vs: number[] = []
    for (let row = 0; row < 40; row++) for (let column = 0; column < 40; column++) { us.push((column + 0.5) / 40); vs.push((row + 0.5) / 40) }
    const uniform = downwindProfile(us, vs, us.map(() => 1), 1, 0, 1.6)
    expect(uniform.ratio).toBeCloseTo(1, 1)
    for (const value of uniform.density) expect(value).toBeCloseTo(1, 0)
    // Westenwind (dx > 0): lege westrand = lage loef/lij; bij oostenwind is dezelfde rand de lij.
    const keep = us.map((u) => u > 0.2)
    const pick = <T>(values: T[]) => values.filter((_, index) => keep[index])
    expect(downwindProfile(pick(us), pick(vs), pick(us).map(() => 1), 1, 0, 1.6).ratio).toBeLessThan(0.1)
    expect(downwindProfile(pick(us), pick(vs), pick(us).map(() => 1), -1, 0, 1.6).ratio).toBeGreaterThan(10)
  })
})

describe('wind tuning', () => {
  it('exposes exactly the four MIP-12 knobs, each default in range', () => {
    for (const control of WIND_TUNING_CONTROLS) {
      expect(DEFAULT_WIND_TUNING[control.key], control.key).toBeGreaterThanOrEqual(control.min)
      expect(DEFAULT_WIND_TUNING[control.key], control.key).toBeLessThanOrEqual(control.max)
      expect(DEFAULT_WIND_TUNING[control.key], control.key).toBe(WIND_PARAMETERS[control.key])
    }
    expect(WIND_TUNING_CONTROLS.map((control) => control.label)).toEqual(['Dichtheid', 'Intensiteit', 'Lijnbreedte', 'Tempo'])
    expect(WIND_TUNING_CONTROLS.map((control) => control.key).sort()).toEqual(Object.keys(DEFAULT_WIND_TUNING).sort())
  })

  it('sanitizes stored tuning: clamps ranges, ignores junk and keys that are constants now', () => {
    expect(sanitizeWindTuning(undefined)).toEqual(DEFAULT_WIND_TUNING)
    expect(sanitizeWindTuning('nee')).toEqual(DEFAULT_WIND_TUNING)
    const tuned = sanitizeWindTuning({ lineWidth: 100, intensity: 'veel', speed: 1.5, trailDistance: 20, maxFps: 30 })
    expect(tuned).toEqual({ ...DEFAULT_WIND_TUNING, lineWidth: 8, speed: 1.5 })
  })

  it('persists only non-default knobs so later default changes still reach users', () => {
    const values = new Map<string, string>()
    const storage = memoryStorage(values)
    storeWindTuning({ ...DEFAULT_WIND_TUNING, intensity: 0.3 }, storage)
    expect(JSON.parse(values.get(WIND_TUNING_STORAGE_KEY)!)).toEqual({ intensity: 0.3 })
    expect(loadWindTuning(storage).intensity).toBe(0.3)
    storeWindTuning({ ...DEFAULT_WIND_TUNING }, storage)
    expect(values.has(WIND_TUNING_STORAGE_KEY)).toBe(false)
    values.set(WIND_TUNING_STORAGE_KEY, '{kapot')
    expect(loadWindTuning(storage)).toEqual(DEFAULT_WIND_TUNING)
  })

  it('migrates v3 once to v4: the four knobs survive, keys that became constants are dropped', () => {
    expect(WIND_TUNING_STORAGE_KEY).toBe('motregen-wind-tuning-v4')
    expect(LEGACY_WIND_TUNING_STORAGE_KEY).toBe('motregen-wind-tuning-v3')
    const values = new Map([[LEGACY_WIND_TUNING_STORAGE_KEY, JSON.stringify({ intensity: 0.5, particlesPerMegapixel: 900, maxFps: 30, trailDistance: 120 })]])
    const storage = memoryStorage(values)
    const loaded = loadWindTuning(storage)
    expect(loaded).toEqual({ ...DEFAULT_WIND_TUNING, intensity: 0.5, particlesPerMegapixel: 900 })
    expect(values.has(LEGACY_WIND_TUNING_STORAGE_KEY)).toBe(false)
    expect(JSON.parse(values.get(WIND_TUNING_STORAGE_KEY)!)).toEqual({ intensity: 0.5, particlesPerMegapixel: 900 })
    expect(loadWindTuning(storage)).toEqual(loaded)
  })

  it('leaves no key behind when the v3 tuning only touched knobs that are constants now', () => {
    const values = new Map([[LEGACY_WIND_TUNING_STORAGE_KEY, JSON.stringify({ maxFps: 30, bufferDpr: 1 })]])
    expect(loadWindTuning(memoryStorage(values))).toEqual(DEFAULT_WIND_TUNING)
    expect(values.size).toBe(0)
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
    // Resize: het budget groeit mee met het beeld, dus niemand hoeft weg.
    expect(viewportParticleRetention(focused, { ...focused, east: focused.west + 2 * (focused.east - focused.west) }, 500, 1_000)).toBe(1)
    expect(viewportParticleRetention(focused, full, 500, 1_000)).toBe(0.5)
  })
})

function memoryStorage(values: Map<string, string>) {
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    removeItem: (key: string) => void values.delete(key),
  }
}
