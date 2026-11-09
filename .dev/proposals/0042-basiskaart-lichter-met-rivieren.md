# MIP-42 — Basiskaart lichter, met doorlopende rivieren

Status: draft · auteur: worker U108 (opus-5.5) voor de orkestrator · gemeten 2026-11-09 · PO-wens 2026-11-09

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
  Uitkomst: `nl-0e0be41b91fefb0f.pmtiles`, 24.586.189 B. Dat is 284.427 B (+1,17 %) meer dan het huidige archief,
  vooral op z9–10 (rang 3).

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

**`licht-rivieren` als nieuwe standaard.** Het lost beide klachten op (licht én rivieren), het kost +2–3 % koude
kaartbytes en het laat de weerlagen het werk doen. `atlas` is mooier als kaart op zich. Op een weerkaart vind ik
het roze grenslint en de papiertoon net te veel eigen kleur onder temperatuur en wind.

Eén onderdeel van `atlas` raad ik apart aan: de **donkere zee 's nachts**. Die maakt de kust onder regen en Gevoel
beter leesbaar, en regen moet 's nachts lichter zijn dan de ondergrond. Dat kan als vervolgstap op
`licht-rivieren`-donker.

## Bij aanname (vervolg, niet in deze track)

1. `licht-rivieren` wordt `licht.json`/`donker.json` en `manifest-rivieren.json` wordt `manifest.json`. Het oude
   archief blijft tijdens de cacheovergang in het package (MIP-21). `GROUND_COLOURS` in `rain-palette.ts` volgt de
   nieuwe grondkleuren; de test daar bewaakt dat.
2. Botplaten opnieuw (`prepare-rust-basemaps` → `crates/render/assets/basemaps/`); de windzakankers controleren
   (`bot/windsock-anchors.ts`, naammasker).
3. `docs/basemap.md`: de rivierlaag, de bron en `rivers.sh` toevoegen; de U60-meetrig (groen/grijs ±15 % van
   Liberty) geldt bewust niet meer voor het lichte palet.
4. De dev-knop en `web/public/dev-kaart/` weghalen.

## Vragen aan de PO

1. Welke variant: `licht-rivieren` (mijn advies), `licht`, `atlas` of `nu`?
2. 's Nachts de zee donkerder dan het land (zoals `atlas`)?
