import { createSignal, For, type JSX } from 'solid-js'
import { copyText } from '../core/clipboard'
import { appendSkyDiaryEntry, SKY_DIARY_CLASSES, skyDiaryJson, TABLE_CONTRASTS, type SkyDiaryClass, type TableContrast } from '../core/dev-settings'
import { RAIN_ISOLINE_RATES, RAIN_ISOLINE_SETS, type RainIsolineSetName, type RainLookChoice } from '../core/rain-palette'
import { CLOUD_MAP_SAMPLES, type CloudMapSample } from '../core/cloud-map'

// Alleen via ?dev; hooguit 3–4 knoppen per groep (PO 2026-09-25). Elke knop staat in
// docs/dev-opties.md met eigenaar en vervaldatum (MIP-12).
interface Props {
  tableContrast: TableContrast
  onTableContrast: (contrast: TableContrast) => void
  dayList: boolean
  onDayList: (enabled: boolean) => void
  cloudMapForms: boolean
  onCloudMapForms: (enabled: boolean) => void
  cloudMapSample: CloudMapSample
  onCloudMapSample: (sample: CloudMapSample) => void
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
  usageLabel: string | null
  onUsageLabel: (text: string) => void
}

const RAIN_ISOLINE_HINT = 'Lijnen binnen de regen op vaste intensiteiten, alleen bij menging rand. Kleurgrenzen (standaard): 1, 2 en 13 mm/u. Klassen: 2,5, 10 en 50 mm/u (licht/matig/zwaar/zeer zwaar). Dicht: zes lijnen. Proef U86, vervalt 2026-10-23.'
export default function DevPanel(props: Props) {
  const [skyClass, setSkyClass] = createSignal<SkyDiaryClass>('mooie wolkenlucht')
  const [skyNotice, setSkyNotice] = createSignal('')

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
    <Group title="Tabel" open>
      <Control label="Dag/nacht-contrast" output={props.tableContrast} hint="Breed is standaard (PO 2026-10-18). Rail: neutrale rijen met links een strook in de kleur van de lucht, schemering op de echte tijden. Symbool: een maantje bij nachtrijen en een heel lichte koele tint. Sterren: sterretjes in nachtrijen. Breed (standaard): de hele tabel zachter getint. Smal: alleen de dagdelen en dag/nacht-rijen. Sterk: het oude contrast. Ook als link: ?dev&contrast=rail. U91b, vervalt 2026-11-01.">
        <select aria-label="Dag/nacht-contrast" value={props.tableContrast} onChange={(event) => props.onTableContrast(event.currentTarget.value as TableContrast)}>
          <For each={TABLE_CONTRASTS}>{(contrast) => <option value={contrast}>{contrast}</option>}</For>
        </select>
      </Control>
      <Control label="Dagen: lijst onder tabel" output={props.dayList ? 'Aan' : 'Uit'} toggle hint="Uit (standaard): de urentabel wordt naar achteren grover, tot dag en nacht. Aan: de uurtabel tot het eind van HARMONIE met de lijst Komende dagen eronder. U91b, vervalt 2026-11-01.">
        <input type="checkbox" checked={props.dayList} onChange={(event) => props.onDayList(event.currentTarget.checked)} />
      </Control>
    </Group>
    <Group title="Wolkenkaart">
      <Control label="Wolkenbeeld" output={props.cloudMapForms ? 'vormen' : 'oude sluier'} hint="Vormen uit bewolking en licht. De fijne structuur is getekend; de regionale velden komen uit het model.">
        <select aria-label="Wolkenbeeld" value={props.cloudMapForms ? 'vormen' : 'sluier'} onChange={(event) => props.onCloudMapForms(event.currentTarget.value === 'vormen')}>
          <option value="vormen">vormen</option><option value="sluier">oude sluier</option>
        </select>
      </Control>
      <Control label="Voorbeeldlucht" output={props.cloudMapSample} hint="Live gebruikt de modeldata. Gaten, sluier, dicht en overgang zijn gefingeerde voorbeelden om de vormen en de menging te bekijken.">
        <select aria-label="Voorbeeldlucht" value={props.cloudMapSample} onChange={(event) => props.onCloudMapSample(event.currentTarget.value as CloudMapSample)}>
          <For each={CLOUD_MAP_SAMPLES}>{(sample) => <option value={sample}>{sample}</option>}</For>
        </select>
      </Control>
    </Group>
    <Group title="Regen">
      <Control label="Regenisolijnen" output={props.rainLook.isolines ?? 'geen'} hint={RAIN_ISOLINE_HINT}>
        <select value={props.rainLook.isolines ?? 'geen'} onChange={(event) => props.onRainLook({ isolines: event.currentTarget.value as RainIsolineSetName })}>
          <For each={RAIN_ISOLINE_SETS}>{(set) => <option value={set}>{set}{RAIN_ISOLINE_RATES[set].length ? ` (${RAIN_ISOLINE_RATES[set].join(' · ').replaceAll('.', ',')} mm/u)` : ''}</option>}</For>
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
    <Group title="Meting">
      <Control label="Meetlabel" output={props.usageLabel ?? 'geen'} hint="Optioneel label voor dit apparaat (a–z, 0–9 en -, hooguit 16 tekens), zodat je je eigen gebruik in het dagrapport herkent. Je telt gewoon mee. Leeg is geen label. De sessie telt het label vanaf het volgende bezoek; het baken meteen.">
        <input type="text" aria-label="Meetlabel" maxLength={16} placeholder="geen" autocapitalize="off" spellcheck={false} value={props.usageLabel ?? ''}
          onChange={(event) => props.onUsageLabel(event.currentTarget.value)} />
      </Control>
      <p class="dev-usage">Gebruiksbaken: <code>{props.usageBody}</code></p>
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
