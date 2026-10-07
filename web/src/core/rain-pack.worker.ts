/// <reference lib="webworker" />
import { packRainTexture } from './rain-pack'

self.onmessage = ({ data }: MessageEvent<{ id: number; bytes: ArrayBuffer }>) => {
  const packed = packRainTexture(new Uint8Array(data.bytes))
  self.postMessage({ id: data.id, packed: packed.buffer }, { transfer: [packed.buffer] })
}
