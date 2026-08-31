import { createSignal, onCleanup, onMount } from 'solid-js'
import type { PerfMonitor, PerfSnapshot } from '../core/perf'
import './PerfHud.css'

interface Props {
  monitor: PerfMonitor
}

export default function PerfHud(props: Props) {
  const [snapshot, setSnapshot] = createSignal<PerfSnapshot>(props.monitor.snapshot())
  const [copied, setCopied] = createSignal(false)

  onMount(() => {
    const timer = window.setInterval(() => setSnapshot(props.monitor.snapshot()), 500)
    onCleanup(() => window.clearInterval(timer))
  })

  async function copyDump(): Promise<void> {
    const text = JSON.stringify(props.monitor.snapshot(), null, 2)
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      const area = document.createElement('textarea')
      area.value = text
      document.body.append(area)
      area.select()
      document.execCommand('copy')
      area.remove()
    }
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1_500)
  }

  const metric = () => snapshot()
  return <aside class="perf-hud" aria-label="Prestatiemetingen" data-testid="perf-hud">
    <div class="perf-title"><strong>Perf</strong><span>live</span></div>
    <dl>
      <div><dt>TTFR</dt><dd data-testid="perf-ttfr">{milliseconds(metric().ttfrMs)}</dd></div>
      <div><dt>Scrub p50 / p95</dt><dd>{milliseconds(metric().scrub.p50Ms)} / {milliseconds(metric().scrub.p95Ms)}</dd></div>
      <div><dt>FPS</dt><dd>{metric().fps?.toFixed(1) ?? '—'}</dd></div>
      <div><dt>Manifest</dt><dd>{age(metric().manifestAgeMs)}</dd></div>
    </dl>
    <table>
      <thead><tr><th>Netwerk</th><th>req</th><th>bytes</th></tr></thead>
      <tbody>{(['manifest', 'chunks', 'tiles', 'other', 'total'] as const).map((kind) => <tr>
        <th>{kind}</th><td>{metric().network[kind].requests}</td><td>{bytes(metric().network[kind].bytes)}</td>
      </tr>)}</tbody>
    </table>
    <button type="button" onClick={() => void copyDump()}>{copied() ? 'Gekopieerd' : 'Kopieer JSON'}</button>
  </aside>
}

function milliseconds(value: number | null): string {
  return value === null ? '—' : `${Math.round(value)} ms`
}

function age(value: number | null): string {
  if (value === null) return '—'
  if (value < 60_000) return `${Math.round(value / 1_000)} s`
  if (value < 3_600_000) return `${Math.round(value / 60_000)} min`
  return `${(value / 3_600_000).toFixed(1)} u`
}

function bytes(value: number): string {
  if (value < 1_000) return `${value} B`
  if (value < 1_000_000) return `${(value / 1_000).toFixed(1)} kB`
  return `${(value / 1_000_000).toFixed(2)} MB`
}
