export class FrameBatcher {
  private handle?: number
  private publishedAt = Number.NEGATIVE_INFINITY

  /**
   * `minIntervalMs`: hooguit één publicatie per zoveel ms. De eerste komt meteen op het volgende
   * frame; daarna wacht een aanvraag op het eerste frame na het interval.
   */
  constructor(
    private readonly publish: () => void,
    private readonly requestFrame: (callback: FrameRequestCallback) => number = (callback) => requestAnimationFrame(callback),
    private readonly cancelFrame: (handle: number) => void = (handle) => cancelAnimationFrame(handle),
    private readonly minIntervalMs = 0,
    private readonly now: () => number = () => performance.now(),
  ) {}

  schedule(): void {
    if (this.handle !== undefined) return
    const onFrame = () => {
      if (this.now() - this.publishedAt < this.minIntervalMs) {
        this.handle = this.requestFrame(onFrame)
        return
      }
      this.handle = undefined
      this.publishNow()
    }
    this.handle = this.requestFrame(onFrame)
  }

  flush(): void {
    if (this.handle === undefined) return
    this.cancelFrame(this.handle)
    this.handle = undefined
    this.publishNow()
  }

  cancel(): void {
    if (this.handle === undefined) return
    this.cancelFrame(this.handle)
    this.handle = undefined
  }

  private publishNow(): void {
    this.publishedAt = this.now()
    this.publish()
  }
}
