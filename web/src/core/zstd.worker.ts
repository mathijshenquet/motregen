/// <reference lib="webworker" />
import { decodeFrame } from './mrf'

self.onmessage = ({ data }: MessageEvent<{ id: number; bytes: ArrayBuffer; expectedLength: number }>) => {
  try {
    const frame = decodeFrame(new Uint8Array(data.bytes), data.expectedLength)
    const bytes = frame.byteOffset === 0 && frame.byteLength === frame.buffer.byteLength
      ? frame.buffer
      : frame.slice().buffer
    self.postMessage({ id: data.id, frame: bytes }, { transfer: [bytes] })
  } catch (error) {
    self.postMessage({ id: data.id, error: error instanceof Error ? error.message : String(error) })
  }
}
