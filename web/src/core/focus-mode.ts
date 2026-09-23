export interface FocusTuning {
  /** Zichtbaarheid van regen, wind, wolkrand en zon tijdens volle focus (0–1). */
  dim: number
  inMs: number
  outMs: number
}

export const DEFAULT_FOCUS_TUNING: FocusTuning = { dim: 0.25, inMs: 250, outMs: 400 }

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
export function retargetFocus(tween: FocusTween, now: number, target: number, tuning: FocusTuning, reducedMotion: boolean): FocusTween {
  const from = focusValue(tween, now)
  const full = target > from ? tuning.inMs : tuning.outMs
  const duration = reducedMotion ? 0 : full * Math.abs(target - from)
  return { from, to: target, start: now, duration }
}

/** Dekking van de gedimde context (regen, wind, wolkrand, zon) bij focuswaarde `focus`. */
export function contextOpacity(focus: number, dim: number): number {
  return 1 - focus * (1 - dim)
}

type FrameScheduler = (callback: (now: number) => void) => number

/**
 * Houdt bij welke bronnen (kaartlabel, tabel, toetsenbord, vastgezet) focus vragen en
 * tweent één waarde 0→1 in een rAF-loop die alleen loopt zolang er iets beweegt.
 */
export class FocusMode {
  private readonly sources = new Set<string>()
  private tween: FocusTween = { from: 0, to: 0, start: 0, duration: 0 }
  private frame: number | undefined

  constructor(
    private readonly onValue: (value: number) => void,
    private tuning: () => FocusTuning,
    private readonly reducedMotion: () => boolean,
    private readonly now: () => number = () => performance.now(),
    private readonly requestFrame: FrameScheduler = (callback) => requestAnimationFrame(callback),
    private readonly cancelFrame: (handle: number) => void = (handle) => cancelAnimationFrame(handle),
  ) {}

  set(source: string, active: boolean): void {
    if (active) this.sources.add(source); else this.sources.delete(source)
    const target = this.sources.size ? 1 : 0
    if (target === this.tween.to) return
    this.tween = retargetFocus(this.tween, this.now(), target, this.tuning(), this.reducedMotion())
    this.tick()
  }

  has(source: string): boolean {
    return this.sources.has(source)
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
      this.onValue(focusValue(this.tween, now))
      if (now < this.tween.start + this.tween.duration) this.frame = this.requestFrame(step)
    }
    step()
  }
}
