import { spawnSync } from 'node:child_process'
import { hostLoadAverage, MAX_LOAD_AVERAGE } from './rig-host'

const loadAverage = hostLoadAverage()
if (loadAverage >= MAX_LOAD_AVERAGE) {
  console.log(`loadavg ${loadAverage} >= ${MAX_LOAD_AVERAGE}: lock vrijgeven en buiten de lock wachten`)
  process.exit(75)
}
const [command, ...args] = process.argv.slice(2)
if (!command) throw new Error('Geef het meetcommando op')
const run = spawnSync(command, args, {
  stdio: 'inherit',
  env: { ...process.env, MOTREGEN_PERF_LOCK_HELD: '1' },
})
if (run.error) throw run.error
process.exit(run.status ?? 1)
