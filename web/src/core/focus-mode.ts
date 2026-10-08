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

/** Regen verdwijnt bij temperatuurfocus en dimt tot de helft bij volledige windfocus. */
export function rainFocusOpacity(temperatureFocus: number, windFocus: number): number {
  return (1 - temperatureFocus) * (1 - 0.5 * windFocus)
}

// Proef achter ?dev (U62, eigenaar U62, vervalt 2026-10-15): hoe de regen zich mengt met de kaart in Wind en
// met de bewolkingssluier in Lucht. `alfa` en `nu` zijn het bestaande gedrag.
export const RAIN_WIND_BLENDS = ['alfa', 'vermenigvuldigen', 'gedempt'] as const
export type RainWindBlend = typeof RAIN_WIND_BLENDS[number]
export const RAIN_AIR_BLENDS = ['nu', 'voorstel'] as const
export type RainAirBlend = typeof RAIN_AIR_BLENDS[number]

export interface RainPresentation {
  opacity: number
  /** 1 = het palet zoals het is; lager is grijzer bij gelijke helderheid. */
  saturation: number
  /** 1 = het palet zoals het is; lager is donkerder bij gelijke tint. */
  brightness: number
  /** De regen vermenigvuldigt met de kaart in plaats van eroverheen te liggen (alleen op een lichte kaart). */
  multiply: boolean
}

/**
 * Hoe de regen getekend wordt bij deze focuswaarden. In Wind dimt `alfa` de regen tot de helft, wat op de
 * lichte kaart verbleekt (geel wordt crème); `vermenigvuldigen` en `gedempt` houden de tint. In Lucht laat
 * `voorstel` de regen overdag met de witte sluier vermenigvuldigen en 's nachts gedempt terugtreden.
 */
export function rainPresentation(input: { temperatureFocus: number; windFocus: number; airFocus: number; night: boolean; windBlend: RainWindBlend; airBlend: RainAirBlend }): RainPresentation {
  const { windFocus, airFocus, night } = input
  let opacity = 1 - input.temperatureFocus
  let saturation = 1
  let brightness = 1
  let multiply = false
  // Op een donkere kaart maakt vermenigvuldigen de regen onzichtbaar; daar geldt de gedempte variant.
  const windBlend = input.windBlend === 'vermenigvuldigen' && night ? 'gedempt' : input.windBlend
  if (windBlend === 'alfa') opacity *= 1 - 0.5 * windFocus
  else if (windBlend === 'vermenigvuldigen') {
    opacity *= 1 - 0.1 * windFocus
    multiply = windFocus >= 0.5
  } else {
    opacity *= 1 - 0.2 * windFocus
    saturation *= 1 - 0.3 * windFocus
    brightness *= 1 - 0.1 * windFocus
  }
  if (input.airBlend === 'voorstel') {
    if (night) {
      opacity *= 1 - 0.3 * airFocus
      saturation *= 1 - 0.3 * airFocus
      brightness *= 1 - 0.15 * airFocus
    } else {
      // Overdag is de sluier wit: eroverheen leggen verbleekt de regen, vermenigvuldigen geeft het palet zelf.
      // (Eerste proef, regen op 0,8 en donkerder, maakte het beeld alleen maar bleker.)
      multiply ||= airFocus >= 0.5
    }
  }
  return { opacity, saturation, brightness, multiply }
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

export type FocusKind = 'weather' | 'air' | 'temperature' | 'wind'
export const DEFAULT_FOCUS_MODE: FocusKind = 'weather'

type FrameScheduler = (callback: (now: number) => void) => number

/**
 * Houdt per modus bij welke bronnen (tabel, toetsenbord, vastgezet) focus vragen. Modi sluiten
 * elkaar uit: de modus van de laatst geactiveerde, nog actieve bron wint. Elke modus tweent zijn
 * eigen waarde 0→1 in één rAF-loop die alleen loopt zolang er iets beweegt.
 */
export class FocusMode<Mode extends string = FocusKind> {
  private static readonly PIN_SOURCE = 'fixed-pin'
  // Map-volgorde is activeringsvolgorde: heractiveren zet een bron achteraan.
  private readonly sources = new Map<string, Mode>()
  private readonly tweens = new Map<Mode, FocusTween>()
  private readonly emitted = new Map<Mode, number>()
  private pinnedMode: Mode
  private frame: number | undefined

  constructor(
    modes: readonly Mode[],
    defaultMode: Mode,
    private readonly onValue: (mode: Mode, value: number) => void,
    private readonly reducedMotion: () => boolean,
    private readonly now: () => number = () => performance.now(),
    private readonly requestFrame: FrameScheduler = (callback) => requestAnimationFrame(callback),
    private readonly cancelFrame: (handle: number) => void = (handle) => cancelAnimationFrame(handle),
  ) {
    if (!modes.includes(defaultMode)) throw new Error(`Default focus mode ${defaultMode} is not registered`)
    this.pinnedMode = defaultMode
    for (const mode of modes) {
      const initial = mode === defaultMode ? 1 : 0
      this.tweens.set(mode, { from: initial, to: initial, start: 0, duration: 0 })
      this.emitted.set(mode, initial)
    }
    this.sources.set(this.sourceKey(defaultMode, FocusMode.PIN_SOURCE), defaultMode)
    this.onValue(defaultMode, 1)
  }

  set(mode: Mode, source: string, active: boolean): void {
    const key = this.sourceKey(mode, source)
    if (active) {
      if (this.sources.get(key) === mode && [...this.sources.keys()].at(-1) === key) return
      this.sources.delete(key)
      this.sources.set(key, mode)
    } else if (!this.sources.delete(key)) return
    this.retargetToActiveMode()
  }

  pin(mode: Mode): boolean {
    if (mode === this.pinnedMode) return false
    this.sources.delete(this.sourceKey(this.pinnedMode, FocusMode.PIN_SOURCE))
    this.pinnedMode = mode
    this.sources.set(this.sourceKey(mode, FocusMode.PIN_SOURCE), mode)
    this.retargetToActiveMode()
    return true
  }

  pinned(): Mode {
    return this.pinnedMode
  }

  has(mode: Mode, source: string): boolean {
    return this.sources.has(this.sourceKey(mode, source))
  }

  active(): Mode {
    return [...this.sources.values()].at(-1) ?? this.pinnedMode
  }

  dispose(): void {
    if (this.frame !== undefined) this.cancelFrame(this.frame)
    this.frame = undefined
  }

  private sourceKey(mode: Mode, source: string): string {
    return `${mode}:${source}`
  }

  private retargetToActiveMode(): void {
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
