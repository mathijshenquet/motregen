import type { Grid } from './contract.js'
import { WINDSOCK_SAMPLES, WINDSOCK_SHAPE, windsockPill, windsockShape, type BadgeBox, type Point } from './wind-glyph.js'

/**
 * Hoe de zak meebuigt: niet (standaard sinds PO 2026-11-09: "de kromming werkt niet echt"), met de stroomlijn door
 * de mast, met traagheid in de tijd, of allebei (U101 ronde 3).
 */
export const WINDSOCK_CURVATURES = ['geen', 'stroom', 'traag', 'beide'] as const
export type WindsockCurvature = typeof WINDSOCK_CURVATURES[number]
export const DEFAULT_WINDSOCK_CURVATURE: WindsockCurvature = 'geen'

/**
 * Stuk stroomlijn dat op de zak wordt afgebeeld. Over de echte zaklengte (tientallen km) buigt het HARMONIE-veld
 * nauwelijks; over dit stuk wel zichtbaar, en het blijft bij elke zoom dezelfde vorm.
 */
export const WINDSOCK_STREAM_KM = 120
/** De staart volgt de richting van zoveel minuten eerder; de mond de huidige. */
export const WINDSOCK_LAG_MINUTES = 90
/** Meer dan dit buigt een echte zak niet; daarboven wordt het een krul. */
export const MAX_BEND_DEGREES = 75

/** Windveld op één tijdstip: twee uurframes (u,v om en om, m/s) en hun menging. */
export interface WindSlice {
  left: Float32Array
  right: Float32Array
  mix: number
}

/** Het veld nu, WINDSOCK_LAG_MINUTES / 2 eerder en WINDSOCK_LAG_MINUTES eerder. */
export interface WindsockField {
  grid: Grid
  slices: readonly [WindSlice, WindSlice, WindSlice]
}

/** Wind (oost, noord) in m/s op een punt in Web-Mercator-meters, bilineair tussen de celmiddens. */
export function sampleWind(field: WindsockField, slice: 0 | 1 | 2, x: number, y: number): [number, number] | undefined {
  const { grid } = field
  const column = (x - grid.x0) / grid.dx - 0.5
  const row = (y - grid.y0) / grid.dy - 0.5
  const column0 = Math.max(0, Math.min(grid.width - 2, Math.floor(column)))
  const row0 = Math.max(0, Math.min(grid.height - 2, Math.floor(row)))
  if (column < -0.5 || row < -0.5 || column > grid.width - 0.5 || row > grid.height - 0.5) return undefined
  const across = Math.max(0, Math.min(1, column - column0)), down = Math.max(0, Math.min(1, row - row0))
  const { left, right, mix } = field.slices[slice]
  let east = 0, north = 0
  for (const [dRow, dColumn, weight] of [[0, 0, (1 - across) * (1 - down)], [0, 1, across * (1 - down)], [1, 0, (1 - across) * down], [1, 1, across * down]] as const) {
    const index = ((row0 + dRow) * grid.width + column0 + dColumn) * 2
    east += weight * (left[index]! * (1 - mix) + right[index]! * mix)
    north += weight * (left[index + 1]! * (1 - mix) + right[index + 1]! * mix)
  }
  return Number.isFinite(east) && Number.isFinite(north) ? [east, north] : undefined
}

/** Kompasrichting waar de wind heen waait, in graden met de klok mee vanaf noord. */
export function towardDegrees([east, north]: readonly [number, number]): number {
  return (Math.atan2(east, north) * 180 / Math.PI + 360) % 360
}

/** Kortste hoek van `from` naar `to`, in (-180, 180]. */
export function angleDifference(from: number, to: number): number {
  return ((to - from) % 360 + 540) % 360 - 180
}

export function mixAngle(from: number, to: number, share: number): number {
  return from + angleDifference(from, to) * share
}

/**
 * Schermhoek per asstuk van mond tot staart. Het scherm staat noord-boven (de kaart draait niet), dus een
 * kompasrichting is direct een schermhoek.
 */
