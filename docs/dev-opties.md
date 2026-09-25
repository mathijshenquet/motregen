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
| Temperatuur | Vervagen | lijnen en kleur vervagen op vlak veld (uit/gradiënt) | U8c | weg zodra de PO "uit" bevestigt (default sinds U13) |
| Diagnose | Perf-HUD | meetpaneel aan/uit (ook: drie tikken op het logo) | T5 / U30 | blijft (diagnose) |
| Diagnose | Herhaal splash | openingslogo opnieuw afspelen | T3 | blijft (diagnose) |
| Diagnose | Reset alle instellingen | alle knoppen en tuningsleutels terug; gebruikersstaat blijft | U20 | blijft (vluchtweg, MIP-12 regel 4) |

Weggesnoeid in U30 (nu constanten met herkomstregel): Vulling (0,7, U25b), Label-afstand
(90 px, U8b), Focus dim (0,25, U8), Min. breedte (20 km, T3g), plus de 19 knoppen uit MIP-12.

## PerfHud, sectie Wind (`motregen-wind-tuning-v3`)

Vijftien windknoppen met JSON-export (`WIND_TUNING_CONTROLS` in
`web/src/core/wind-layer.ts`). Eigenaar U3/U20/U24; na de U24-merge snoeit U30 ze tot
Dichtheid, Intensiteit, Lijnbreedte en Tempo (v4).

## Opslag (`localStorage`, prefix `motregen-`)

Gebruikersstaat (blijft bij reset): `theme`, `saved-places`, `last-saved-place`, `map-view`.
Tuning: `wind-tuning-v3`. Oude sleutels (`wind-tuning`, `-v2`, `splash-slowdown`) wist
"Reset alle instellingen".
