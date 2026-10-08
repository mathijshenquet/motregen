import { readFileSync } from 'node:fs'

interface StartCapture {
  accessLog: string | null
  timeOrigin: number
  finalUrl: string
  snapshot: { ttfrMs: number | null; ttfpMs: number | null }
}

interface AccessEntry {
  ts: number
  size: number
  status: number
  request: { uri: string; headers: Record<string, string[]> }
}

function category(entry: AccessEntry): string {
  const pathname = new URL(entry.request.uri, 'http://rig.local').pathname
  if (pathname === '/data/manifest.json') return 'manifest'
  if (pathname.endsWith('.pmtiles')) return 'kaarttegels'
  if (pathname.includes('/chunks/')) {
    const range = Object.entries(entry.request.headers).find(([name]) => name.toLowerCase() === 'range')?.[1][0]
    if (range?.startsWith('bytes=0-')) return 'weerheaders'
    return /\/(?:rtcor|nowcast|harmonie|seamless)-/.test(pathname) ? 'regenframes' : 'overige weervelden'
  }
  if (pathname.startsWith('/plaatsen-')) return 'plaatsen'
  if (pathname.endsWith('.pbf')) return 'fonts'
  if (pathname.startsWith('/basemap/style-')) return 'kaartstijl'
  if (pathname === '/sw.js') return 'serviceworker'
  if (pathname.startsWith('/assets/')) return 'appbundels'
  return 'overig'
}

const files = process.argv.slice(2)
if (!files.length) throw new Error('Gebruik: pnpm exec tsx scripts/start-upstream.ts CAPTURE.json [...]')
for (const file of files) {
  const capture = JSON.parse(readFileSync(file, 'utf8')) as StartCapture
  if (!capture.accessLog) throw new Error(`${file}: geen serveraccesslog vastgelegd`)
  const entries = readFileSync(capture.accessLog, 'utf8').split('\n').filter(Boolean)
    .map((line) => JSON.parse(line) as AccessEntry)
    .filter((entry) => entry.ts * 1_000 >= capture.timeOrigin && entry.ts * 1_000 <= capture.timeOrigin + 12_000)
  const groups = new Map<string, { requests: number; bodyBytes: number; statuses: Record<number, number> }>()
  for (const entry of entries) {
    const name = category(entry)
    const group = groups.get(name) ?? { requests: 0, bodyBytes: 0, statuses: {} }
    group.requests++
    group.bodyBytes += entry.size
    group.statuses[entry.status] = (group.statuses[entry.status] ?? 0) + 1
    groups.set(name, group)
  }
  console.log(JSON.stringify({ file, url: capture.finalUrl, ttfrMs: capture.snapshot.ttfrMs, ttfpMs: capture.snapshot.ttfpMs,
    windowMs: 12_000, requests: entries.length, bodyBytes: entries.reduce((sum, entry) => sum + entry.size, 0), groups: Object.fromEntries(groups) }))
}
