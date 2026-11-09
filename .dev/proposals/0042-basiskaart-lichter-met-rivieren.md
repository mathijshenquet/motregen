# MIP-42 — Basiskaart strak: doorlopende rivieren, gladde vlekken, een kwart van de tekenkosten

Status: draft · auteur: worker U108 (opus-5.5) voor de orkestrator · gemeten 2026-11-09 · PO-wens 2026-11-09

## Kort (PO-bijsturing 2026-11-09)

De PO in de pane: "ik vond eigenlijk de originele kaart wel prima. Alleen de coarse grained rivieren/stedelijke gebieden
zagen er gewoon niet zo goed uit […] we willen gewoon een knee hebben tussen (ziet er goed uit, draw kosten)." De kaart
is decor om Nederland te herkennen onder regen, wolken, temperatuur en wind, geen atlas.

Daarom is **`strak`** het voorstel: het **oorspronkelijke palet**, doorlopende rivierlijnen en opnieuw
gegeneraliseerde landbedekking op z5–9. 90 % van de bytes en vertices zat in die landbedekking. z4 en z10 blijven
gelijk.

| NL-kader, alle lagen | `nu` | `strak` | verschil |
| --- | ---: | ---: | ---: |
| z6 | 171 KB · 98.065 vertices | 64 KB · 25.463 vertices | −63 % · −74 % |
| z7 | 640 KB · 401.687 vertices | 159 KB · 71.534 vertices | −75 % · −82 % |
| z8 | 1,49 MB · 879.326 vertices | 425 KB · 196.742 vertices | −71 % · −78 % |
| z9 | 3,07 MB · 1.661.566 vertices | 1,65 MB · 732.766 vertices | −46 % · −56 % |

Koud laden op de telefoon (alleen kaarttegels): startbeeld 61.556 → 35.318 B (−43 %), z7 416.404 → 132.306 B
(−68 %), z8 461.841 → 165.023 B (−64 %). Gemeten met `tools/basemap/layer-cost.mts` (gzip per laag) en
`web/scripts/basemap-variant-shots.ts`. Het archief krimpt van 24,3 naar 19,6 MB (`nl-e44c7d3ce88034d7.pmtiles`).

**Correctie 2026-11-09 (PO-bug: Waddeneilanden weg op z5–8).** Twee fouten in het uitlezen en geldig maken:
(1) `extract-layer.mts` deelde ringen in op een vast teken, en dat teken keert om na de y-omkering. Gaten in de
zeepolygoon (eilanden) werden zo zelf watervlakken. Nu wordt relatief aan de eerste ring ingedeeld, zoals MapLibre doet.
(2) SpatiaLite's `ST_MakeValid` (rttopo) gaf voor zelfrakende zeepolygonen een collectie zonder vlak, waardoor hele
zeestukken wegvielen. Het verloor 60 % van het ongeldige wateroppervlak en 14 % van de ongeldige landbedekking; nu
`GEOSMakeValid`. Nieuwe automatische controle `tools/basemap/coast-check.mts`: landoppervlak per eiland of kustgebied
(22 gebieden × z5–10) tegen het origineel. Hij faalt bij meer dan 10 % verlies of 25 % winst; nu 132/132 groen, blad
`bladen/strak/blad-kust.jpg`. Schiermonnikoog ontbreekt op z7 al in het **huidige** prod-archief (tilemaker);
`strak` erft dat.

**Hoe `strak` ontstaat** (`tools/basemap/strak.sh`, ±5 min, geen OSM-herbouw nodig):
1. `extract-layer.mts` leest landbedekking uit de z10-tegels en water uit de tegels van z5–8 van het huidige archief.
2. Per zoom geldt dezelfde selectie als het oorspronkelijke profiel (`detail_minzoom ≤ zoom`). Daarna volgen een union
   per klasse, licht sluiten en openen (0,3 px), weglaten onder 3 px² en vereenvoudigen op 0,5 px. Bebouwing, bos
   en park houden zo hun massa, zonder rafels en losse snippers. Gras, zand en moeras komen pas vanaf z9. Plassen
   onder 2 px² verdwijnen op z5–8.
3. Rivierlijnen rang 1–2 (zie hieronder); rang 3 laat ik weg, want op z10 tekenen de oevervlakken.
4. `compose.mts` vervangt de lagen per zoombereik in het bestaande archief. De overige lagen blijven bytegelijk.

Eerste poging, zelf afgekeurd: sluiten met 1 px liet dorpen aan elkaar groeien (2× zoveel grijs). Park (de Veluwe is
`park`) liet ik onder z9 weg, en daarmee verdween het groen. Beide zijn hersteld vóór de beelden hieronder.

