// Opslag en schrijfvolume van regiobestanden op prod (MIP-40), uit de JSON van regio-knie.ts.
// Gebruik: pnpm exec tsx scripts/regio-opslag.ts <regio-knie.json> [--live-mb 108] [--live-files 347]
//   [--writes-mb-per-day 430] [--client-kb 2358,2740]
import { readFileSync } from 'node:fs'

type Encoded = { meanBytes: number; totalBytes: number; diskBytes: number }
type GroupFiles = { group: 'radar' | 'harmonie' | 'extra'; files: number; centre: Encoded; all: Encoded }
type Entry = { now: string; regions: number; files: GroupFiles[] }

// Ververst: radar elke 5 min, HARMONIE elk uur, extra op het UV-ritme (15 min, crates/ingest uv_cadence); ICON-D2
// (3 u) valt daarbinnen.
const RUNS_PER_DAY = { radar: 288, harmonie: 24, extra: 96 } as const
const CHUNK_WINDOW_HOURS = 6
const KEPT_RUNS = 2

const args = process.argv.slice(2)
const option = (name: string, fallback: string) => {
  const index = args.indexOf(name)
  return index >= 0 ? args[index + 1]! : fallback
}
const input = args.find((arg, index) => !arg.startsWith('--') && !args[index - 1]?.startsWith('--'))
if (!input) throw new Error('gebruik: regio-opslag.ts <regio-knie.json>')
const baselineLiveBytes = Number(option('--live-mb', '108')) * 1e6
const baselineFiles = Number(option('--live-files', '347'))
const baselineWriteBytes = Number(option('--writes-mb-per-day', '430')) * 1e6
const [clientLowBytes, clientHighBytes] = option('--client-kb', '2358,2740').split(',').map((value) => Number(value) * 1e3) as [number, number]

const entries = JSON.parse(readFileSync(input, 'utf8')) as Entry[]
const regionCounts = [...new Set(entries.map((entry) => entry.regions))].sort((left, right) => left - right)

type Costs = { liveWindowBytes: number; liveKeptBytes: number; writeBytesPerDay: number; liveWindowFiles: number; liveKeptFiles: number; clientBytes: number }
const costs = (entry: Entry, variant: 'centre' | 'all'): Costs => {
  const sum = (perGroup: (group: GroupFiles) => number) => entry.files.reduce((total, group) => total + perGroup(group), 0)
  const runsInWindow = (group: GroupFiles) => RUNS_PER_DAY[group.group] * CHUNK_WINDOW_HOURS / 24
  return {
    liveWindowBytes: sum((group) => group[variant].diskBytes * runsInWindow(group)),
    liveKeptBytes: sum((group) => group[variant].diskBytes * KEPT_RUNS),
    writeBytesPerDay: sum((group) => group[variant].diskBytes * RUNS_PER_DAY[group.group]),
    liveWindowFiles: sum((group) => group.files * runsInWindow(group)),
    liveKeptFiles: sum((group) => group.files * KEPT_RUNS),
    clientBytes: sum((group) => group[variant].meanBytes),
  }
}

const number = (value: number, digits: number) => value.toLocaleString('nl-NL', { maximumFractionDigits: digits, minimumFractionDigits: digits })
const range = (values: number[], render: (value: number) => string) => {
  const low = Math.min(...values)
  const high = Math.max(...values)
  return render(low) === render(high) ? render(low) : `${render(low)}–${render(high)}`
}
const megabytes = (bytes: number) => number(bytes / 1e6, bytes < 10e6 ? 1 : 0)
const percent = (value: number) => number(value, value < 10 ? 1 : 0)
const withIncrement = (values: number[], baseline: number) =>
  `${range(values, megabytes)} MB (+${range(values.map((value) => value / baseline * 100), percent)} %)`
const clientShare = (values: number[]) =>
  range([Math.min(...values) / clientHighBytes * 100, Math.max(...values) / clientLowBytes * 100], (value) => number(value, value < 1 ? 2 : 1)) + ' %'

const variants = [['centre', 'midden'], ['all', 'alle gridpunten']] as const
console.log(`Baseline prod: ${megabytes(baselineLiveBytes)} MB live, ${baselineFiles} bestanden, ${megabytes(baselineWriteBytes)} MB/dag geschreven; client nu ${clientLowBytes / 1e3}–${clientHighBytes / 1e3} kB`)
console.log('Opslag op schijf in 4 KiB-blokken; bereik = nat–droog; % = bovenop de baseline.\n')
console.log(`| regio's | variant | live, ${CHUNK_WINDOW_HOURS} u-venster | live, nieuwste + 1 run | geschreven per dag | live bestanden (${CHUNK_WINDOW_HOURS} u / nieuwste + 1) | client per locatie (% van nu) |`)
console.log('| ---: | --- | ---: | ---: | ---: | ---: | ---: |')
for (const regionCount of regionCounts) {
  const snapshots = entries.filter((entry) => entry.regions === regionCount)
  for (const [variant, label] of variants) {
    const rows = snapshots.map((entry) => costs(entry, variant))
    const files = rows[0]!
    console.log(`| ${regionCount} | ${label} | ${withIncrement(rows.map((row) => row.liveWindowBytes), baselineLiveBytes)} | ${withIncrement(rows.map((row) => row.liveKeptBytes), baselineLiveBytes)} | ${withIncrement(rows.map((row) => row.writeBytesPerDay), baselineWriteBytes)} | ${number(files.liveWindowFiles, 0)} / ${number(files.liveKeptFiles, 0)} (+${percent(files.liveWindowFiles / baselineFiles * 100)} / +${percent(files.liveKeptFiles / baselineFiles * 100)} %) | ${range(rows.map((row) => row.clientBytes), (bytes) => number(bytes / 1e3, 1))} kB (${clientShare(rows.map((row) => row.clientBytes))}) |`)
  }
}
