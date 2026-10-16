/// <reference lib="webworker" />
import { traceRainContours, type RainContourMessage } from './rain-contours'

self.onmessage = ({ data }: MessageEvent<RainContourMessage>) => {
  const result = traceRainContours(data.bytes, data.grid, data.levels)
  self.postMessage(result, result.levels.map((level) => level.data.buffer))
}
