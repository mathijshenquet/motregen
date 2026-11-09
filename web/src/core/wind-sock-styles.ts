import { WINDSOCK_BANDS, WINDSOCK_SAMPLES, windsockBand, windsockFill, windsockOutline, type Point, type WindsockBadge, type WindsockShape } from './wind-glyph.js'

/**
 * Stijlvarianten van de windzak (U101 ronde 4, `?dev&zakstijl=`): "een blend tussen iets met de hand gemaakts en
 * digitale magie" (PO 2026-11-09). Vorm, kromming, trilling, badge en ankers zijn voor alle stijlen gelijk; alleen
 * het tekenen verschilt.
 */
export const WINDSOCK_STYLE_NAMES = ['zak', 'gravure', 'emaille', 'windwijzer', 'wimpel', 'glans'] as const
export type WindsockStyleName = typeof WINDSOCK_STYLE_NAMES[number]
export const DEFAULT_WINDSOCK_STYLE: WindsockStyleName = 'zak'

export interface SockScene {
  context: CanvasRenderingContext2D
  shape: WindsockShape
  badge: WindsockBadge
  label: string
  /** Continue windkracht (Bft). */
  strength: number
  dark: boolean
  fontFamily: string
  /** Wandklok in seconden en de vaste fase van de plaats, voor wat in de tijd beweegt. */
  seconds: number
  phase: number
}

/** Tekent de zak (rond de badge weggeknipt) en daarna de badge, met de mast in (0, 0). */
export function drawStyledSock(style: WindsockStyleName, scene: SockScene): void {
  const { context, badge } = scene
  const look = LOOKS[style]
  context.save()
  context.lineJoin = 'round'
  context.lineCap = 'round'
  context.save()
  const outside = new Path2D()
  outside.rect(-240, -240, 480, 480)
  outside.arc(badge.x, badge.y, badge.cutRadius, 0, Math.PI * 2)
  context.clip(outside, 'evenodd')
  look.body(scene)
  context.restore()
  look.badge(scene)
  context.restore()
}

interface Look {
  body: (scene: SockScene) => void
  badge: (scene: SockScene) => void
}

const pathOf = (points: readonly Point[]) => {
  const path = new Path2D()
  points.forEach(([x, y], index) => index ? path.lineTo(x, y) : path.moveTo(x, y))
  path.closePath()
  return path
}

const lineOf = (points: readonly Point[]) => {
  const path = new Path2D()
  points.forEach(([x, y], index) => index ? path.lineTo(x, y) : path.moveTo(x, y))
  return path
}

const mix = ([ax, ay]: Point, [bx, by]: Point, share: number): Point => [ax + (bx - ax) * share, ay + (by - ay) * share]

/** Punt op de as op deel `t` (0 = mond, 1 = staart), lineair tussen de monsters. */
function axisAt(shape: WindsockShape, t: number): { point: Point; heading: number } {
  const position = Math.max(0, Math.min(WINDSOCK_SAMPLES, t * WINDSOCK_SAMPLES))
  const index = Math.min(WINDSOCK_SAMPLES - 1, Math.floor(position))
  const share = position - index
  return {
    point: mix(shape.axis[index]!, shape.axis[index + 1]!, share),
    heading: shape.headings[index]! + (shape.headings[index + 1]! - shape.headings[index]!) * share,
  }
}

/** Een lint langs de as met eigen halve breedte en zijwaartse verschuiving per `t`. */
function ribbon(shape: WindsockShape, from: number, to: number, halfWidth: (t: number) => number, shift: (t: number) => number = () => 0, steps = 28): { left: Point[]; right: Point[] } {
  const left: Point[] = [], right: Point[] = []
  for (let step = 0; step <= steps; step++) {
    const t = from + (to - from) * step / steps
    const { point: [x, y], heading } = axisAt(shape, t)
    const radians = heading * Math.PI / 180
    const normalX = Math.cos(radians), normalY = Math.sin(radians)
    const width = halfWidth(t), offset = shift(t)
    left.push([x + normalX * (offset - width), y + normalY * (offset - width)])
    right.push([x + normalX * (offset + width), y + normalY * (offset + width)])
  }
  return { left, right }
}

