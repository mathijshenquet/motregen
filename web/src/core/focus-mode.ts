import { DEFAULT_WIND_TUNING, WIND_FOCUS_INTENSITY } from './wind-layer'

/** Zichtbaarheid van regen, wind en zon tijdens volle temperatuurfocus (Focus dim, U8; knop weg in U30). */
export const FOCUS_DIM = 0.25
/** Volle tweenduur in en uit (Tween in/uit, U19 vastgezet; knop weg in U30). */
export const FOCUS_IN_MS = 250
export const FOCUS_OUT_MS = 400

export interface FocusTween {
  from: number
  to: number
  start: number
  duration: number
}

export function easeOutCubic(t: number): number {
  const clamped = Math.max(0, Math.min(1, t))
  return 1 - (1 - clamped) ** 3
}

export function focusValue(tween: FocusTween, now: number): number {
  if (tween.duration <= 0 || now >= tween.start + tween.duration) return tween.to
  return tween.from + (tween.to - tween.from) * easeOutCubic((now - tween.start) / tween.duration)
}

/**
 * Nieuw doel vanaf de huidige waarde. De duur schaalt met de resterende afstand, zodat
 * een halverwege omgekeerde hover niet de volle duur voor een half traject neemt.
 */
export function retargetFocus(tween: FocusTween, now: number, target: number, reducedMotion: boolean): FocusTween {
  const from = focusValue(tween, now)
  const full = target > from ? FOCUS_IN_MS : FOCUS_OUT_MS
  const duration = reducedMotion ? 0 : full * Math.abs(target - from)
  return { from, to: target, start: now, duration }
}

/** Dekking van de gedimde context (regen, wind, zon) bij focuswaarde `focus`. */
export function contextOpacity(focus: number, dim: number): number {
  return 1 - focus * (1 - dim)
}

/** Verzadiging van de basiskaart tijdens volle temperatuurfocus (PO U25b). */
export const MAP_FOCUS_SATURATION = 0.55

/** Verzadiging van de basiskaart bij temperatuurfocus `focus`. */
export function mapSaturation(focus: number): number {
  return 1 - focus * (1 - MAP_FOCUS_SATURATION)
}

/** Windfocus tweent de gedempte windlaag terug naar vol: de default komt precies op WIND_FOCUS_INTENSITY. */
export const WIND_FOCUS_GAIN = WIND_FOCUS_INTENSITY / DEFAULT_WIND_TUNING.intensity

export function windFocusIntensity(intensity: number, focus: number): number {
  return intensity * (1 + focus * (WIND_FOCUS_GAIN - 1))
}

// 'clouds' (U34) is alleen een scrubbermodus (de drie wolkenlagen); de kaart kent er geen tween voor.
export type FocusKind = 'temperature' | 'wind' | 'clouds'

type FrameScheduler = (callback: (now: number) => void) => number

/**
 * Houdt per modus bij welke bronnen (tabel, toetsenbord, vastgezet) focus vragen. Modi sluiten
 * elkaar uit: de modus van de laatst geactiveerde, nog actieve bron wint. Elke modus tweent zijn
 * eigen waarde 0→1 in één rAF-loop die alleen loopt zolang er iets beweegt.
 */
export class FocusMode<Mode extends string = FocusKind> {
  // Map-volgorde is activeringsvolgorde: heractiveren zet een bron achteraan.
  private readonly sources = new Map<string, Mode>()
  private readonly tweens = new Map<Mode, FocusTween>()
  private readonly emitted = new Map<Mode, number>()
  private frame: number | undefined

  constructor(
    modes: readonly Mode[],
    private readonly onValue: (mode: Mode, value: number) => void,
    private readonly reducedMotion: () => boolean,
    private readonly now: () => number = () => performance.now(),
    private readonly requestFrame: FrameScheduler = (callback) => requestAnimationFrame(callback),
    private readonly cancelFrame: (handle: number) => void = (handle) => cancelAnimationFrame(handle),
  ) {
    for (const mode of modes) {
      this.tweens.set(mode, { from: 0, to: 0, start: 0, duration: 0 })
      this.emitted.set(mode, 0)
    }
  }

  set(mode: Mode, source: string, active: boolean): void {
    const key = `${mode}:${source}`
    if (active) {
      if (this.sources.get(key) === mode && [...this.sources.keys()].at(-1) === key) return
      this.sources.delete(key)
      this.sources.set(key, mode)
    } else if (!this.sources.delete(key)) return
    const winner = this.active()
    let changed = false
    for (const [tweenMode, tween] of this.tweens) {
      const target = tweenMode === winner ? 1 : 0
      if (target === tween.to) continue
      this.tweens.set(tweenMode, retargetFocus(tween, this.now(), target, this.reducedMotion()))
      changed = true
    }
    if (changed) this.tick()
  }

  has(mode: Mode, source: string): boolean {
    return this.sources.has(`${mode}:${source}`)
  }

  active(): Mode | undefined {
    return [...this.sources.values()].at(-1)
  }

  dispose(): void {
    if (this.frame !== undefined) this.cancelFrame(this.frame)
    this.frame = undefined
  }

  private tick(): void {
    if (this.frame !== undefined) return
    const step = () => {
      this.frame = undefined
      const now = this.now()
      let moving = false
      for (const [mode, tween] of this.tweens) {
        const value = focusValue(tween, now)
        if (value !== this.emitted.get(mode)) {
          this.emitted.set(mode, value)
          this.onValue(mode, value)
        }
        if (now < tween.start + tween.duration) moving = true
      }
      if (moving) this.frame = this.requestFrame(step)
    }
    step()
  }
}
