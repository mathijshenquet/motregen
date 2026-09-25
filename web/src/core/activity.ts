export interface IdleClock {
  now: () => number
  setTimeout: (callback: () => void, delay: number) => number
  clearTimeout: (handle: number) => void
}

/**
 * `idle` na `idleMs` zonder invoer, direct terug bij de eerste invoer (U41). Eén timer die bij afloop
 * de resttijd opnieuw zet: een pointermove kost alleen een tijdstempel, geen nieuwe timer.
 */
export function watchIdle(idleMs: number, clock: IdleClock, onChange: (idle: boolean) => void): { input: () => void; dispose: () => void } {
  let lastInput = clock.now()
  let idle = false
  let timer: number | undefined
  const arm = (delay: number) => { timer = clock.setTimeout(check, delay) }
  const check = () => {
    const quiet = clock.now() - lastInput
    if (quiet < idleMs) { arm(idleMs - quiet); return }
    timer = undefined
    idle = true
    onChange(true)
  }
  arm(idleMs)
  return {
    input: () => {
      lastInput = clock.now()
      if (!idle) return
      idle = false
      onChange(false)
      arm(idleMs)
    },
    dispose: () => { if (timer !== undefined) clock.clearTimeout(timer) },
  }
}
