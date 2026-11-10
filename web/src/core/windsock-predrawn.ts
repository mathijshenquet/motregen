import { WINDSOCK_SAMPLES, windsockShape, type WindsockBadge, type WindsockShape } from './wind-glyph.js'
import { WINDSOCK_SWAY, WINDSOCK_SWAY_NUMBERS } from './windsock-flow.js'
import { drawSock } from './wind-sock-draw.js'

/**
 * Voorgetekende windzakken (`?dev&zakpaden=bitmap`, U111 ronde 3, PO 2026-11-10: "kan je die zakken niet
 * predrawen?"). Per stand één bitmap; per zak per frame alleen `drawImage` met de draaiing in de transform.
 * Een stand is de windkracht per `strength`-de Bft en de twee golffasen van het wuiven in `wave` en `ripple`
 * stappen per omloop, plus het uitdempen in `calm` stappen. De trage vlaag draait de hele zak (zijn waarde halverwege
 * de zak) in plaats van hem licht te buigen.
 */
export const PREDRAWN_STEPS = { strength: 8, wave: 16, ripple: 8, calm: 4 } as const
/**
 * `regular` (`?dev&zakgolf=regelmatig`): de tweede golf met 2× in plaats van 1,7× de eerste, dus vast ten opzichte van
 * de eerste per zak. Dan heeft een zak per krachtstap `wave` standen in plaats van `wave × ripple`; het wuiven wordt
 * wel regelmatiger (een PO-keuze).
 */
export type PredrawnWave = 'exact' | 'regular'
/** Bitmaps in de cache (twee canvassen per stand, ~50–120 kB per stand op DPR 3). */
const PREDRAWN_LIMIT = 240

export interface PredrawnPose {
  key: string
  /** De zak in zijn eigen richting (mond naar boven): zo staat hij in de bitmap. */
  local: WindsockShape
  /** Zoals hij op het scherm komt: `local` gedraaid met `rotation` graden; voor de vuile rechthoek. */
  screen: WindsockShape
  rotation: number
}

/**
 * Dezelfde golf als `swayBends` (windsock-flow) op gekwantiseerde kracht en fasen, maal `calm` (het wuifbudget).
 * `rotation`: de richting van de zak op het scherm (graden met de klok mee vanaf boven).
 */
export function predrawnPose(strength: number, wave: number, phase: number, seconds: number, calm: number, rotation: number, waveMode: PredrawnWave = 'exact'): PredrawnPose {
  const level = Math.round(strength * PREDRAWN_STEPS.strength) / PREDRAWN_STEPS.strength
  const calmLevel = Math.round(calm * PREDRAWN_STEPS.calm) / PREDRAWN_STEPS.calm
  const waveStep = calmLevel ? phaseStep(wave + phase, PREDRAWN_STEPS.wave) : 0
  const regular = waveMode === 'regular'
  const rippleStep = calmLevel ? phaseStep(regular ? 2.3 * phase : 1.7 * (wave + phase) + 2.3 * phase, PREDRAWN_STEPS.ripple) : 0
  const firstWave = waveStep / PREDRAWN_STEPS.wave * 2 * Math.PI
  const secondWave = (regular ? 2 * firstWave : 0) + rippleStep / PREDRAWN_STEPS.ripple * 2 * Math.PI
  const harmonic = regular ? 2 : 1.7
  const wavenumber = 2 * Math.PI / WINDSOCK_SWAY.wavelength(level)
  const swing = WINDSOCK_SWAY.amplitude(level), root = WINDSOCK_SWAY.root
  const bends = Array.from({ length: WINDSOCK_SAMPLES + 1 }, (_, index) => {
    const t = index / WINDSOCK_SAMPLES
    const ripple = (Math.sin(firstWave - wavenumber * t) + 0.35 * Math.sin(secondWave - harmonic * wavenumber * t)) / 1.35
    return calmLevel * swing * (root + (1 - root) * t ** 1.6) * ripple
  })
  const { gust } = WINDSOCK_SWAY
  const gustCalm = Math.min(1, level / WINDSOCK_SWAY_NUMBERS.amplitude.calmForce)
  const gustTurn = calmLevel * gust.amplitude * gustCalm * Math.sin(2 * Math.PI * gust.frequency * (seconds - gust.lag * 0.5) + 1.7 * phase)
  const turn = rotation + gustTurn
  return {
    key: `${waveMode}|${level}|${waveStep}|${rippleStep}|${calmLevel}`,
    local: windsockShape(level, bends, 'kaart'),
    screen: windsockShape(level, bends.map((bend) => bend + turn), 'kaart'),
    rotation: turn,
  }
}

