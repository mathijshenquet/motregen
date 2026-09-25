import type { JSX } from 'solid-js'
import type { FocusTuning } from '../core/focus-mode'
import type { IsolineLabelTuning } from '../core/isoline-labels'
import { ISOLINE_FADES, ISOLINE_STEPS, type IsolineFade, type IsolineStep, type IsolineTuning } from '../core/isolines'

// Alleen via ?dev. Elke knop hier staat in docs/dev-opties.md met eigenaar en vervaldatum (MIP-12).
interface Props {
  isolineTuning: IsolineTuning
  onIsolineTuning: (patch: Partial<IsolineTuning>) => void
  labelTuning: IsolineLabelTuning
  onLabelTuning: (patch: Partial<IsolineLabelTuning>) => void
  focusTuning: FocusTuning
  onFocusTuning: <Key extends keyof FocusTuning>(key: Key, value: FocusTuning[Key]) => void
  minimumMapWidthKm: number
  maximumZoom: number
  onMinimumMapWidthKm: (km: number) => void
  perfVisible: boolean
  onPerfVisible: (visible: boolean) => void
  onReplaySplash: () => void
  onReset: () => void
  resetNotice: boolean
}

export default function DevPanel(props: Props) {
  return <details class="dev-panel" open data-testid="dev-panel">
    <summary>Dev-opties</summary>
    <Group title="Kaart" open>
      <Control label="Min. breedte" output={`${props.minimumMapWidthKm} km`}
        hint={`Hoe ver je kunt inzoomen: nooit minder dan deze breedte in beeld (nu max. zoom ${props.maximumZoom.toFixed(1)}).`}>
        <input type="range" min="5" max="100" step="5" value={props.minimumMapWidthKm} onInput={(event) => props.onMinimumMapWidthKm(event.currentTarget.valueAsNumber)} />
      </Control>
    </Group>
    <Group title="Temperatuur">
      <Control label="Isolijnen" output={`${props.isolineTuning.step}°`} hint="Aantal graden tussen twee temperatuurlijnen.">
        <select value={props.isolineTuning.step} onChange={(event) => props.onIsolineTuning({ step: Number(event.currentTarget.value) as IsolineStep })}>
          {ISOLINE_STEPS.map((step) => <option value={step}>{step} °C</option>)}
        </select>
      </Control>
      <Control label="Vervagen" output={props.isolineTuning.fade} hint="Gradiënt: lijnen en kleur vervagen waar de temperatuur nauwelijks verandert.">
        <select value={props.isolineTuning.fade} onChange={(event) => props.onIsolineTuning({ fade: event.currentTarget.value as IsolineFade })}>
          {ISOLINE_FADES.map((fade) => <option value={fade}>{fade}</option>)}
        </select>
      </Control>
      <Control label="Label-afstand" output={`${props.labelTuning.minDistancePx} px`} hint="Minimale afstand tussen twee lijnlabels; groter geeft minder labels.">
        <input type="range" min="30" max="240" step="10" value={props.labelTuning.minDistancePx} onInput={(event) => props.onLabelTuning({ minDistancePx: event.currentTarget.valueAsNumber })} />
      </Control>
      <Control label="Vulling" output={props.isolineTuning.fillOpacity.toFixed(2)} hint="Dekking van de kleurvlakken tussen de lijnen; 0 zet de kleur uit.">
        <input type="range" min="0" max="1" step="0.05" value={props.isolineTuning.fillOpacity} onInput={(event) => props.onIsolineTuning({ fillOpacity: event.currentTarget.valueAsNumber })} />
      </Control>
    </Group>
    <Group title="Focus">
      <Control label="Focus dim" output={`${Math.round(props.focusTuning.dim * 100)}%`} hint="Hoe zichtbaar regen, wind en zon blijven als de temperatuurfocus aan staat.">
        <input type="range" min="0" max="1" step="0.05" value={props.focusTuning.dim} onInput={(event) => props.onFocusTuning('dim', event.currentTarget.valueAsNumber)} />
      </Control>
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