/** Lichte rand onder elke stijl: los van de vlakken, op lichte en donkere kaart. */
function underlay(context: CanvasRenderingContext2D, path: Path2D, dark: boolean, width = 3.2, color = '255, 255, 255'): void {
  context.save()
  context.translate(0, 1.3)
  context.strokeStyle = 'rgba(0, 0, 0, 0.22)'
  context.lineWidth = width + 0.3
  context.stroke(path)
  context.restore()
  context.strokeStyle = `rgba(${color}, ${dark ? 0.6 : 0.9})`
  context.lineWidth = width
  context.stroke(path)
}

function badgeDisc(context: CanvasRenderingContext2D, badge: WindsockBadge, fill: string): Path2D {
  const circle = new Path2D()
  circle.arc(badge.x, badge.y, badge.radius, 0, Math.PI * 2)
  context.save()
  context.translate(0, 1.3)
  context.fillStyle = 'rgba(0, 0, 0, 0.22)'
  context.fill(circle)
  context.restore()
  context.fillStyle = fill
  context.fill(circle)
  return circle
}

function badgeNumber(scene: SockScene, color: string, font: string): void {
  const { context, badge, label } = scene
  context.font = `${font} ${badge.fontPx}px ${scene.fontFamily}`
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.fillStyle = color
  context.fillText(label, badge.x, badge.y + 0.5)
}

// --- zak: de huidige windzak (ronde 3) -------------------------------------------------------------------------

const SOCK = { orange: '#f2661c', white: '#fbfbf8', ink: '#17242b' }

function sockBody(scene: SockScene, after?: (outline: Path2D) => void): void {
  const { context, shape, dark } = scene
  const outline = pathOf(windsockOutline(shape))
  underlay(context, outline, dark)
  for (let band = 0; band < WINDSOCK_BANDS; band++) {
    context.fillStyle = band % 2 ? SOCK.white : SOCK.orange
    context.fill(pathOf(windsockBand(shape, band)))
  }
  after?.(outline)
  context.strokeStyle = SOCK.ink
  context.lineWidth = 1.1
  context.stroke(outline)
  context.lineWidth = 2
  context.stroke(lineOf([shape.left[0]!, shape.right[0]!]))
}

function sockBadge(scene: SockScene): void {
  const circle = badgeDisc(scene.context, scene.badge, '#fff')
  scene.context.strokeStyle = SOCK.ink
  scene.context.lineWidth = 1.1
  scene.context.stroke(circle)
  badgeNumber(scene, SOCK.orange, '800')
}

// --- gravure: lijnarcering zoals op oude Hollandse zeekaarten -----------------------------------------------------

const ENGRAVING = { ink: '#2a1f16', paper: '#f3e7cb', accent: '#b4502a', serif: 'Georgia, "Times New Roman", serif' }

function engravingBody({ context, shape, dark }: SockScene): void {
  const outline = pathOf(windsockOutline(shape))
  underlay(context, outline, dark, 3.4, '250, 243, 226')
  context.fillStyle = ENGRAVING.paper
  context.fill(outline)
  // Dwarsarcering op ~1,5 px in de "oranje" banden, in de warme accentkleur; de lichte banden krijgen alleen
  // lengtelijnen aan de schaduwzijde, zoals een burijn schaduw zet.
  const [tipX, tipY] = shape.axis.at(-1)!
  const lines = Math.max(8, Math.round(Math.hypot(tipX, tipY) / 1.45))
  context.strokeStyle = ENGRAVING.accent
  context.lineWidth = 0.9
  for (let line = 0; line <= lines; line++) {
    const t = line / lines
    if (Math.min(WINDSOCK_BANDS - 1, Math.floor(t * WINDSOCK_BANDS)) % 2) continue
    const position = t * WINDSOCK_SAMPLES, index = Math.min(WINDSOCK_SAMPLES - 1, Math.floor(position))
    context.stroke(lineOf([mix(shape.left[index]!, shape.left[index + 1]!, position - index), mix(shape.right[index]!, shape.right[index + 1]!, position - index)]))
  }
  context.strokeStyle = 'rgba(42, 31, 22, 0.55)'
  context.lineWidth = 0.55
  for (const share of [0.55, 0.72, 0.87]) context.stroke(lineOf(shape.right.map((point, index) => mix(shape.axis[index]!, point, share))))
  context.strokeStyle = ENGRAVING.ink
  context.lineWidth = 1
  context.stroke(outline)
  context.lineWidth = 1.7
  context.stroke(lineOf([shape.left[0]!, shape.right[0]!]))
}