export function windsockHeadings(field: WindsockField, x: number, y: number, curvature: WindsockCurvature): number[] | undefined {
  const here = sampleWind(field, 0, x, y)
  if (!here) return undefined
  const base = towardDegrees(here)
  const bends = Array<number>(WINDSOCK_SAMPLES + 1).fill(0)
  if (curvature === 'stroom' || curvature === 'beide') {
    const step = WINDSOCK_STREAM_KM * 1000 / WINDSOCK_SAMPLES
    let pointX = x, pointY = y
    for (let index = 0; index <= WINDSOCK_SAMPLES; index++) {
      const wind = sampleWind(field, 0, pointX, pointY)
      if (!wind) { bends.fill(bends[index - 1] ?? 0, index); break }
      const direction = towardDegrees(wind)
      bends[index] = angleDifference(base, direction)
      pointX += Math.sin(direction * Math.PI / 180) * step
      pointY += Math.cos(direction * Math.PI / 180) * step
    }
  }
  if (curvature === 'traag' || curvature === 'beide') {
    const halfway = sampleWind(field, 1, x, y), earliest = sampleWind(field, 2, x, y)
    if (halfway && earliest) {
      const middle = angleDifference(base, towardDegrees(halfway))
      const end = angleDifference(base, towardDegrees(earliest))
      for (let index = 0; index <= WINDSOCK_SAMPLES; index++) {
        const t = index / WINDSOCK_SAMPLES
        bends[index]! += t <= 0.5 ? middle * t * 2 : middle + (end - middle) * (t - 0.5) * 2
      }
    }
  }
  return bends.map((bend) => base + Math.max(-MAX_BEND_DEGREES, Math.min(MAX_BEND_DEGREES, bend)))
}

/** Trilling bij harde wind: vanaf `start` Bft, uitslag aan de staart en frequentie groeien met de windkracht. */
export interface WindsockFlutter {
  start: number
  /** Uitslag aan de staart in graden: bij de drempel, en de groei per Bft daarboven. */
  amplitude: number
  amplitudePerForce: number
  maxAmplitude: number
  /** Golven per seconde: bij de drempel, en de groei per Bft. */
  frequency: number
  frequencyPerForce: number
}

export const WINDSOCK_FLUTTERS = {
  zacht: { start: 6, amplitude: 3, amplitudePerForce: 2, maxAmplitude: 12, frequency: 1.2, frequencyPerForce: 0.25 },
  normaal: { start: 6, amplitude: 5, amplitudePerForce: 3, maxAmplitude: 20, frequency: 1.6, frequencyPerForce: 0.4 },
  sterk: { start: 6, amplitude: 8, amplitudePerForce: 4, maxAmplitude: 28, frequency: 2, frequencyPerForce: 0.6 },
} as const satisfies Record<string, WindsockFlutter>
export type WindsockFlutterName = keyof typeof WINDSOCK_FLUTTERS
export const DEFAULT_WINDSOCK_FLUTTER: WindsockFlutterName = 'normaal'

/** Hoek per asstuk door de trilling: een golf die van mond naar staart loopt en naar de staart aanzwelt. */
export function flutterBends(flutter: WindsockFlutter, strength: number, seconds: number, phase: number): number[] | undefined {
  if (strength < flutter.start) return undefined
  const above = strength - flutter.start
  const amplitude = Math.min(flutter.maxAmplitude, flutter.amplitude + flutter.amplitudePerForce * above)
  const frequency = flutter.frequency + flutter.frequencyPerForce * above
  // Vloeiend inzetten over de eerste halve Bft, anders springt de zak bij de drempel.
  const onset = Math.min(1, above * 2)
  return Array.from({ length: WINDSOCK_SAMPLES + 1 }, (_, index) => {
    const t = index / WINDSOCK_SAMPLES
    return onset * amplitude * t ** 1.3 * Math.sin(2 * Math.PI * (frequency * seconds - 1.1 * t) + phase)
  })
}

/** Vaste trillingsfase per plaats (0–6,28 rad), zodat de zakken niet in de maat trillen. */
export function windsockPhase(name: string): number {
  let hash = 0
  for (const character of name) hash = (hash * 31 + character.charCodeAt(0)) | 0
  return (hash >>> 0) % 628 / 100
}

