/// <reference lib="webworker" />
import { decodeFrame } from './mrf'

self.onmessage = ({ data }: MessageEvent<{ id: number; bytes: ArrayBuffer; expectedLength: number }>) => {
  try {
    const frame = decodeFrame(new Uint8Array(data.bytes), data.expectedLength)
    self.postMessage({ id: data.id, frame: frame.buffer }, { transfer: [frame.buffer] })
  } catch (error) {
    self.postMessage({ id: data.id, error: error instanceof Error ? error.message : String(error) })
  }
}
