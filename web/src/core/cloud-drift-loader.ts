import { cloudDriftAt, type CloudDriftSample } from './cloud-map'

const HOUR = 3_600_000

export class CloudDriftLoader {
  readonly path: CloudDriftSample[] = []
  private readonly epochs: number[] = []
  private readonly anchor: number
  private left: number
  private right: number
  private queue: Promise<void> = Promise.resolve()
  private backgroundStarted = false

  constructor(first: number, last: number, selected: number,
    private readonly velocity: (epoch: number) => Promise<readonly [number, number]>,
    private readonly previous: readonly CloudDriftSample[] = [],
  ) {
    this.epochs.push(first)
    for (let epoch = Math.floor(first / HOUR + 1) * HOUR; epoch < last; epoch += HOUR) this.epochs.push(epoch)
    if (last > first) this.epochs.push(last)
    this.anchor = this.before(selected)
    this.left = this.anchor
    this.right = this.anchor - 1
  }

  private before(epoch: number): number {
    const right = this.epochs.findIndex((value) => value > epoch)
    return right < 0 ? this.epochs.length - 1 : Math.max(0, right - 1)
  }

  ensure(epoch: number): Promise<readonly CloudDriftSample[]> {
    // Birth anchors look back half an hour; bracket the whole displayed hour as well.
    const left = this.before(epoch - HOUR)
    const after = this.epochs.findIndex((value) => value >= epoch + HOUR)
    const right = after < 0 ? this.epochs.length - 1 : after
    return this.extend(Math.min(left, this.anchor), Math.max(right, this.anchor)).then(() => this.path)
  }

  prefetch(active: () => boolean): void {
    if (this.backgroundStarted || (this.left === 0 && this.right === this.epochs.length - 1)) return
    this.backgroundStarted = true
    void (async () => {
      while (active() && (this.left > 0 || this.right < this.epochs.length - 1)) {
        const backward = this.left > 0 && (this.right === this.epochs.length - 1 || this.anchor - this.left <= this.right - this.anchor)
        await this.extend(backward ? this.left - 1 : this.left, backward ? this.right : this.right + 1)
        await new Promise((resolve) => setTimeout(resolve, 0))
      }
    })().catch(() => {}).finally(() => { this.backgroundStarted = false })
  }

  private extend(left: number, right: number): Promise<void> {
    const work = this.queue.then(async () => {
      const missing: number[] = []
      for (let index = Math.min(left, this.left); index <= Math.max(right, this.right); index++) {
        if (index < this.left || index > this.right) missing.push(index)
      }
      const loaded = new Map<number, CloudDriftSample>()
      let next = 0
      await Promise.all(Array.from({ length: Math.min(4, missing.length) }, async () => {
        while (next < missing.length) {
          const index = missing[next++]!, epoch = this.epochs[index]!
          loaded.set(index, { epoch, velocity: await this.velocity(epoch), position: [0, 0] })
        }
      }))
      if (!this.path.length) {
        const seed = loaded.get(this.anchor)!
        seed.position = cloudDriftAt(this.previous, seed.epoch)
        this.path.push(seed)
        this.right = this.anchor
      }
      // Only append/prepend: positions and velocities already used on screen never change.
      while (this.left > left) {
        const sample = loaded.get(--this.left)!, adjacent = this.path[0]!
        sample.position = integrate(adjacent, sample)
        this.path.unshift(sample)
      }
      while (this.right < right) {
        const sample = loaded.get(++this.right)!, adjacent = this.path.at(-1)!
        sample.position = integrate(adjacent, sample)
        this.path.push(sample)
      }
    })
    this.queue = work.catch(() => {})
    return work
  }
}

function integrate(from: CloudDriftSample, to: CloudDriftSample): [number, number] {
  const hours = (to.epoch - from.epoch) / HOUR
  return [0, 1].map((axis) => from.position[axis]! + (from.velocity[axis]! + to.velocity[axis]!) * hours / 2) as [number, number]
}