/**
 * Wuiven (PO 2026-11-09): zoals een vlag of wimpel echt wuift. De zak zit vast aan de mast en een golf loopt door de
 * stof naar het losse eind: bij de mast bijna geen uitslag, naar de staart steeds meer, en de staart loopt in fase
 * achter. De golflengte is langer dan de zak (een sierlijke zwiep, geen kronkel); met de wind wordt de golf sneller
 * en korter, tot flapperen. Daarbovenop draait de hele zak traag mee met de vlagen, met naijlende staart (momentum).
 * Hoeken in graden per asstuk.
 */
/**
 * Getallen van het wuiven; Rust (render-core windsock::sway_bends) krijgt ze via de modusconstanten.
 * - frequentie in Hz = f0 + f1·s + f2·s²: loom ~0,45 bij 1 Bft, vlot ~1,8 bij 5 Bft, flapperend ~3,7 bij 8 Bft;
 * - golflengte in zaklengtes = max(min, base − perForce·s): lang bij weinig wind (een zwiep), korter bij harde wind;
 * - uitslag aan de staart in graden = min(1, s/calmForce) · (max − drop·min(1, s/tautForce)): ~12° bij 1 Bft, ~6°
 *   vanaf 5 Bft;
 * - root: deel van de uitslag dat de mast nog meekrijgt; gust: trage vlaag (graden, Hz, seconden naijlen staart).
 */
export const WINDSOCK_SWAY_NUMBERS = {
  frequency: [0.3, 0.1, 0.04],
  wavelength: { base: 2.9, perForce: 0.26, min: 1.1 },
  amplitude: { max: 18, drop: 12, calmForce: 1.5, tautForce: 5 },
  root: 0.12,
  gust: { amplitude: 4, frequency: 0.13, lag: 0.6 },
} as const

const { frequency: SWAY_FREQUENCY, wavelength: SWAY_WAVELENGTH, amplitude: SWAY_AMPLITUDE } = WINDSOCK_SWAY_NUMBERS
export const WINDSOCK_SWAY = {
  frequency: (strength: number) => SWAY_FREQUENCY[0] + SWAY_FREQUENCY[1] * strength + SWAY_FREQUENCY[2] * strength * strength,
  wavelength: (strength: number) => Math.max(SWAY_WAVELENGTH.min, SWAY_WAVELENGTH.base - SWAY_WAVELENGTH.perForce * strength),
  amplitude: (strength: number) => Math.min(1, strength / SWAY_AMPLITUDE.calmForce) * (SWAY_AMPLITUDE.max - SWAY_AMPLITUDE.drop * Math.min(1, strength / SWAY_AMPLITUDE.tautForce)),
  root: WINDSOCK_SWAY_NUMBERS.root,
  gust: WINDSOCK_SWAY_NUMBERS.gust,
} as const

/**
 * `wave` is de opgetelde golffase van deze zak in radialen (`advanceWave`): zo verandert een andere windkracht
 * alleen hoe snel de golf verder loopt, niet waar hij nu is. Met frequentie × klok sprong de fase bij elke
 * krachtwijziging, en ging de zak bij scrubben wild wiggelen (PO 2026-11-09).
 */
export function swayBends(strength: number, wave: number, seconds: number, phase: number): number[] {
  const { wavelength, amplitude, root, gust } = WINDSOCK_SWAY
  const wavenumber = 2 * Math.PI / wavelength(strength)
  const swing = amplitude(strength)
  const calm = Math.min(1, strength / SWAY_AMPLITUDE.calmForce)
  return Array.from({ length: WINDSOCK_SAMPLES + 1 }, (_, index) => {
    const t = index / WINDSOCK_SAMPLES
    const travel = wave - wavenumber * t + phase
    // Een tweede, snellere golf erdoor maakt het onregelmatig in plaats van een metronoom.
    const ripple = (Math.sin(travel) + 0.35 * Math.sin(1.7 * travel + 2.3 * phase)) / 1.35
    const sway = gust.amplitude * calm * Math.sin(2 * Math.PI * gust.frequency * (seconds - gust.lag * t) + 1.7 * phase)
    return swing * (root + (1 - root) * t ** 1.6) * ripple + sway
  })
}

