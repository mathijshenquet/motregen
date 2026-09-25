import { createSignal, For, type JSX } from 'solid-js'
import { copyText } from '../core/clipboard'
import { ISOLINE_FADES, ISOLINE_FILL_STYLES, ISOLINE_STEPS, type IsolineFade, type IsolineFillStyle, type IsolineStep, type IsolineTuning } from '../core/isolines'
import { sanitizeWindTuning, WIND_TUNING_CONTROLS, type WindTuning } from '../core/wind-layer'

// Alleen via ?dev; hooguit 3–4 knoppen per groep (PO 2026-09-25). Elke knop staat in
// docs/dev-opties.md met eigenaar en vervaldatum (MIP-12).
interface Props {
  isolineTuning: IsolineTuning
  onIsolineTuning: (patch: Partial<IsolineTuning>) => void
  windTuning: WindTuning
  onWindTuning: (tuning: WindTuning) => void
  perfVisible: boolean
  onPerfVisible: (visible: boolean) => void
  onReplaySplash: () => void
  onReset: () => void
  resetNotice: boolean
}

const WIND_HINTS: Record<keyof WindTuning, string> = {
  particlesPerMegapixel: 'Aantal windstreepjes per beeldoppervlak.',
  intensity: 'Hoe fel de windstreepjes zijn; windfocus zet ze voller.',
  lineWidth: 'Dikte van de windstreepjes.',
  speed: 'Hoe snel de windstreepjes bewegen.',
}

export default function DevPanel(props: Props) {
  const [windCopied, setWindCopied] = createSignal(false)

  async function copyWind(): Promise<void> {
    await copyText(JSON.stringify(props.windTuning, null, 2))
    setWindCopied(true)
    window.setTimeout(() => setWindCopied(false), 1_500)
  }

  return <details class="dev-panel" open data-testid="dev-panel">
    <summary>Dev-opties</summary>
    <Group title="Temperatuur" open>
      <Control label="Isolijnen" output={`${props.isolineTuning.step}°`} hint="Aantal graden tussen twee temperatuurlijnen.">
        <select value={props.isolineTuning.step} onChange={(event) => props.onIsolineTuning({ step: Number(event.currentTarget.value) as IsolineStep })}>
          {ISOLINE_STEPS.map((step) => <option value={step}>{step} °C</option>)}
        </select>
      </Control>
      <Control label="Vulling-stijl" output={props.isolineTuning.fillStyle} hint="Kleur tussen de lijnen als vlakke banden per stap of als doorlopend verloop.">
        <select value={props.isolineTuning.fillStyle} onChange={(event) => props.onIsolineTuning({ fillStyle: event.currentTarget.value as IsolineFillStyle })}>
          {ISOLINE_FILL_STYLES.map((style) => <option value={style}>{style}</option>)}
        </select>
      </Control>
      <Control label="Vervagen" output={props.isolineTuning.fade} hint="Gradiënt: lijnen en kleur vervagen waar de temperatuur nauwelijks verandert.">
        <select value={props.isolineTuning.fade} onChange={(event) => props.onIsolineTuning({ fade: event.currentTarget.value as IsolineFade })}>
          {ISOLINE_FADES.map((fade) => <option value={fade}>{fade}</option>)}
        </select>
      </Control>
    </Group>
    <Group title="Wind">
      <For each={WIND_TUNING_CONTROLS}>{(control) =>
        <Control label={control.label} output={`${props.windTuning[control.key]}${control.unit ? ` ${control.unit}` : ''}`} hint={WIND_HINTS[control.key]}>
          <input type="range" aria-label={control.label} min={control.min} max={control.max} step={control.step} value={props.windTuning[control.key]}
            onInput={(event) => props.onWindTuning(sanitizeWindTuning({ ...props.windTuning, [control.key]: event.currentTarget.valueAsNumber }))} />
        </Control>
      }</For>
      <Action label={windCopied() ? 'Gekopieerd' : 'Kopieer wind als JSON'} hint="Zet de vier windwaarden op het klembord, om terug te sturen." onClick={() => void copyWind()} />
    </Group>
    <Group title="Diagnose">
      <Control label="Perf-HUD" output={props.perfVisible ? 'Aan' : 'Uit'} toggle hint="Meetpaneel met laadtijd, fps en netwerk; ook drie tikken op het logo.">
        <input type="checkbox" checked={props.perfVisible} onChange={(event) => props.onPerfVisible(event.currentTarget.checked)} />
      </Control>
      <Action label="Herhaal splash" hint="Speelt het openingslogo opnieuw af." onClick={props.onReplaySplash} />
      <Action label="Reset alle instellingen" hint="Zet alle knoppen terug; favorieten, locatie, kaartbeeld en thema blijven." onClick={props.onReset} />
      <p class="dev-notice" role="status">{props.resetNotice ? 'Standaardwaarden hersteld' : ''}</p>
    </Group>
  </details>
}

function Group(props: { title: string; open?: boolean; children: JSX.Element }) {
  return <details class="dev-group" open={props.open}>
    <summary>{props.title}</summary>
    {props.children}
  </details>
}

/** Eén knop: label, bediening, waarde, en de uitleg als tooltip én als grijze regel eronder. */
function Control(props: { label: string; output: string; hint: string; toggle?: boolean; children: JSX.Element }) {
  return <div class="dev-control" title={props.hint}>
    <label classList={{ 'dev-toggle': props.toggle }}><span>{props.label}</span>{props.children}<output>{props.output}</output></label>
    <p class="dev-hint">{props.hint}</p>
  </div>
}

function Action(props: { label: string; hint: string; onClick: () => void }) {
  return <div class="dev-control" title={props.hint}>
    <button type="button" class="dev-action" onClick={() => props.onClick()}>{props.label}</button>
    <p class="dev-hint">{props.hint}</p>
  </div>
}
