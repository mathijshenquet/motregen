export class FrameBatcher {
  private handle?: number

  constructor(
    private readonly publish: () => void,
    private readonly requestFrame: (callback: FrameRequestCallback) => number = (callback) => requestAnimationFrame(callback),
    private readonly cancelFrame: (handle: number) => void = (handle) => cancelAnimationFrame(handle),
  ) {}

  schedule(): void {
    if (this.handle !== undefined) return
    this.handle = this.requestFrame(() => {
      this.handle = undefined
      this.publish()
    })
  }

  flush(): void {
    if (this.handle === undefined) return
    this.cancelFrame(this.handle)
    this.handle = undefined
    this.publish()
  }

  cancel(): void {
    if (this.handle === undefined) return
    this.cancelFrame(this.handle)
    this.handle = undefined
  }
}
