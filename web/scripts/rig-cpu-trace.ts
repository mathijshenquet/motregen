import { readFileSync, readdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import type { CDPSession } from '@playwright/test'

interface CpuScopeSample {
  monotonicMs: number
  pid: number
  cgroup: string
  counters: Record<string, number>
  threads: Array<{ tid: number; name: string; cpuMs: number }>
}

export async function startRigCpuTrace(cdp: CDPSession, browserCdp: CDPSession) {
  await cdp.send('Performance.enable')
  await cdp.send('Tracing.start', {
    transferMode: 'ReturnAsStream',
    traceConfig: {
      recordMode: 'recordContinuously',
      traceBufferSizeInKb: 100_000,
      enableSampling: true,
      includedCategories: ['toplevel', 'devtools.timeline', 'v8', 'blink.user_timing', 'disabled-by-default-devtools.timeline', 'disabled-by-default-v8.cpu_profiler'],
    },
  })
  const scopeSamples: CpuScopeSample[] = []
  const ticksPerSecond = Number(execFileSync('getconf', ['CLK_TCK'], { encoding: 'utf8' }).trim())
  const errors: string[] = []
  let reading = false
  const sample = async () => {
    if (reading) return
    reading = true
    try {
      const processes = await browserCdp.send('SystemInfo.getProcessInfo')
      for (const renderer of processes.processInfo.filter(process => process.type === 'renderer')) {
        try {
          const cgroup = readFileSync(`/proc/${renderer.id}/cgroup`, 'utf8').trim().split('\n').find(line => line.startsWith('0::'))?.slice(3)
          if (!cgroup) continue
          const counters = Object.fromEntries(readFileSync(`/sys/fs/cgroup${cgroup}/cpu.stat`, 'utf8').trim().split('\n').map(line => {
            const [key, value] = line.split(' ')
            return [key!, Number(value)]
          }))
          const threads = readdirSync(`/proc/${renderer.id}/task`).flatMap(tid => {
            try {
              const stat = readFileSync(`/proc/${renderer.id}/task/${tid}/stat`, 'utf8')
              const endName = stat.lastIndexOf(')')
              const fields = stat.slice(endName + 2).split(' ')
              return [{ tid: Number(tid), name: stat.slice(stat.indexOf('(') + 1, endName), cpuMs: (Number(fields[11]) + Number(fields[12])) * 1_000 / ticksPerSecond }]
            } catch (error) {
              if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return []
              throw error
            }
          })
          scopeSamples.push({ monotonicMs: Number(process.hrtime.bigint()) / 1_000_000, pid: renderer.id, cgroup, counters, threads })
        } catch (error) {
          if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error
        }
      }
    } catch (error) { errors.push(String(error)) }
    finally { reading = false }
  }
  await sample()
  const timer = setInterval(() => { void sample() }, 100)
  return {
    stop: async () => {
      clearInterval(timer)
      await sample()
      const metrics = await cdp.send('Performance.getMetrics')
      const navigationStartSeconds = metrics.metrics.find(metric => metric.name === 'NavigationStart')?.value
      const completed = new Promise<{ stream?: string }>(resolve => cdp.once('Tracing.tracingComplete', resolve))
      await cdp.send('Tracing.end')
      const { stream } = await completed
      if (!stream) throw new Error('CPU-trace heeft geen stream')
      const chunks: string[] = []
      try {
        for (;;) {
          const chunk = await cdp.send('IO.read', { handle: stream })
          chunks.push(chunk.base64Encoded ? Buffer.from(chunk.data, 'base64').toString('utf8') : chunk.data)
          if (chunk.eof) break
        }
      } finally { await cdp.send('IO.close', { handle: stream }) }
      return { trace: JSON.parse(chunks.join('')), navigationStartSeconds, scopeSamples, errors }
    },
  }
}
