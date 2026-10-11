import type { Manifest, Source } from './contract.js'

const chunk = (source: Source, run: string, times: string[]) => ({ url: `${source}.mrf`, source, run, header_len: 42, times })
const now = '2026-08-28T15:00:00Z'

export const overlapFixture: Manifest = { version: 0, generated: now, now, chunks: [
  chunk('harmonie', '2026-08-28T12:00:00Z', [now]),
  chunk('nowcast', '2026-08-28T14:00:00Z', [now, '2026-08-28T15:05:00Z']),
  chunk('nowcast', '2026-08-28T14:55:00Z', [now]),
  chunk('rtcor', now, [now]),
] }

export const blendFixture: Manifest = { version: 0, generated: now, now, chunks: [
  chunk('rtcor', now, [now, '2026-08-28T15:10:00Z']),
] }
