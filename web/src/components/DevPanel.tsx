import { createSignal, For, type JSX } from 'solid-js'
import { copyText } from '../core/clipboard'
import { appendSkyDiaryEntry, SKY_DIARY_CLASSES, skyDiaryJson, type SkyDiaryClass } from '../core/dev-settings'
import { ISOLINE_FADES, ISOLINE_FILL_STYLES, ISOLINE_STEPS, type IsolineFade, type IsolineFillStyle, type IsolineStep, type IsolineTuning } from '../core/isolines'
import { RAIN_BLENDS, RAIN_PALETTES, type RainBlendName, type RainLookChoice, type RainPaletteName } from '../core/rain-palette'
import { RAIN_SMOOTHINGS, type RainFieldTuning, type RainSmoothing } from '../core/rain-smoothing'
import { sanitizeWindTuning, WIND_TUNING_CONTROLS, type WindTuning } from '../core/wind-layer'

// Alleen via ?dev; hooguit 3–4 knoppen per groep (PO 2026-09-25). Elke knop staat in
// docs/dev-opties.md met eigenaar en vervaldatum (MIP-12).
interface Props {
  isolineTuning: IsolineTuning
  onIsolineTuning: (patch: Partial<IsolineTuning>) => void
  firstRainLate: boolean
  onFirstRainLate: (late: boolean) => void
  windTuning: WindTuning
  onWindTuning: (tuning: WindTuning) => void
  rainFieldTuning: RainFieldTuning
  onRainFieldTuning: (patch: Partial<RainFieldTuning>) => void
  rainLook: RainLookChoice
  onRainLook: (patch: Partial<RainLookChoice>) => void
  viewportDiagnose: boolean
  onViewportDiagnose: (enabled: boolean) => void
  perfVisible: boolean
  onPerfVisible: (visible: boolean) => void
  profileRecording: boolean
  onProfileRecord: () => void
  onColdProfile: () => void
  onReplaySplash: () => void
  onReset: () => void
  resetNotice: boolean
  /** Exacte body van het gebruiksbaken (MIP-13): het privacycontract zichtbaar gemaakt. */
  usageBody: string
}

const WIND_HINTS: Record<keyof WindTuning, string> = {
  particlesPerMegapixel: 'Aantal windstreepjes per beeldoppervlak.',
  intensity: 'Hoe fel de windstreepjes zijn; windfocus zet ze voller.',
  lineWidth: 'Dikte van de windstreepjes.',
  speed: 'Hoe snel de windstreepjes bewegen.',
}

const RAIN_SMOOTHING_HINT = 'Auto: het product (blur 5×5 tot 2 uur vooruit, oplopend naar 9×9 vanaf 3 uur). Blokken: elke rastercel hard. Bilineair: zoals vóór U72. Bronlineair, glad en blur wegen de cellen van de bron zelf: lineair, bicubisch (scherp) of als Gaussische vervaging over 3×3 tot 9×9 broncellen.'

const RAIN_PALETTE_HINT = 'Kleuren van de regen op de kaart en in het histogram. Huidig: lichtblauw, groen, geel, oranje, paars. Blauw-grijs-rood: het PO-voorstel. Blauw-violet-rood: hetzelfde met violet in plaats van grijs. Oplopend-donker: de volgorde zit in de helderheid, overdag steeds donkerder en \'s nachts steeds lichter.'
const RAIN_BLEND_HINT = 'Hoe regen in Weer over de kaart ligt (Wind en Lucht blijven zoals ze zijn). Huidig: lichte regen telt licht op bij de kaart (de witte halo). Zuiver: echte dekking, verder gelijk. Steil: de hele gladgestreken zoom meteen dekkend. Drempel: niets tot de rand van de data, daar meteen dekkend. Rand: drempel met een dunne contour. Steil, drempel en rand schuiven de beginkleur per thema op tot hij genoeg afsteekt bij land, water en bebouwing.'