/** Telt de golffase op over `elapsed` seconden bij deze windkracht. */
export function advanceWave(wave: number, strength: number, elapsed: number): number {
  return (wave + 2 * Math.PI * WINDSOCK_SWAY.frequency(strength) * elapsed) % (2 * Math.PI * 1000)
}

/** Toestand van een kritisch gedempte veer: waarde en snelheid (per seconde). */
export interface Spring {
  value: number
  velocity: number
}

/**
 * Laat `spring` `target` volgen met tijdconstante `timeConstant` (s), zonder doorschieten. Exacte oplossing van de
 * kritisch gedempte veer, dus stabiel bij elke framestap. Dit is het momentum van de zak (PO 2026-11-09: het veld
 * verspringt per tijdstap en op het hele uur; de zak moet daar vloeiend doorheen).
 */
export function followSpring(spring: Spring, target: number, elapsed: number, timeConstant: number): void {
  const omega = 2 / timeConstant
  const offset = spring.value - target
  const push = (spring.velocity + omega * offset) * elapsed
  const decay = Math.exp(-omega * elapsed)
  spring.value = target + (offset + push) * decay
  spring.velocity = (spring.velocity - omega * push) * decay
}

/** Tijdconstanten van het momentum: richting en windkracht van de zak. */
export const WINDSOCK_MOMENTUM = { heading: 0.6, strength: 0.8 } as const

/** Beweging van één zak: momentum op richting (kompasgraden) en kracht (Bft), plus de opgetelde golffase. */
export interface SockMotion {
  heading?: Spring
  strength?: Spring
  wave: number
}

/**
 * Eén stap van een zak naar het veld (doelrichting `target`, doelkracht `force`) over `elapsed` seconden: momentum
 * op richting en kracht, dan de golf verder met de getekende kracht. `snap` (na een pauze, eerste beeld, still)
 * zet hem direct op het doel. App, Node-bot en Rust (render-core windsock::advance_sock) doen precies dit; de bot
 * stapt per filmframe, dus de film is deterministisch. Geeft terug of de zak nog beweegt.
 */
export function advanceSock(motion: SockMotion, target: number, force: number, elapsed: number, snap: boolean): boolean {
  if (snap || !motion.heading || !motion.strength) {
    motion.heading = { value: target, velocity: 0 }
    motion.strength = { value: force, velocity: 0 }
    return false
  }
  // Kortste weg: het doel ligt nooit meer dan 180° van de huidige richting.
  followSpring(motion.heading, motion.heading.value + angleDifference(motion.heading.value, target), elapsed, WINDSOCK_MOMENTUM.heading)
  followSpring(motion.strength, force, elapsed, WINDSOCK_MOMENTUM.strength)
  motion.wave = advanceWave(motion.wave, Math.max(0, motion.strength.value), elapsed)
  return Math.abs(motion.heading.velocity) > 0.05 || Math.abs(motion.strength.velocity) > 0.005
}

/** Langer dan dit (s) tussen twee stappen: de zak springt naar het veld in plaats van er traag naartoe te draaien. */
export const SOCK_SNAP_SECONDS = 1

/**
 * Geen zakken over elkaar (PO 2026-11-09: bij harde wind kruiste de zak van "6" die van "8"). Een zak beslaat de
 * strook rond zijn as, van de mast tot de staart bij de huidige kracht en richting, en wuift tot de maximale uitslag
 * naar beide kanten; die drie assen met een halve dikte van WINDSOCK_REACH_RADIUS (badge van twee cijfers, mond plus
 * rand) mogen die van een andere zak niet raken. App (indeling), Node-bot en Rust (render-core windsock::reach)
 * gebruiken deze regel.
 */
export const WINDSOCK_REACH_RADIUS = 12
/**
 * Kandidaten liggen minstens zo ver uit elkaar: een volle zak, het deel van de pil ("0 Bft") dat aan de andere kant
 * van de mast uitsteekt, en twee halve diktes (CSS-px; U113: 70 → 88 met de pil).
 */
