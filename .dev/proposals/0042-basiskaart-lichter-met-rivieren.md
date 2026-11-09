# MIP-42 — Basiskaart `diagram`: een eigen weerkaart, een orde lichter dan prod (strak als tussenstap)

Status: draft · auteur: worker U108 (opus-5.5) voor de orkestrator · gemeten 2026-11-09 · PO-wens 2026-11-09

## Hoofdrichting: `diagram` (Herijking PO 2026-11-09)

De PO: "het eigenlijke doel is onze eigen meer diagrammatische kaart, die een stuk lichter is dan de libremap en meer
toegespitst op weer. Ik denk dat gmaps een soort coarsegraining gebruikt met visuele similariteit." Daarbij: niet te
letterlijk diagrammatisch, **herkenbaarheid** eerst; rivieren, kernen, kust, grote wateren, grenzen en namen erin; bos
binair; geen zand, heide, gras of moeras ("doe maar zand helemaal weg/mergen met bos ofzo"); geen stekels in het water
en een gelijkmatige rivierbreedte; snelwegen optioneel (een variant met en een zonder).

**Wat `diagram` is** (`?dev&kaart=diagram`, met snelwegen `?dev&kaart=diagram-wegen`): water, bos (één tint), kernen,
rivieren en grote kanalen als lijnen, grenzen en plaatsnamen. Plaatsen en grenzen komen ongewijzigd uit het huidige
archief, de rest direct uit OSM (Geofabrik 2026-11-08: NL, BE, NRW, Niedersachsen, Rheinland-Pfalz). Archief
3.018.919 B (prod 24.301.762 B, −88 %); met wegen 3.159.366 B.

**Algoritme: generalisatie als rasterfilter op de doelresolutie** (`tools/basemap/diagram.sh`, ±2,5 min):
1. Per zoom (4–10) en klasse de bronvlakken binair rasteren op 4× (z4–8) of 2× (z9–10) de pixelresolutie van die zoom.
2. Morfologie per klasse en zoom (`tools/basemap/blur.mts`; eroderen = vervagen en drempel op 80 %, dilateren = drempel
   op 20 %):
   - **water** wordt **geopend** vanaf z7 (0,25 px op z7, 0,45 px vanaf z8). Water smaller dan ~1,2 px (sloten,
     vaarten, smalle rivierstukken) verdwijnt; land krimpt nooit, dus eilanden en dijken blijven. Op z4–6 niet:
     smal water als de Westerschelde of het Haringvliet (±1 px) maakt Zeeland juist herkenbaar.
   - **kernen** worden op z4–7 **gesloten** (0,5 → 0,3 px). OSM-woonwijken liggen als losse vlakken tussen de wegen;
     gesloten worden ze één herkenbare kern.
   - **bos**: alleen effenen.
3. Effenen met een Gauss-σ (water 0,15 px, bos 0,8 px, kernen 0,6 px), dan de contour op 50 % (`gdal_contour -p`,
   in blokken van 2048 px parallel). Een vervaagde contour heeft van zichzelf geen stekels.
4. Topologiebehoudend vereenvoudigen op 0,3 px, delen kleiner dan 2 px² weg.
5. Rivieren (rang 1 vanaf z5, rang 2 vanaf z7, rang 3 vanaf z9) en 26 grote scheepvaartkanalen (vaste lijst, vanaf z7)
   worden lijnen met een vaste, met de zoom meegroeiende breedte, onder het watervlak. Waar het geopende water een
   rivier of kanaal heeft weggehaald, loopt de lijn door: geen afgesnoerde rivieren, een gelijkmatige breedte.