Beelden `nu` naast `strak` (app z6/7/8/10, telefoon/desktop, licht/donker, Gevoel/Wind, bot):
`.dev/tracks/u108-basiskaart/bladen/strak/`. Live: `http://ageq-dev2:4308/?dev&kaart=strak` (vergelijk `?dev&kaart=nu`).

De varianten `licht`, `licht-rivieren` en `atlas` hieronder waren de eerste verkenning (ander palet, zelfde
landbedekking). Ze blijven achter `?dev&kaart=` staan tot de keuze, maar zijn niet meer mijn voorstel.

## Het probleem

De PO wil "het liefste een custom kaart die lichter is, betere zoom-scaling (uitgezoomd zien de rivieren er niet
altijd goed uit)". Zijn voorbeeld is een still uit de windfilm van de bot (zoom ±6,2). Daarop vallen Maas,
Rijn/Waal/IJssel en Schelde uiteen in losse blauwe snippers, zijn de steden grijze blokjes en oogt het geheel zwaar.

## Waarom de rivieren uiteenvallen

Rivieren zitten in ons archief (MIP-21, `nl-91e2043db5c73799.pmtiles`) alleen als oevervlakken uit OSM
(`natural=water` en `waterway=riverbank`). Rivierlijnen (`waterway=river`) nemen we niet mee. Waal, Lek, IJssel en
Maas zijn 150–400 m breed: op z6 is dat 0,1–0,25 px, op z7 0,2–0,5 px. MapLibre tekent zulke vlakken met
antialiasing als vage, onderbroken streepjes. Tilemaker vereenvoudigt water bovendien op ongeveer 1 px (z7: ±650 m),
meer dan de rivier breed is. Zo klappen de vlakken in tot zigzag-snippers, en het oppervlaktefilter haalt kleine
stukken weg. Een andere kleur lost dit niet op: op lage zoom is er geen doorlopende geometrie.

## De rivieroplossing

Ik heb rivier-middellijnen als eigen tegellaag `waterway` toegevoegd, in drie rangen:

| rang | welke rivieren | vanaf zoom | breedte |
| --- | --- | ---: | --- |
| 1 | vaste lijst: Rijn, Boven-Rijn, Pannerdensch Kanaal, Nederrijn, Lek, Waal, Merwedes, Noord, Nieuwe en Oude Maas, Nieuwe Waterweg, IJssel, Maas/Meuse, Bergsche Maas, Amer, Schelde/Escaut, Eems/Ems, Moezel | z5 | 0,8 px (z5) → 1,5 px (z7) → 2,6 px (z10) |
| 2 | overige rivieren met een naam en ≥ 40 km lengte in het kader | z7 | 0,5 → 1,4 px, vloeit in |
| 3 | overige rivieren met een naam en ≥ 10 km | z9 | 0,4 → 0,8 px, vloeit in |

Rang 1 is een cartografische keuze. Op lengte alleen zouden de Lippe en de Sieg boven de Waal staan. De lijn ligt
onder het watervlak: waar de rivier breder is dan de lijn, tekent het vlak, dus op hoge zoom verandert er niets.

- **Bron.** De OSM-rivierlijnen (`way[waterway=river]`) komen via Overpass (kumi-spiegel, OSM-stand 2026-05-31):
  10.544 ways, 15.692 km. Na samenvoegen per naam en vereenvoudigen op ~20 m zijn ze vastgelegd als
  `tools/basemap/rivers.geojson.gz` (414 KB, ODbL), net als de kust. De Geofabrik-extracten van 2026-10-06 waaruit
  het archief komt, staan niet meer online (404). Herbouwen uit dezelfde PBF's kan dus niet; deze route vervangt
  dat.
- **Archief.** `tools/basemap/rivers.sh` maakt met GDAL de MVT-laag. `rivers-merge.mts` plakt hem per tegel achter
  de bestaande tegel; een MVT is een protobufbericht met herhaalde lagen. Tegels zonder rivier blijven bytegelijk.
  Uitkomst (alle drie de rangen): `nl-965b910bc27fe00f.pmtiles`, 24.586.177 B. Dat is +1,17 % ten opzichte van het
  huidige archief, vooral op z9–10 (rang 3).

## De varianten (`?dev&kaart=…`, vervalt 2026-11-23)