function engravingBadge(scene: SockScene): void {
  const { context, badge } = scene
  const circle = badgeDisc(context, badge, ENGRAVING.paper)
  context.strokeStyle = ENGRAVING.ink
  context.lineWidth = 1.1
  context.stroke(circle)
  context.lineWidth = 0.5
  context.beginPath()
  context.arc(badge.x, badge.y, badge.radius - 2, 0, Math.PI * 2)
  context.stroke()
  badgeNumber({ ...scene, fontFamily: ENGRAVING.serif }, ENGRAVING.ink, '700')
}

// --- emaille: geëmailleerd bordje met koperen rand ---------------------------------------------------------------

const ENAMEL = { orange: '#d8480f', cream: '#f7efdc', copper: '#b87333', gold: '#e3b45a', edge: '#3a2410' }

function enamelBody({ context, shape, dark }: SockScene): void {
  const outline = pathOf(windsockOutline(shape))
  underlay(context, outline, dark, 4)
  for (let band = 0; band < WINDSOCK_BANDS; band++) {
    context.fillStyle = band % 2 ? ENAMEL.cream : ENAMEL.orange
    context.fill(pathOf(windsockBand(shape, band)))
  }
  // Glanslijn: het licht valt van linksboven op het gebolde emaille.
  const shine = shape.left.slice(1, Math.round(WINDSOCK_SAMPLES * 0.75)).map((point, index) => mix(point, shape.axis[index + 1]!, 0.32))
  context.strokeStyle = 'rgba(255, 255, 255, 0.6)'
  context.lineWidth = 1.2
  context.stroke(lineOf(shine))
  context.strokeStyle = ENAMEL.edge
  context.lineWidth = 2.6
  context.stroke(outline)
  context.strokeStyle = ENAMEL.copper
  context.lineWidth = 1.5
  context.stroke(outline)
  context.strokeStyle = ENAMEL.gold
  context.lineWidth = 0.5
  context.stroke(outline)
  context.strokeStyle = ENAMEL.edge
  context.lineWidth = 2.2
  context.stroke(lineOf([shape.left[0]!, shape.right[0]!]))
}

function enamelBadge(scene: SockScene): void {
  const { context, badge } = scene
  const circle = badgeDisc(context, badge, ENAMEL.cream)
  context.strokeStyle = ENAMEL.edge
  context.lineWidth = 2.8
  context.stroke(circle)
  context.strokeStyle = ENAMEL.copper
  context.lineWidth = 1.6
  context.stroke(circle)
  context.strokeStyle = 'rgba(255, 255, 255, 0.75)'
  context.lineWidth = 1.1
  context.beginPath()
  context.arc(badge.x, badge.y, badge.radius - 2.4, Math.PI * 1.08, Math.PI * 1.45)
  context.stroke()
  badgeNumber(scene, ENAMEL.orange, '800')
}

// --- windwijzer: gietijzeren stang met verdigris-vin en een pijl die de wind in wijst ----------------------------

const VANE = { iron: '#1d2b29', verdigris: '#5ea592', patina: '#3f7f6f', copper: '#c98b4f', cream: '#f4efe2' }