**Metriek en drempels (automatisch):**
- *Visuele afwijking* E per klasse en zoom (`diagram-metric.mts`): beide maskers als dekking per doelpixel, vervaagd met
  σ = 1 px (wat het oog op die zoom ziet), E = Σ|kandidaat − bron| / Σ bron. Water z7–10: E 2–6 %. Bos en kernen
  bewust hoger (z7 58 % en 55 %, z10 27 % en 14 %): snippers onder ~1,5σ verdwijnen, en dat is de vereenvoudiging.
  E stuurt de keuze per klasse; de doorslag gaven de bladen (de PO: herkenbaarheid).
- *Kust* (`coast-check.mts`, 22 gebieden × z5–10, tegen de OSM-bron zelf gerasterd): faalt bij > 10 % + 1 px²
  landverlies of > 25 % + 1 px² winst. `diagram`: **130/132**. Alleen de Marker Wadden op z6–7 vallen nipt buiten de
  marge (7,2 → 5,4 px² op z7). Ter vergelijking haalt prod zelf tegen dezelfde bron 127/132.
- *Stekels* (`spike-check.mts`: binnenhoek < 20° met benen ≥ 1 px; dun = 2A/P < 0,75 px). Water rond
  Uithoorn/Vinkeveen op z10: prod 1.987 stekels (134 per 1000 vertices), dunne ringen 38 %; `diagram` 5 stekels
  (1,0 per 1000), dunne ringen 12 %.

**Bytes en vertices** (NL-kader, alle lagen, `layer-cost.mts`):

| zoom | prod | `strak` | `diagram` | `diagram` t.o.v. prod |
| --- | ---: | ---: | ---: | ---: |
| z5 | 45 KB · 35.254 vtx | 19 KB · 10.044 | 9 KB · 3.160 | −80 % · −91 % |
| z6 | 171 KB · 98.065 | 64 KB · 25.463 | 38 KB · 9.615 | −78 % · −90 % |
| z7 | 640 KB · 401.687 | 159 KB · 71.534 | 82 KB · 29.841 | −87 % · −93 % |
| z8 | 1,49 MB · 879.326 | 425 KB · 196.742 | 199 KB · 82.268 | −87 % · −91 % |
| z9 | 3,07 MB · 1.661.566 | 1,65 MB · 732.766 | 700 KB · 276.845 | −77 % · −83 % |
| z10 | 7,50 MB · 3.857.635 | 7,54 MB · 3.873.486 | 1,66 MB · 731.354 | −78 % · −81 % |

Een orde kleiner dan prod op z5–8; op z9 nog niet (−77 % bytes). De knop daarvoor is σ en de vereenvoudiging van
bos en kernen op z9.

**Koud laden op de telefoon** (alleen kaarttegels, `basemap-variant-shots.ts`): startbeeld prod 61.556 B → `diagram`
25.051 B (−59 %), z7 416.404 → 81.896 B (−80 %), z8 461.841 → 112.360 B (−76 %). Met snelwegen: z7 95.432 B,
z8 126.458 B (+13–17 % t.o.v. `diagram`).

**Teken- en laadkosten van de kaartlaag** (`web/scripts/basemap-perf.ts`):
- Opzet: een kale MapLibre-pagina met alleen de basiskaart (geen weerlagen), telefoon 390 px @2×, koud per variant,
  om en om, 3 rondes, mediaan.
- Headless Chromium tekent met SwiftShader (CPU), dus de absolute tijden zijn opgeblazen; de verhouding telt. Host
  loadavg ±21.
- U109's `perf.layers` staat op een andere branch en meet de eerste tekenbeurt per laag in de volle app; deze meting
  isoleert de kaartlaag en meet de kosten per beeld.

| | prod | `strak` | `diagram` | `diagram-wegen` |
| --- | ---: | ---: | ---: | ---: |
| tekenen per beeld z7 (redraw + readPixels) | 26,4 ms | 14,1 ms | 11,6 ms (−56 %) | 13,4 ms |
| tekenen per beeld z9 | 19,6 ms | 14,3 ms | 11,8 ms (−40 %) | 11,9 ms |
| tekenen per beeld z10 | 11,4 ms | 10,7 ms | 8,5 ms (−25 %) | 9,6 ms |
| laden tot eerste `idle` | 523 ms | 345 ms | 348 ms (−33 %) | 351 ms |
| tegelbytes, camerarit 9 s (z7→9, pannen, z6) | 1.142 KB | 629 KB | 256 KB (−78 %) | 300 KB |