| variant | archief | wat |
| --- | --- | --- |
| `nu` | huidig | ongewijzigd |
| `licht` | huidig | rustiger palet. Overdag land `#f7f5f1`, zee zacht blauwgrijs `#bfd5e8`, bebouwing nog ΔL* 3,5 donkerder dan het land (nu 8,4), zee ΔL* 12 (nu 20), bos/gras zachter, grenzen dunner en grijzer, plaatsnamen `#2a2a2a`. 's Nachts dezelfde opbouw; bebouwing ΔL* 2,4 boven het land (nu 9,0). |
| `licht-rivieren` | met rivieren | `licht` plus de rivierlijnen. De lijnkleur is één stap dieper dan het water, zodat dunne rivieren lezen. |
| `atlas` (eigen voorstel) | met rivieren | Getekende schoolatlas. Papiertoon `#f4f0e6`, rivieren in inktblauw, een zacht roze lint langs de landsgrens en warme labelinkt. 's Nachts is de zee duidelijk donkerder dan het land (ΔL* 8,5; eerste poging 2,9 was onleesbaar). |

Een inktrand langs alle watervlakken (kust, meren) viel af. Vlakken zijn per tegel afgeknipt, dus zo'n rand tekent
elke tegelgrens als lijn op zee. Hetzelfde probleem had de donkere `fill-outline-color` in U62.

## Bytes (koud laden, telefoon 390 px, alleen kaarttegels)

| beeld | `nu` / `licht` | `licht-rivieren` / `atlas` | verschil |
| --- | ---: | ---: | ---: |
| startbeeld | 61.556 B | 63.497 B | +1.941 B (+3,2 %) |
| zoom 7 (rivierland) | 416.404 B | 426.034 B | +9.630 B (+2,3 %) |
| zoom 8 | 461.841 B | 467.453 B | +5.612 B (+1,2 %) |

Gemeten met `web/scripts/basemap-variant-shots.ts` (Playwright, lege cache, alle requests van de context). Het
aantal range-requests blijft gelijk (2 / 5 / 5). De stijl zit voor `nu` inline in de HTML. De dev-varianten halen
hem los op (2,9–3,3 kB); bij aanname komt hij weer inline. De +25 %-poort van MIP-21 blijft ruim gehaald.

## Wat ik zag (zelf bekeken, licht en donker, telefoon en desktop)

1. **Rivieren.** In `licht-rivieren` en `atlas` lopen Waal, Maas, Lek, IJssel en Schelde op z6–8 door. In `nu` en
   `licht` blijven het snippers. Op z10 zijn alle vier gelijk; daar tekenen de vlakken.
2. **Rust.** Beide lichte varianten zijn duidelijk rustiger. De stadsvlekken zijn nog zichtbaar, maar trekken niet
   meer. Regen steekt beter af: overdag moet regen donkerder zijn dan de ondergrond, en die is lichter geworden.
3. **Weerlagen.** In Gevoel en Wind ligt een dekkende kleurwas over de kaart. Onder die was is de kust in `licht`
   en `licht-rivieren` zwakker dan in `nu`, maar nog leesbaar. Daarom is de zee een stap voller dan mijn eerste
   poging. `atlas` houdt 's nachts de kust het best, door de donkere zee.
4. **Bot.** De platen volgen de variant (`bot/basemap-variant-plates.ts` → `motregen-render --basemap-dir`). De
   still uit de windfilm laat dezelfde winst zien als de app.

Bladen per variant (rijen z6/7/8/10, Gevoel/Wind en de bot; kolommen telefoon/desktop × licht/donker) en stroken
per zoom staan in `.dev/tracks/u108-basiskaart/bladen/`. Live: `http://ageq-dev2:4308/?dev&kaart=licht-rivieren`
(of `licht`, `atlas`, `nu`).

## Aanbeveling

**`strak` als nieuwe standaard.** Het houdt de kaart die de PO goed vond, maakt rivieren en steden op lage zoom
netjes, en tekent op z7 een vijfde van de vertices. Van de verkenning hierboven raad ik niets over te nemen; de
lichtere paletten zijn een smaakkeuze die hier niet gevraagd is.

## Bij aanname (vervolg, niet in deze track)

1. `strak` wordt `licht.json`/`donker.json` (palet gelijk, plus rivierlagen) en `manifest-strak.json` wordt
   `manifest.json`. Het oude archief blijft tijdens de cacheovergang in het package (MIP-21). `GROUND_COLOURS` blijft
   gelijk (zelfde palet). `publish.mts` moet de laag `waterway` toestaan.
2. Botplaten opnieuw (`prepare-rust-basemaps` → `crates/render/assets/basemaps/`); de windzakankers controleren
   (`bot/windsock-anchors.ts`, naammasker).
3. `docs/basemap.md`: de rivierlaag, de bron, `rivers.sh`, `strak.sh` en `compose.mts` toevoegen. De U60-meetrig
   (groen/grijs ±15 % van Liberty) opnieuw draaien op `strak`; bebouwing ligt bewust iets lager.
4. De dev-knop en `web/public/dev-kaart/` weghalen.

## Vragen aan de PO

1. `strak` als standaard (mijn advies), of nog een ronde op de generalisatie (meer of minder samensmelten,
   gras/zand terug op z7–8)?
