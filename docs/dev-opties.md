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
| Kaart | Scrubber | weermodus: regenhistogram of wolkendoorsnede (A vervangt / B strook); laadt `cloud_low/mid/high` pas als hij aanstaat. Opslag `scrubber-view` | U37 | na PO-keuze A/B/geen |
| Diagnose | Perf-HUD | meetpaneel aan/uit (ook: drie tikken op het logo) | T5 / U30 | blijft (diagnose) |
| Diagnose | Herhaal splash | openingslogo opnieuw afspelen | T3 | blijft (diagnose) |
| Diagnose | Reset alle instellingen | alle knoppen en tuningsleutels terug; gebruikersstaat blijft | U20 | blijft (vluchtweg, MIP-12 regel 4) |

Weggesnoeid in U30 (nu constanten met herkomstregel): Vulling (0,35, PO-keuze na U25b), Label-afstand
(90 px, U8b), Focus dim (0,25, U8), Min. breedte (20 km, T3g), plus de 19 knoppen uit MIP-12.

De overige elf windparameters (Afstand per leven, Fade-in/-out, Max. leeftijd, Spawn-jitter,
Snelheidsdemping, Buffer-rest, Buffer-DPR max, Kopintensiteit, Contrast, Max. fps) zijn sinds
U30 constanten in `WIND_PARAMETERS` (`web/src/core/wind-layer.ts`), elk met herkomst. De PerfHud
is alleen nog meting (plus de perf-JSON met het loef/lij-profiel van U24).

## Opslag (`localStorage`, prefix `motregen-`)

Gebruikersstaat (blijft bij reset): `theme`, `saved-places`, `last-saved-place`, `map-view`.
Tuning: `wind-tuning-v4`, `scrubber-view` (U37) (v3 wordt bij het laden gemigreerd). Oude sleutels (`wind-tuning`, `-v2`, `-v3`, `splash-slowdown`) wist
"Reset alle instellingen".
