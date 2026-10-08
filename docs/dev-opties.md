# Dev-opties

De levende lijst van alle ontwikkelknoppen (MIP-12). De enige poort is `?dev`; losse
`?`-parameters bestaan niet meer. Elke knop heeft een eigenaar-track en een moment waarop hij
vervalt (voor de knoppen van vóór MIP-12 een voorstel van U30; de PO beslist). Een nieuwe knop komt hier in dezelfde commit bij. Een knop die vervalt wordt een
constante met één regel herkomst. "Reset alle instellingen" moet elke nieuwe
opslagsleutel meenemen (`PRESERVED_STORAGE_KEYS` in `web/src/core/dev-settings.ts` is de
whitelist van wat blijft).

## `?dev`-paneel (`web/src/components/DevPanel.tsx`)

Hooguit 3–4 knoppen per groep (PO 2026-09-25); de eerste groep start open.

| groep | knop | doel | eigenaar | vervalt bij |
| --- | --- | --- | --- | --- |
| Temperatuur | Isolijnen | graden tussen twee isolijnen (1/2/5) | U8 | promotie tot productinstelling (MIP) of weg na PO-keuze |
| Temperatuur | Vulling-stijl | kleur tussen de lijnen als vlakke banden of doorlopend verloop | U25b / PO (main `5fcd35b`) | na PO-keuze banden/verloop |
| Temperatuur | Vervagen | lijnen en kleur vervagen op vlak veld (uit/gradiënt) | U8c | weg zodra de PO "uit" bevestigt (default sinds U13) |
| Wind | Dichtheid | windstreepjes per beeldoppervlak | U3b / U24 | promotie of weg na PO-keuze windbeeld |
| Wind | Intensiteit | felheid van de streepjes (windfocus zet ze voller) | U3 / U24 | idem |
| Wind | Lijnbreedte | dikte van de streepjes | U3 | idem |
| Wind | Tempo | snelheid van de streepjes | U3b | idem |
| Wind | Kopieer wind als JSON | de vier waarden naar het klembord (PO-terugkoppelweg) | U20 | blijft zolang de windknoppen er zijn |
| Laden | Eerste regen | het eerste regenframe direct na het manifest vragen (vroeg) of pas na de kaart-opzet (laat; herladen) | U54 | zodra een telefoonopname de winst heeft vastgelegd of weerlegd |
| Laden | Kaderhemel | het lege scrubber-kader krijgt tijdens het laden al de hemelkleur van het uur (uit/aan; herladen) | U54 | na PO-keuze (dan vast aan of weg) |
| Lucht nu | strakblauw · mooie wolkenlucht · melkachtig · grijs · Mordor | tijd, klasse en gekozen locatie op 0,1° als menselijk anker voor de wolkenanalyse | U46 | na de analyse |
| Lucht nu | Kopieer dagboek | alle lokale luchtmetingen als JSON naar het klembord | U46 | na de analyse |
| Diagnose | Perf-HUD | meetpaneel aan/uit (ook: drie tikken op het logo) | T5 / U30 | blijft (diagnose) |
| Diagnose | Opname 30 s | stacks, fasen en lange frames als Chrome Trace opnemen | U43 | blijft (diagnose) |
| Diagnose | Koude start | herlaadt en neemt de eerste 30 s vanaf `timeOrigin` op | U43 | blijft (diagnose) |
| Diagnose | Herhaal splash | openingslogo opnieuw afspelen | T3 | blijft (diagnose) |
| Diagnose | Reset alle instellingen | alle knoppen en tuningsleutels terug; gebruikersstaat blijft | U20 | blijft (vluchtweg, MIP-12 regel 4) |

Weggesnoeid in U30 (nu constanten met herkomstregel): Vulling (0,35, PO-keuze na U25b), Label-afstand
(90 px, U8b), Focus dim (0,25, U8), Min. breedte (20 km, T3g), plus de 19 knoppen uit MIP-12. Sinds U58 (PO-keuze 2026-10-07 live): Klok › Jog-schaal → vast 2 min/px, naar rechts is later
(`CLOCK_JOG_MS_PER_PX`); de scrubberschaal en de omgekeerde richting zijn afgevallen. Sinds U37 (PO-keuze 2026-09-25): Scrubber regen/wolken → de
wolkendoorsnede (variant A) is vast de weermodus-scrubber; variant B (strook) is weg.

De overige elf windparameters (Afstand per leven, Fade-in/-out, Max. leeftijd, Spawn-jitter,
Snelheidsdemping, Buffer-rest, Buffer-DPR max, Kopintensiteit, Contrast, Max. fps) zijn sinds
U30 constanten in `WIND_PARAMETERS` (`web/src/core/wind-layer.ts`), elk met herkomst. De PerfHud
is alleen nog meting (plus de perf-JSON met het loef/lij-profiel van U24).

Buiten het paneel: `?perf` is de profielmodus (MIP-16, U43): toont de perf-HUD en zet de gedetailleerde
meting aan, blijft via `localStorage` staan tot `?perf=0`; geen knop, blijft (diagnose). `?skywatch-render` (U46) rendert alleen de wolkendoorsnede voor De Bilt als
still voor de grading-pijplijn; geen knop, vervalt na de analyse.

Kaartstart-proef: alleen in een build met `VITE_MAP_START=svg` of `VITE_MAP_START=tegel`, via
`?dev&kaartstart=svg` respectievelijk `?dev&kaartstart=tegel`. Toont de Nederlandse kust/water/grenzen
vóór de volledige kaart; geen opslag. Eigenaar U64; vervalt 2026-10-15 of eerder bij PO-keuze.
Productactivatie wacht op screenshotreview door de orkestrator (MIP-23 Track B).

## Opslag (`localStorage`, prefix `motregen-`)

Gebruikersstaat (blijft bij reset): `theme`, `saved-places`, `last-saved-place`, `map-view`,
`expressive` (standaard aan; hemel en streken in de grafiek plus dag/nacht-kleuring in de tabel, U58 — de
oude `table-day-night` wordt bij het laden gemigreerd: uit → expressief uit) en `sky-diary` (tijd, vijfklassenlabel en gekozen locatie
afgerond op 0,1°; U46).
Rig-schakelaar zonder knop: `dev-speelregel` = `venster` zet onder `?dev` de oude speelregel terug
(spelen pas na laadfase "window"), zodat de mobiele laadrig oud en nieuw uit één build meet
(`koud-spelend-vensterregel`). Eigenaar U54; vervalt zodra de PO de speelregel heeft bevestigd.
De knop "Eerste regen" schrijft `dev-eerste-regen`; de rig zet dezelfde sleutel in `koud-spelend-regen-laat`.
Tuning/debug: `wind-tuning-v4` (v3 wordt bij het laden gemigreerd), `perf` en de eenmalige
`perf-cold`. Oude sleutels (`wind-tuning`, `-v2`, `-v3`, `splash-slowdown`, `scrubber-view`, `clock-jog`) wist
"Reset alle instellingen".
