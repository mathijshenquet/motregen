import { hostLoadAverage, runLoadLimit, waitForQuietHost } from './rig-host.ts'

// U65's volgordecapture onder load houdt de lock en mag nooit een timingbaseline leveren.
if (process.env.MOTREGEN_PERF_REQUEST_ORDER_ONLY !== '1') {
  if (process.argv.includes('--check')) {
    if (hostLoadAverage() > runLoadLimit()) {
      console.error(`loadavg ${hostLoadAverage()} > ${runLoadLimit()}: lock vrijgeven, buiten de lock wachten`)
      process.exitCode = 76
    }
  } else if (!await waitForQuietHost(Number(process.env.MOTREGEN_PERF_LOAD_WAIT_MINUTES ?? 20) * 60_000, console.log)) {
    console.error('Host blijft te druk; geen meting')
    process.exitCode = 1
  }
}
