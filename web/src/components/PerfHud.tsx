import { createSignal, For, onCleanup, onMount, Show } from 'solid-js'
import { isolineRates, type IsolineCounters, type IsolineRates, type PerfMonitor, type PerfSnapshot } from '../core/perf'
import { DEFAULT_WIND_TUNING, sanitizeWindTuning, WIND_TUNING_CONTROLS, type WindTuning, type WindTuningControl } from '../core/wind-layer'
import './PerfHud.css'

interface Props {
  monitor: PerfMonitor
  isolines?: () => IsolineCounters
  windTuning?: WindTuning
  onWindTuning?: (tuning: WindTuning) => void
}

export default function PerfHud(props: Props) {
  const [snapshot, setSnapshot] = createSignal<PerfSnapshot>(props.monitor.snapshot())
  const [copied, setCopied] = createSignal(false)

  const [rates, setRates] = createSignal<IsolineRates>()
  let counters = props.isolines?.()
  let countedAt = performance.now()

  onMount(() => {
    const timer = window.setInterval(() => {
      setSnapshot(props.monitor.snapshot())
      const next = props.isolines?.()
      const now = performance.now()
      if (next && counters) setRates(isolineRates(counters, next, now - countedAt))
      counters = next
      countedAt = now
    }, 1_000)
    onCleanup(() => window.clearInterval(timer))
  })

  const [windCopied, setWindCopied] = createSignal(false)

  async function copyDump(): Promise<void> {
    await copyText(JSON.stringify(props.monitor.snapshot(), null, 2))
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1_500)
  }

  async function copyWind(): Promise<void> {
    await copyText(JSON.stringify(props.windTuning, null, 2))
    setWindCopied(true)
    window.setTimeout(() => setWindCopied(false), 1_500)
  }

  function tune(control: WindTuningControl, value: number): void {
    if (!props.windTuning || !Number.isFinite(value)) return
    props.onWindTuning?.(sanitizeWindTuning({ ...props.windTuning, [control.key]: value }))
  }

  const metric = () => snapshot()
  return <aside class="perf-hud" aria-label="Prestatiemetingen" data-testid="perf-hud">
    <div class="perf-title"><strong>Perf</strong><span>live</span></div>
    <dl>
      <div><dt>TTFR</dt><dd data-testid="perf-ttfr">{milliseconds(metric().ttfrMs)}</dd></div>
      <div><dt>Scrub p50 / p95</dt><dd>{milliseconds(metric().scrub.p50Ms)} / {milliseconds(metric().scrub.p95Ms)}</dd></div>
      <div><dt>FPS</dt><dd>{metric().fps?.toFixed(1) ?? '—'}</dd></div>
      <div><dt>Manifest</dt><dd>{age(metric().manifestAgeMs)}</dd></div>
      <Show when={rates()}>{(rate) => <>
        <div><dt>Kaart</dt><dd data-testid="perf-repaints">{rate().repaintsPerSecond.toFixed(0)} repaints/s</dd></div>
        <div><dt>Regen · wind</dt><dd>{rate().rainDrawsPerSecond.toFixed(0)} · {rate().windDrawsPerSecond.toFixed(0)} frames/s · {rate().rainUploadsPerSecond.toFixed(1)} uploads/s</dd></div>
        <div><dt>Isolijnen</dt><dd data-testid="perf-isolines">{rate().passesPerSecond.toFixed(1)} passes/s · {passCost(rate())} · {rate().labels} labels</dd></div>
        <Show when={rate().vector}>{(vector) => <div><dt>Isolijnen vector</dt><dd data-testid="perf-isoline-vector">{vector().tracesPerSecond.toFixed(1)} sneden/s · {vector().traceMs.toFixed(1)} ms worker · {vector().segments} seg · lusjes {vector().fadedRings}/{vector().rings}</dd></div>}</Show>
        <div><dt>Isolijnen blit</dt><dd>{rate().compositeMs === null ? '—' : `${rate().compositeMs!.toFixed(2)} ms${rate().timing === 'cpu' ? ' (cpu)' : ''}`} · {rate().passPixels === null ? '—' : `${(rate().passPixels! / 1e6).toFixed(2)} Mpx/pass`}</dd></div>
      </>}</Show>
    </dl>
    <table>
      <thead><tr><th>Netwerk</th><th>req</th><th>bytes</th></tr></thead>
      <tbody>{(['manifest', 'chunks', 'tiles', 'other', 'total'] as const).map((kind) => <tr>
        <th>{kind}</th><td>{metric().network[kind].requests}</td><td>{bytes(metric().network[kind].bytes)}</td>
      </tr>)}</tbody>
    </table>
    <button type="button" onClick={() => void copyDump()}>{copied() ? 'Gekopieerd' : 'Kopieer JSON'}</button>
    <Show when={props.windTuning}>{(tuning) => <details class="perf-wind" data-testid="wind-tuning">
      <summary>Wind</summary>
      <For each={WIND_TUNING_CONTROLS}>{(control) => <label>
        <span>{control.label}{control.unit ? ` (${control.unit})` : ''}</span>
        <input type="range" min={control.min} max={control.max} step={control.step} value={tuning()[control.key]} onInput={(event) => tune(control, event.currentTarget.valueAsNumber)} />
        <input type="number" min={control.min} max={control.max} step={control.step} value={tuning()[control.key]} aria-label={control.label} onChange={(event) => tune(control, event.currentTarget.valueAsNumber)} />
      </label>}</For>
      <div class="perf-wind-actions">
        <button type="button" onClick={() => props.onWindTuning?.({ ...DEFAULT_WIND_TUNING })}>Reset</button>
        <button type="button" onClick={() => void copyWind()}>{windCopied() ? 'Gekopieerd' : 'Kopieer als JSON'}</button>
      </div>
    </details>}</Show>
  </aside>
}

async function copyText(text: string): Promise<void> {
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
}

function passCost(rate: IsolineRates): string {
  if (rate.passMs === null) return '— ms/pass'
  return `${rate.passMs.toFixed(2)} ms/pass${rate.timing === 'cpu' ? ' (cpu)' : ''}`
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