function phaseStep(radians: number, steps: number): number {
  const turns = ((radians / (2 * Math.PI)) % 1 + 1) % 1
  return Math.round(turns * steps) % steps
}

interface Sprite {
  shadow: HTMLCanvasElement
  fabric: HTMLCanvasElement
  /** Canvaspixel van de mast in beide bitmaps. */
  originX: number
  originY: number
}

/** De bitmaps zelf, lui getekend en begrensd (minst recent gebruikt eruit); thema en DPR zitten in de sleutel. */
export class PredrawnSocks {
  hits = 0
  misses = 0
  private readonly sprites = new Map<string, Sprite>()

  constructor(private readonly context2d: (canvas: HTMLCanvasElement) => CanvasRenderingContext2D, private readonly fontFamily: string) {}

  get size(): number {
    return this.sprites.size
  }

  /** Tekent de zak met de mast in de huidige oorsprong van `context` (transform: ratio, eventueel verschoven). */
  draw(context: CanvasRenderingContext2D, pose: PredrawnPose, ratio: number, dark: boolean): void {
    const key = `${pose.key}|${dark}|${ratio}`
    let sprite = this.sprites.get(key)
    if (sprite) {
      this.sprites.delete(key)
      this.hits++
    } else {
      sprite = this.render(pose.local, ratio, dark)
      this.misses++
      if (this.sprites.size >= PREDRAWN_LIMIT) this.sprites.delete(this.sprites.keys().next().value!)
    }
    this.sprites.set(key, sprite)
    // De schaduw valt op het scherm 1,3 px omlaag, ongeacht de richting van de zak.
    for (const [canvas, down] of [[sprite.shadow, 1.3], [sprite.fabric, 0]] as const) {
      context.save()
      context.translate(0, down)
      context.rotate(pose.rotation * Math.PI / 180)
      context.scale(1 / ratio, 1 / ratio)
      context.drawImage(canvas, -sprite.originX, -sprite.originY)
      context.restore()
    }
  }

  private render(shape: WindsockShape, ratio: number, dark: boolean): Sprite {
    // Halve schaduwlijn (3,5 px) plus antialias, ruim.
    const margin = 3
    const points = [...shape.left, ...shape.right]
    const left = Math.min(...points.map(([x]) => x)) - margin, right = Math.max(...points.map(([x]) => x)) + margin
    const top = Math.min(...points.map(([, y]) => y)) - margin, bottom = Math.max(...points.map(([, y]) => y)) + margin
    const originX = Math.ceil(-left * ratio), originY = Math.ceil(-top * ratio)
    const width = originX + Math.ceil(right * ratio), height = originY + Math.ceil(bottom * ratio)
    const noBadge: WindsockBadge = { x: 0, y: 0, radius: 0, cutRadius: 0, fontPx: 0 }
    const layer = (parts: 'shadow' | 'fabric') => {
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const context = this.context2d(canvas)
      context.setTransform(ratio, 0, 0, ratio, originX, originY)
      drawSock({ context, shape, badge: noBadge, label: '', dark, fontFamily: this.fontFamily, parts })
      return canvas
    }
    return { shadow: layer('shadow'), fabric: layer('fabric'), originX, originY }
  }
}