export const WINDSOCK_SPACING_PX = (() => {
  const pill = windsockPill(90, '0', 'Bft')
  return Math.round(WINDSOCK_SHAPE.sizes.kaart.maxLength + 2 * (pill.halfWidth - pill.halfHeight) + 2 * WINDSOCK_REACH_RADIUS)
})()
/** Een zak die nog niet stond, heeft zoveel meer ruimte nodig: zo knippert er niets bij afspelen. */
export const WINDSOCK_APPEAR_MARGIN = 1.15

/**
 * Mast en de drie staartstanden (recht, en de maximale wuifuitslag links en rechts) in CSS-px; `badge` is de pil (of
 * schijf) als capsule: een liggend lijnstuk met een straal (U113: de pil steekt naast de mast uit).
 */
export interface SockReach { mast: Point; tails: Point[]; badge?: { from: Point; to: Point; radius: number } }

/** `heading`: schermrichting van de zak (kompasgraden min kaartdraaiing), `strength` in Bft; `badge` t.o.v. de mast. */
export function sockReach(mast: Point, heading: number, strength: number, badge?: BadgeBox): SockReach {
  const spread = WINDSOCK_SWAY.amplitude(strength) + WINDSOCK_SWAY.gust.amplitude
  const tails = [0, -spread, spread].map((offset) => {
    const [x, y] = windsockShape(strength, Array<number>(WINDSOCK_SAMPLES + 1).fill(heading + offset), 'kaart').axis.at(-1)!
    return [mast[0] + x, mast[1] + y] as Point
  })
  if (!badge) return { mast, tails }
  const straight = Math.max(0, badge.halfWidth - badge.halfHeight)
  const centerX = mast[0] + badge.x, centerY = mast[1] + badge.y
  return { mast, tails, badge: { from: [centerX - straight, centerY], to: [centerX + straight, centerY], radius: badge.halfHeight + badge.gap } }
}

/** Raken twee zakken elkaar niet (assen en pillen)? `margin` > 1 vraagt extra ruimte (een zak die erbij komt). */
export function socksClear(a: SockReach, b: SockReach, margin = 1): boolean {
  const gap = 2 * WINDSOCK_REACH_RADIUS * margin
  if (!a.tails.every((tailA) => b.tails.every((tailB) => segmentDistance(a.mast, tailA, b.mast, tailB) >= gap))) return false
  const pillClear = (pill: NonNullable<SockReach['badge']>, other: SockReach) =>
    other.tails.every((tail) => segmentDistance(pill.from, pill.to, other.mast, tail) >= (pill.radius + WINDSOCK_REACH_RADIUS) * margin)
  if (a.badge && !pillClear(a.badge, b)) return false
  if (b.badge && !pillClear(b.badge, a)) return false
  return !a.badge || !b.badge || segmentDistance(a.badge.from, a.badge.to, b.badge.from, b.badge.to) >= (a.badge.radius + b.badge.radius) * margin
}

function segmentDistance(a0: Point, a1: Point, b0: Point, b1: Point): number {
  if (segmentsCross(a0, a1, b0, b1)) return 0
  return Math.min(pointSegment(a0, b0, b1), pointSegment(a1, b0, b1), pointSegment(b0, a0, a1), pointSegment(b1, a0, a1))
}

function pointSegment([px, py]: Point, [ax, ay]: Point, [bx, by]: Point): number {
  const dx = bx - ax, dy = by - ay
  const length = dx * dx + dy * dy
  const t = length ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / length)) : 0
  return Math.hypot(px - ax - t * dx, py - ay - t * dy)
}

function segmentsCross(a0: Point, a1: Point, b0: Point, b1: Point): boolean {
  const side = ([ox, oy]: Point, [px, py]: Point, [qx, qy]: Point) => (px - ox) * (qy - oy) - (py - oy) * (qx - ox)
  const d1 = side(b0, b1, a0), d2 = side(b0, b1, a1), d3 = side(a0, a1, b0), d4 = side(a0, a1, b1)
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
}
