import { spawnSync } from 'node:child_process'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const originalRevision = process.argv[2] ?? 'bb0792b'
const directory = 'web/perf/baselines'
const rows = readdirSync(directory).filter((name) => name.endsWith('.json') && !name.startsWith('po-android-')).map((name) => {
  const before = spawnSync('git', ['show', `${originalRevision}:${directory}/${name}`], { encoding: 'utf8' })
  if (before.status !== 0) throw new Error(before.stderr)
  const original = JSON.parse(before.stdout)
  const current = JSON.parse(readFileSync(join(directory, name), 'utf8'))
  const wireDeltaPercent = (current.wireBytes / original.wireBytes - 1) * 100
  const decodeDeltaPercent = (current.decodes / original.decodes - 1) * 100
  return {
    name,
    originalBytes: original.wireBytes,
    currentBytes: current.wireBytes,
    wireDeltaPercent,
    originalDecodes: original.decodes,
    currentDecodes: current.decodes,
    decodeDeltaPercent,
    updatedContract: current.contractHash !== original.contractHash,
    withinOriginalLimits: wireDeltaPercent <= original.regressionLimitPercent && decodeDeltaPercent <= original.regressionLimitPercent && current.regressionLimitPercent === original.regressionLimitPercent,
  }
})
console.table(rows)
if (rows.some((row) => !row.updatedContract || !row.withinOriginalLimits)) process.exitCode = 1