function vaneBody({ context, shape, strength, dark }: SockScene): void {
  const filled = windsockFill(strength)
  const fin = 4.5 + 3 * filled
  // De vin: een vaan die snel op hoogte komt, recht doorloopt en eindigt in een zwaluwstaart.
  const height = (t: number) => fin * Math.min(1, (t - 0.5) / 0.12)
  const vane = ribbon(shape, 0.5, 1, height, () => 0, 20)
  const notch = axisAt(shape, 0.9).point
  const finPath = pathOf([...vane.left, notch, ...vane.right.slice().reverse()])
  const start = axisAt(shape, 0)
  const towardX = Math.sin(start.heading * Math.PI / 180), towardY = -Math.cos(start.heading * Math.PI / 180)
  // De stang loopt door de badge naar een pijlpunt bovenwinds: een windvaan wijst waar de wind vandaan komt.
  const reach = 15
  const tip: Point = [-towardX * (reach + 7.5), -towardY * (reach + 7.5)]
  const base: Point = [-towardX * reach, -towardY * reach]
  const head = pathOf([tip, [base[0] - towardY * 4.4, base[1] + towardX * 4.4], [base[0] + towardY * 4.4, base[1] - towardX * 4.4]])
  const rod = lineOf([base, ...Array.from({ length: 21 }, (_, step) => axisAt(shape, step / 20 * 0.97).point)])
  for (const [path, width] of [[finPath, 3.2], [rod, 4.6], [head, 3.2]] as const) underlay(context, path, dark, width)
  context.strokeStyle = VANE.iron
  context.lineWidth = 1.9
  context.stroke(rod)
  const gradient = context.createLinearGradient(...axisAt(shape, 0.5).point, ...axisAt(shape, 1).point)
  gradient.addColorStop(0, VANE.verdigris)
  gradient.addColorStop(1, VANE.patina)
  context.fillStyle = gradient
  context.fill(finPath)
  // Twee gesmede ribben in de vin en een koperen randje waar de patina is afgesleten.
  context.strokeStyle = 'rgba(29, 43, 41, 0.6)'
  context.lineWidth = 0.6
  for (const t of [0.66, 0.8]) {
    const { point: [x, y], heading } = axisAt(shape, t)
    const radians = heading * Math.PI / 180, size = height(t) * 0.85
    context.stroke(lineOf([[x - Math.cos(radians) * size, y - Math.sin(radians) * size], [x + Math.cos(radians) * size, y + Math.sin(radians) * size]]))
  }
  context.strokeStyle = VANE.copper
  context.lineWidth = 0.7
  context.stroke(lineOf(vane.left))
  context.strokeStyle = VANE.iron
  context.lineWidth = 0.9
  context.stroke(finPath)
  context.fillStyle = VANE.iron
  context.fill(head)
}

function vaneBadge(scene: SockScene): void {
  const { context, badge } = scene
  const circle = badgeDisc(context, badge, VANE.cream)
  context.strokeStyle = VANE.iron
  context.lineWidth = 1.8
  context.stroke(circle)
  context.strokeStyle = VANE.verdigris
  context.lineWidth = 0.7
  context.beginPath()
  context.arc(badge.x, badge.y, badge.radius - 1.9, 0, Math.PI * 2)
  context.stroke()
  badgeNumber(scene, VANE.iron, '800')
}

// --- wimpel: art-nouveaubanier met golf, zwaluwstaart en sierknoop -----------------------------------------------

const PENNANT = { red: '#cf461c', cream: '#f5e8cc', brown: '#3b1d10', gold: '#c8963e' }

function pennantRibbon(scene: SockScene, inset: number) {
  const half = 7.5 + 1.5 * windsockFill(scene.strength)
  return ribbon(scene.shape, 0.04, 1, (t) => Math.max(0.4, half * (1 - 0.45 * t) - inset), pennantWave(scene))
}

/** Sierlijke golf: groeit naar de staart, rustiger bij harde wind (de banier staat dan strakker). */
function pennantWave({ strength, phase }: SockScene): (t: number) => number {
  const filled = windsockFill(strength)
  return (t) => (1.8 - 0.8 * filled) * t * Math.sin(2 * Math.PI * 0.9 * t + phase)
}

function pennantBody(scene: SockScene): void {
  const { context, shape, dark } = scene
  const outer = pennantRibbon(scene, 0), inner = pennantRibbon(scene, 1.6)
  // Diepe zwaluwstaart: de inkeping reikt tot een vijfde van de lengte.
  const notch = axisAt(shape, 0.8).point
  const outerPath = pathOf([...outer.left, notch, ...outer.right.slice().reverse()])
  const innerPath = pathOf([...inner.left, notch, ...inner.right.slice().reverse()])
  underlay(context, outerPath, dark, 3.2)
  context.fillStyle = PENNANT.cream
  context.fill(outerPath)
  context.fillStyle = PENNANT.red
  context.fill(innerPath)
  // Een crème middenstreep, als het biesje op een vaandel.
  const stripe = ribbon(shape, 0.08, 0.74, () => 1.1, pennantWave(scene), 18)
  context.fillStyle = PENNANT.cream
  context.fill(pathOf([...stripe.left, ...stripe.right.slice().reverse()]))
  context.strokeStyle = PENNANT.brown
  context.lineWidth = 0.9
  context.stroke(outerPath)
}

