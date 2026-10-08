import type { LoopMode } from './stills.js'

export class StillRenderError extends Error {
  readonly timeout: boolean
  constructor(readonly mode: LoopMode, readonly phase: string, readonly frame: number | undefined, cause: unknown) {
    super(`Renderer ${mode} mislukt bij ${phase}`, { cause })
    this.timeout = cause instanceof Error && cause.name === 'TimeoutError'
  }
}
