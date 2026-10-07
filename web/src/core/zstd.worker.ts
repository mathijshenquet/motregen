/// <reference lib="webworker" />
import { decodeFrame } from './mrf'
import type { PredFrameSpec } from './pred'

self.onmessage = ({ data }: MessageEvent<{ id: number; bytes: ArrayBuffer; expectedLength: number; pred?: PredFrameSpec }>) => {
  const started = performance.now()
  try {
    const frame = decodeFrame(new Uint8Array(data.bytes), data.expectedLength, data.pred)
    const bytes = frame.byteOffset === 0 && frame.byteLength === frame.buffer.byteLength
      ? frame.buffer
      : frame.slice().buffer
    self.postMessage({ id: data.id, frame: bytes, duration: performance.now() - started }, { transfer: [bytes] })
  } catch (error) {
    self.postMessage({ id: data.id, error: error instanceof Error ? error.message : String(error), duration: performance.now() - started })
  }
}