De frame-intervallen tijdens de rit zitten aan vsync (p95 17,2 ms bij alle varianten). De JS-heap schommelt tussen
12 en 30 MB en onderscheidt de varianten niet.

**Gezien (zelf bekeken, bladen in `.dev/tracks/u108-basiskaart/bladen/diagram/`):**
- Herkenbaar Nederland op z5–11, licht en donker, onder Gevoel en Wind.
- Rond Uithoorn, De Kwakel, Vinkeveen en Nieuwkoop zijn de stekelkammen weg. De Amstel bij Ouderkerk is één even brede
  lijn.
- Het Amsterdam-Rijnkanaal loopt door: eerst brokken (PO), nu een lijn.
- De Vinkeveense Plassen houden hun legakker.
- De Veluwe heeft één bostint zonder zand.
- Wadden en Zeeland zijn compleet.

## Tussenstap: `strak` (PO-bijsturing 2026-11-09)

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
| `strak` | strak | Oorspronkelijk palet, rivieren rang 1–2, landbedekking z5–9 en water z5–8 opnieuw gegeneraliseerd. |
| `diagram` | diagram | Eigen weerkaart: water, bos, kernen, rivieren en kanalen, grenzen, namen. Rastergeneraliseerd uit OSM; zie boven. |
| `diagram-wegen` | diagram-wegen | `diagram` plus snelwegen (`highway=motorway`, vanaf z6). |
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

**`diagram` als nieuwe standaardkaart**, zonder snelwegen. Hij is herkenbaar en een orde lichter dan prod op z5–8. Hij
tekent 40–56 % sneller op z7–9, en hij lost de PO-punten op die `strak` niet raakte: zand, stekels, rivierbreedte en
kanalen. De snelwegen kosten 13–17 % bytes en 1–2 ms per beeld. Voor een weerkaart voegen ze weinig toe, maar ze
helpen wel bij oriëntatie op z8+; dat is de keuze van de PO.

`strak` blijft als terugvaloptie als `diagram` niet wordt aangenomen. Zijn Wadden-fix staat in a9c3efb.

## Bij aanname (vervolg, niet in deze track)

1. `diagram` (of de gekozen variant) wordt `licht.json`/`donker.json` en `manifest-diagram.json` wordt `manifest.json`;
   `diagram.sh` hoort dan in `build.sh` (dezelfde Geofabrik-datum als de rest). Het oude archief blijft tijdens de cacheovergang in het package (MIP-21). `GROUND_COLOURS` blijft
   gelijk (zelfde palet). `publish.mts` moet de laag `waterway` toestaan.
2. Botplaten opnieuw (`prepare-rust-basemaps` → `crates/render/assets/basemaps/`); de windzakankers controleren
   (`bot/windsock-anchors.ts`, naammasker).
3. `docs/basemap.md`: de rivierlaag, de bron, `rivers.sh`, `diagram.sh`, `blur.mts`, `compose.mts` en de drie
   controles toevoegen. De U60-meetrig (groen/grijs ±15 % van Liberty) geldt dan niet meer: gras, park en zand zijn
   weg, bewust.
4. De dev-knop en `web/public/dev-kaart/` weghalen.

## Vragen aan de PO

1. `diagram` als standaard, met of zonder snelwegen?
2. Nog een ronde op z9 richting een volle orde kleiner, met grover bos en grovere kernen? Dat maakt de kernen op z9
   iets blokkeriger.
3. Bostint: nu de oorspronkelijke Liberty-tint, zwak omdat gras en park weg zijn. Iets voller?
