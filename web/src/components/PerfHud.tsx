import { createEffect, createSignal, For, onCleanup, onMount, Show } from 'solid-js'
import { PERF_PHASES, isolineRates, type IsolineCounters, type IsolineRates, type PerfMonitor, type PerfPhase, type PerfSnapshot } from '../core/perf'
import type { ProfileRecording } from '../core/profile-recorder'
import { copyText } from '../core/clipboard'
import './PerfHud.css'

interface Props {
  monitor: PerfMonitor
  isolines?: () => IsolineCounters
  /** Windmeting (U24: loef/lij-profiel) voor de JSON-export. */
  windStats?: () => unknown
  profile?: {
    state: 'idle' | 'recording' | 'ready' | 'error'
    recording?: ProfileRecording
    notice: string
    onRecord: () => void
    onStop: () => void
    onCold: () => void
    onSend: () => Promise<void>
  }
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

  async function copyDump(): Promise<void> {
    await copyText(JSON.stringify({ ...props.monitor.snapshot(), wind: props.windStats?.() }, null, 2))
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1_500)
  }

  async function copyProfile(): Promise<void> {
    const recording = props.profile?.recording
    if (!recording) return
    await copyText(recording.json)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1_500)
  }

  function downloadProfile(): void {
    const recording = props.profile?.recording
    if (!recording) return
    const link = document.createElement('a')
    link.href = URL.createObjectURL(new Blob([recording.json], { type: 'application/json' }))
    link.download = `motregen-${new Date().toISOString()}.json`
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(link.href), 0)
  }

  const metric = () => snapshot()
  const [recordingSeconds, setRecordingSeconds] = createSignal(0)
  createEffect(() => {
    if (props.profile?.state !== 'recording') { setRecordingSeconds(0); return }
    const started = performance.now()
    const tick = window.setInterval(() => setRecordingSeconds(Math.floor((performance.now() - started) / 1_000)), 500)
    onCleanup(() => window.clearInterval(tick))
  })
  // Tijdens een opname krimpt de HUD tot een pil: het volle paneel blokkeerde de UI die je juist wilt profileren (PO 2026-10-07).
  return <Show when={props.profile?.state !== 'recording'} fallback={
    <aside class="perf-hud perf-hud-recording" aria-label="Opname loopt" data-testid="perf-hud">
      <span class="perf-recording-dot" aria-hidden="true" /><span>Opname {recordingSeconds()} s</span>
      <button type="button" onClick={() => props.profile?.onStop()}>Stop</button>
    </aside>
  }>
  <aside class="perf-hud" aria-label="Prestatiemetingen" data-testid="perf-hud">
    <div class="perf-title"><strong>Perf</strong><span>live</span></div>
    <dl>
      <div><dt>TTFR</dt><dd data-testid="perf-ttfr">{milliseconds(metric().ttfrMs)}</dd></div>
      <div><dt>Regen · tiles</dt><dd>{milliseconds(metric().firstRainMs)} · {milliseconds(metric().basemapReadyMs)}</dd></div>
      <div><dt>ttfh · ttfp</dt><dd data-testid="perf-ttfp">{milliseconds(metric().ttfhMs)} · {milliseconds(metric().ttfpMs)}</dd></div>
      <div><dt>Leeg in beeld</dt><dd data-testid="perf-blank-visible">{milliseconds(metric().blankVisibleMs)} · {metric().blankSlotSeconds.toFixed(1)} slot-s · eerste balk {milliseconds(metric().firstBarMs)}</dd></div>
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
    <Show when={PERF_PHASES.some((phase) => metric().phases[phase])}>
      <div class="perf-phases">
        <strong>Fasen · 30 s</strong>
        <For each={PERF_PHASES.filter((phase) => metric().phases[phase])}>{(phase) => {
          const value = () => metric().phases[phase]!
          return <div><span>{phaseLabel(phase)}</span><span>{value().count} · {value().p50Ms.toFixed(1)} / {value().p95Ms.toFixed(1)} ms</span></div>
        }}</For>
      </div>
    </Show>
    <Show when={metric().longFrames.length}>
      <div class="perf-long-frames">
        <strong>Lange frames</strong>
        <For each={metric().longFrames}>{(frame) => <div>
          <span>{frame.duration.toFixed(0)} ms · blok {frame.blockingDuration.toFixed(0)}</span>
          <span title={frame.scripts[0]?.sourceURL}>{scriptLabel(frame.scripts[0])}</span>
        </div>}</For>
      </div>
    </Show>
    <table>
      <thead><tr><th>Netwerk</th><th>req</th><th>bytes</th></tr></thead>
      <tbody>{(['manifest', 'chunks', 'tiles', 'other', 'total'] as const).map((kind) => <tr>
        <th>{kind}</th><td>{metric().network[kind].requests}</td><td>{bytes(metric().network[kind].bytes)}</td>
      </tr>)}</tbody>
    </table>
    <button type="button" onClick={() => void copyDump()}>{copied() ? 'Gekopieerd' : 'Kopieer JSON'}</button>
    <Show when={props.profile}>{(profile) => <div class="perf-recording">
      <div class="perf-actions">
        <button type="button" disabled={profile().state === 'recording'} onClick={profile().onRecord}>{profile().state === 'recording' ? 'Opname loopt…' : 'Opname 30 s'}</button>
        <button type="button" disabled={profile().state === 'recording'} onClick={profile().onCold}>Koude start</button>
      </div>
      <Show when={profile().recording}><div class="perf-actions perf-export-actions">
        <button type="button" onClick={() => void profile().onSend()}>Stuur</button>
        <button type="button" onClick={() => void copyProfile()}>Kopieer</button>
        <button type="button" onClick={downloadProfile}>Download</button>
      </div></Show>
      <p role="status">{profile().notice}</p>
    </div>}</Show>
  </aside>
  </Show>
}

const phaseLabels: Record<PerfPhase, string> = {
  'frame-decode': 'Decode',
  'texture-upload': 'Textuur',
  'isoline-trace': 'Isolijn trace',
  'isoline-blit': 'Isolijn blit',
  'wind-step': 'Wind',
  'scrubber-paint': 'Scrubber',
  'table-render': 'Tabel',
  'basemap-tile': 'Kaarttegel',
}

function phaseLabel(phase: PerfPhase): string {
  return phaseLabels[phase]
}

function scriptLabel(script: PerfSnapshot['longFrames'][number]['scripts'][number] | undefined): string {
  if (!script) return '—'
  const source = script.sourceURL.split('/').at(-1) || script.invoker || 'script'
  return script.sourceFunctionName ? `${source} · ${script.sourceFunctionName}` : source
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
