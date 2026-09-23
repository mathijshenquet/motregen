/// <reference lib="webworker" />
import { computeIsolines, type IsolineRequest } from './isolines'

self.onmessage = ({ data }: MessageEvent<IsolineRequest>) => {
  try {
    self.postMessage(computeIsolines(data))
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : String(error) })
  }
}
