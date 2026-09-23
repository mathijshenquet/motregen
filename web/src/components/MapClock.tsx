import { createSignal, onCleanup, Show } from 'solid-js'

interface Props {
  // Epoch shown on the map (scrubber position) and the manifest's "now".
  mapEpoch: number
  now: number
}

// Within half a radar frame of "now" the map shows the present.
const PRESENT_TOLERANCE_MS = 150_000

export default function MapClock(props: Props) {
  const [clock, setClock] = createSignal(Date.now())
  const timer = window.setInterval(() => setClock(Date.now()), 10_000)
  onCleanup(() => window.clearInterval(timer))
  const time = (epoch: number) => new Date(epoch).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })
  const day = (epoch: number) => new Date(epoch).toLocaleDateString('nl-NL', { weekday: 'short' })
  const elsewhere = () => props.now > 0 && Math.abs(props.mapEpoch - props.now) > PRESENT_TOLERANCE_MS
  const mapDay = () => day(props.mapEpoch) === day(clock()) ? '' : `${day(props.mapEpoch)} `
  return <div class="map-clock" aria-live="off">
    <span class="map-clock-now" title="Huidige tijd"><small>Nu</small><strong>{time(clock())}</strong></span>
    <Show when={elsewhere()}>
      <span class="map-clock-map" classList={{ future: props.mapEpoch > props.now }} title="Tijd van het kaartbeeld">
        <small>Kaart</small><strong>{mapDay()}{time(props.mapEpoch)}</strong>
      </span>
    </Show>
  </div>
}