export default function DevPanel(props: Props) {
  const [windCopied, setWindCopied] = createSignal(false)
  const [skyClass, setSkyClass] = createSignal<SkyDiaryClass>('mooie wolkenlucht')
  const [skyNotice, setSkyNotice] = createSignal('')

  async function copyWind(): Promise<void> {
    await copyText(JSON.stringify(props.windTuning, null, 2))
    setWindCopied(true)
    window.setTimeout(() => setWindCopied(false), 1_500)
  }

  function recordSky(klasse: SkyDiaryClass): void {
    const location = currentLocation()
    if (!location) { showSkyNotice('Geen gekozen locatie beschikbaar'); return }
    try {
      appendSkyDiaryEntry(klasse, location)
      showSkyNotice(`${klasse} opgeslagen`)
    } catch {
      showSkyNotice('Opslaan mislukt')
    }
  }

  async function copySkyDiary(): Promise<void> {
    try {
      await copyText(skyDiaryJson())
      showSkyNotice('Dagboek gekopieerd')
    } catch {
      showSkyNotice('Kopiëren mislukt')
    }
  }

  function showSkyNotice(message: string): void {
    setSkyNotice(message)
    window.setTimeout(() => setSkyNotice(''), 2_000)
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
    <Group title="Kaart">
      <Control label="Regenpalet" output={props.rainLook.palette} hint={RAIN_PALETTE_HINT}>
        <select value={props.rainLook.palette} onChange={(event) => props.onRainLook({ palette: event.currentTarget.value as RainPaletteName })}>
          <For each={RAIN_PALETTES}>{(palette) => <option value={palette}>{palette}</option>}</For>
        </select>
      </Control>
      <Control label="Regenmenging" output={props.rainLook.blend} hint={RAIN_BLEND_HINT}>
        <select value={props.rainLook.blend} onChange={(event) => props.onRainLook({ blend: event.currentTarget.value as RainBlendName })}>
          <For each={RAIN_BLENDS}>{(blend) => <option value={blend}>{blend}</option>}</For>
        </select>
      </Control>
      <Control label="Regenveld radar/nowcast" output={props.rainFieldTuning.radar} hint={`Hoe radar, nowcast en blend tussen de cellen worden ingevuld. ${RAIN_SMOOTHING_HINT}`}>
        <select value={props.rainFieldTuning.radar} onChange={(event) => props.onRainFieldTuning({ radar: event.currentTarget.value as RainSmoothing })}>
          <For each={RAIN_SMOOTHINGS}>{(smoothing) => <option value={smoothing}>{smoothing}</option>}</For>
        </select>
      </Control>
      <Control label="Regenveld HARMONIE" output={props.rainFieldTuning.harmonie} hint={`Hoe het weermodel (vanaf ruim 6 uur vooruit) tussen de cellen wordt ingevuld. ${RAIN_SMOOTHING_HINT}`}>
        <select value={props.rainFieldTuning.harmonie} onChange={(event) => props.onRainFieldTuning({ harmonie: event.currentTarget.value as RainSmoothing })}>
          <For each={RAIN_SMOOTHINGS}>{(smoothing) => <option value={smoothing}>{smoothing}</option>}</For>
        </select>
      </Control>
    </Group>
    <Group title="Laden">
      <Control label="Eerste regen" output={props.firstRainLate ? 'laat' : 'vroeg'} hint="Vroeg: het regenframe op de cursor en het volgende gaan direct na het manifest de lijn op. Laat: pas na de kaart-opzet, zoals voorheen. Herlaad met ?perf=1 om ttfp te vergelijken.">
        <select value={props.firstRainLate ? 'laat' : 'vroeg'} onChange={(event) => props.onFirstRainLate(event.currentTarget.value === 'laat')}>
          <option value="vroeg">vroeg</option>
          <option value="laat">laat</option>
        </select>
      </Control>
    </Group>
    <Group title="Lucht nu">
      <Control label="Klasse" output={skyClass()} hint="Hoe de lucht op de gekozen locatie nu aanvoelt.">
        <select value={skyClass()} onChange={(event) => setSkyClass(event.currentTarget.value as SkyDiaryClass)}>
          <For each={SKY_DIARY_CLASSES}>{(klasse) => <option value={klasse}>{klasse}</option>}</For>
        </select>
      </Control>
      <Action label="Lucht nu" hint="Slaat tijd, klasse en de gekozen locatie op 0,1° in deze browser op." onClick={() => recordSky(skyClass())} />
      <Action label="Kopieer dagboek" hint="Zet alle luchtmetingen als JSON op het klembord." onClick={() => void copySkyDiary()} />
      <p class="dev-notice" role="status">{skyNotice()}</p>
    </Group>
    <Group title="Diagnose">
      <Control label="Perf-HUD" output={props.perfVisible ? 'Aan' : 'Uit'} toggle hint="Meetpaneel met laadtijd, fps en netwerk; ook drie tikken op het logo.">
        <input type="checkbox" checked={props.perfVisible} onChange={(event) => props.onPerfVisible(event.currentTarget.checked)} />
      </Control>
      <Control label="Scherm en scroll" output={props.viewportDiagnose ? 'Aan' : 'Uit'} toggle hint="Toont live schermhoogtes (innerHeight, visualViewport, 100dvh/svh/lvh), scrollstand, het snappunt en de plek van het tabelpaneel. Voor een schermbeeld in een bugtoestand.">
        <input type="checkbox" checked={props.viewportDiagnose} onChange={(event) => props.onViewportDiagnose(event.currentTarget.checked)} />
      </Control>
      <Action label={props.profileRecording ? 'Opname loopt…' : 'Opname 30 s'} hint="Neemt stacks, fasen en lange frames dertig seconden op." onClick={props.onProfileRecord} disabled={props.profileRecording} />
      <Action label="Koude start" hint="Herlaadt en neemt de eerste dertig seconden vanaf de start op." onClick={props.onColdProfile} disabled={props.profileRecording} />
      <Action label="Herhaal splash" hint="Speelt het openingslogo opnieuw af." onClick={props.onReplaySplash} />
      <Action label="Reset alle instellingen" hint="Zet alle knoppen terug; favorieten, locatie, kaartbeeld en thema blijven." onClick={props.onReset} />
      <p class="dev-usage">Gebruiksbaken: <code>{props.usageBody}</code></p>
      <p class="dev-notice" role="status">{props.resetNotice ? 'Standaardwaarden hersteld' : ''}</p>
    </Group>
  </details>
}

function currentLocation(): { lng: number; lat: number } | undefined {
  const camera = (window as unknown as { __motregenCamera?: () => { location?: { lng: number; lat: number } } }).__motregenCamera?.()
  const location = camera?.location
  return location && Number.isFinite(location.lng) && Number.isFinite(location.lat) ? location : undefined
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

function Action(props: { label: string; hint: string; onClick: () => void; disabled?: boolean }) {
  return <div class="dev-control" title={props.hint}>
    <button type="button" class="dev-action" disabled={props.disabled} onClick={() => props.onClick()}>{props.label}</button>
    <p class="dev-hint">{props.hint}</p>
  </div>
}
