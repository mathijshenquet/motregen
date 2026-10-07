import { describe, expect, it } from 'vitest'
import { DecodeQueue } from './decode-queue'

function drain(queue: DecodeQueue<string>): string[] {
  const order: string[] = []
  for (let job = queue.take(); job !== undefined; job = queue.take()) order.push(job)
  return order
}

describe('DecodeQueue', () => {
  it('serves the cursor frame before point series and those before background work', () => {
    const queue = new DecodeQueue<string>()
    queue.enqueue('a', 'background', 'prefetch-1')
    queue.enqueue('b', 'series', 'table-1')
    queue.enqueue('c', 'background', 'prefetch-2')
    queue.enqueue('d', 'cursor', 'scrub-frame')
    queue.enqueue('e', 'series', 'table-2')
    expect(queue.size).toBe(5)
    expect(drain(queue)).toEqual(['scrub-frame', 'table-1', 'table-2', 'prefetch-1', 'prefetch-2'])
    expect(queue.size).toBe(0)
  })

  it('moves a waiting background decode ahead once the cursor needs that frame', () => {
    const queue = new DecodeQueue<string>()
    queue.enqueue('frame-1', 'background', 'frame-1')
    queue.enqueue('frame-2', 'background', 'frame-2')
    queue.enqueue('frame-3', 'series', 'frame-3')
    queue.promote('frame-2', 'cursor')
    expect(drain(queue)).toEqual(['frame-2', 'frame-3', 'frame-1'])
  })

  it('never demotes: a cursor decode stays first when background work asks for the same frame', () => {
    const queue = new DecodeQueue<string>()
    queue.enqueue('frame-1', 'series', 'frame-1')
    queue.enqueue('frame-2', 'cursor', 'frame-2')
    queue.promote('frame-2', 'background')
    queue.promote('frame-2', 'series')
    queue.promote('unknown', 'cursor')
    expect(drain(queue)).toEqual(['frame-2', 'frame-1'])
  })
})