function pennantBadge(scene: SockScene): void {
  const { context, badge } = scene
  const circle = badgeDisc(context, badge, PENNANT.cream)
  context.strokeStyle = PENNANT.brown
  context.lineWidth = 1
  context.stroke(circle)
  // Parelrand: zestien kraaltjes rond de badge, als de sierknoop aan de mast.
  context.fillStyle = PENNANT.gold
  for (let bead = 0; bead < 16; bead++) {
    const angle = bead / 16 * Math.PI * 2
    context.beginPath()
    context.arc(badge.x + Math.cos(angle) * (badge.radius + 1.6), badge.y + Math.sin(angle) * (badge.radius + 1.6), 0.95, 0, Math.PI * 2)
    context.fill()
  }
  badgeNumber(scene, PENNANT.red, '800')
}

// --- glans: de huidige zak met gloed en een lichtspoor dat met de wind meegaat -----------------------------------

function glowBody(scene: SockScene): void {
  const { context, shape, strength, dark, seconds, phase } = scene
  const outline = pathOf(windsockOutline(shape))
  for (const [width, alpha] of [[10, 0.07], [7, 0.1], [4.5, 0.16]] as const) {
    context.strokeStyle = `rgba(255, ${dark ? 196 : 170}, 110, ${dark ? alpha * 1.6 : alpha})`
    context.lineWidth = width
    context.stroke(outline)
  }
  // Lichtspoor: de laatste koers van de zak voortgezet, langer bij meer wind, uitdovend.
  const end = axisAt(shape, 1)
  const length = 8 + 4 * strength
  const radians = end.heading * Math.PI / 180
  const tail: Point = [end.point[0] + Math.sin(radians) * length, end.point[1] - Math.cos(radians) * length]
  const trail = context.createLinearGradient(...end.point, ...tail)
  trail.addColorStop(0, dark ? 'rgba(255, 236, 205, 0.85)' : 'rgba(255, 246, 228, 0.95)')
  trail.addColorStop(1, 'rgba(255, 246, 228, 0)')
  context.strokeStyle = trail
  context.lineWidth = 2.6
  context.stroke(lineOf([end.point, tail]))
  // Een vonkje dat over het spoor reist; het beweegt alleen mee als de laag toch al animeert (trilling).
  const spark = (seconds * (0.6 + strength * 0.12) + phase / (2 * Math.PI)) % 1
  context.fillStyle = `rgba(255, 255, 255, ${0.9 * (1 - spark)})`
  context.beginPath()
  context.arc(...mix(end.point, tail, spark), 1.4, 0, Math.PI * 2)
  context.fill()
  sockBody(scene)
}

function glowBadge(scene: SockScene): void {
  const { context, badge, dark } = scene
  context.strokeStyle = `rgba(255, 180, 110, ${dark ? 0.45 : 0.3})`
  context.lineWidth = 4
  context.beginPath()
  context.arc(badge.x, badge.y, badge.radius + 1.5, 0, Math.PI * 2)
  context.stroke()
  sockBadge(scene)
}

const LOOKS: Record<WindsockStyleName, Look> = {
  zak: { body: (scene) => sockBody(scene), badge: sockBadge },
  gravure: { body: engravingBody, badge: engravingBadge },
  emaille: { body: enamelBody, badge: enamelBadge },
  windwijzer: { body: vaneBody, badge: vaneBadge },
  wimpel: { body: pennantBody, badge: pennantBadge },
  glans: { body: glowBody, badge: glowBadge },
}

export function windsockStyleName(value: string | null): WindsockStyleName {
  return WINDSOCK_STYLE_NAMES.find((name) => name === value) ?? DEFAULT_WINDSOCK_STYLE
}
