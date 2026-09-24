/// <reference lib="webworker" />
import { TraceCore, type TracerMessage, type TracerReply } from './isoline-tracer'

let core: TraceCore | undefined

self.onmessage = ({ data }: MessageEvent<TracerMessage>) => {
  if (data.type === 'init') core = new TraceCore(data.grid, data.depth)
  else if (data.type === 'layer') core?.setLayer(data.index, data.values && data.valid ? { values: data.values, valid: data.valid } : undefined)
  else {
    let result
    try {
      result = core?.trace(data.request)
    } catch {
      result = undefined
    }
    const reply: TracerReply = { id: data.id, result }
    self.postMessage(reply, result ? [result.data.buffer] : [])
  }
}
