# U72 — live-pane: smoothing/upsampling van het regenveld (opus-5.5)

Append-only. Spec: `.dev/specs/track-u72-regenveld-smoothing-live.md`. Preview: http://ageq-dev2:4320/?dev

## 2026-10-09 14:25 — ingelezen; twee bevindingen die de spec bijstellen
- De shader stond NIET op blokken: `rainSample` mengt zelf de vier buurcellen (texelFetch, vanwege de 255 =
  geen-data-byte). "Nu" is dus al bilineair op het gedeelde raster. `gl.NEAREST` op de textuur is alleen de
  opslag; de filtering gebeurt in de shader.
- De blokken van HARMONIE zitten in de DATA. Alle regenbronnen staan op hetzelfde gedeelde raster (1250×1350,
  1 km in Web Mercator ≈ 0,62 km op de grond; de vier chunks delen de rasterhash `g610bb747061d5247`), en de
  ingest zet elke bron er met dichtste-buur op (`crates/ingest/src/grid.rs`, `nearest_index`). AROME is
  0,029° × 0,018° ≈ 2 km = ~3,25 rastercel breed; radar/nowcast/blend ~1 km = ~1,6 cel. Bilineair op het fijne
  raster verzacht alleen de rand van elk blok. Een blur "in rastereenheden" van het gedeelde raster doet op
  HARMONIE dus juist minder; de kernen moeten in BRONcellen rekenen.
- De blend (`seamless`, +2…+6 u) heeft een bronraster van ~1 km en hoort bij de groep radar/nowcast. HARMONIE
  begint in de tijdlijn pas ruim 6 uur vooruit; "+6 u" uit de spec is nog blend. Beelden daarom op +9 u en +23 u.

## 14:28 — gebouwd
- `web/src/core/rain-layer.ts`: per frame een kern (`u_left_kernel`/`u_right_kernel` + breedte van de broncel);
  de standaard `bilinear` loopt door de ongewijzigde `rainSample`. Nieuw: `nearestSample` en `sourceSample`
  (knopen op een rooster met de maat van één broncel, elk één texelFetch; gewogen op de byte vóór de paletlookup).
  Tijdmenging: `u_blend_eased`, en de warp-kap als uniform in plaats van constante.
- `web/src/core/rain-smoothing.ts`: de standen, de opslagsleutels, bron → groep, broncelbreedtes.
- `?dev` › Kaart: "Regenveld radar/nowcast", "Regenveld HARMONIE", "Tijdmenging HARMONIE". Zonder `?dev`
  wordt er niets gezet: het product tekent exact als voorheen.

| stand | wat | texels per pixel (eerste versie, in de tekenshader) |
| --- | --- | --- |
| blokken | dichtste rastercel (referentie: zo ziet de data eruit) | 1 |
| bilineair | NU: vier rastercellen | 4 |
| bronlineair | lineair tussen 2×2 broncellen | 4 |
| glad | bicubisch (Catmull-Rom) over 4×4 broncellen; gaat door de bronwaarden, vervaagt niet | 16 |
| blur 3×3 | klokvormige weging over 3×3 broncellen | 9 |
| blur 5×5 | idem over 5×5 broncellen | 25 |

## 14:35 — beelden (zelf bekeken), `beelden/{nl,stad}-{radar,harmonie}-{dag,nacht,nacht-vast}-{1280,390}.webp`
Rig `rig/field-shots.ts` + `rig/run-field-shots.sh` (kopieer naar `web/tmp/u72/`, draai vanuit `web/`): één
pagina per beeld, de stand wisselt via de dev-knop, dus elke cel is hetzelfde frame en dezelfde uitsnede.
`nl` = startbeeld, `stad` = zoom 9 rond de Veluwe. Radar = nu (14:30, bronnen rtcor/nowcast); HARMONIE nacht =
+9 u (23:30), dag = +23 u (morgen 13:30), bron per beeld gecontroleerd via `data-rain-sources`. `nacht-vast` =
donker thema met Expressief uit (radar heeft vanmiddag geen nachttijd). 16 beelden, 0 mislukt.

## 14:40 — tijdmenging HARMONIE (opdracht 2), `beelden/tijdmenging-harmonie-1280.webp`
Rijen 23:15 / 23:30 / 23:45 tussen de uurframes van 23:00 en 00:00, kolommen de drie standen, regenveld op blur 3×3.
- kruisfade (nu): halverwege zakt de piek in (oranje kern boven de Veluwerand wordt geel): twee beelden van
  dezelfde bui op verschillende plekken middelen elkaar uit. Bij afspelen is dat het "pulseren" per uur.
- vloeiend (S-curve): op :30 identiek aan kruisfade, op :15/:45 dichter bij het uurframe. Lost het inzakken
  niet op en maakt het tempo schokkerig (stilstaan–schuiven–stilstaan). Afrader.
- meebewegen: de kern blijft oranje en verplaatst; dit is de enige stand die tussen de uren een bui laat
  lopen. Hoe: de warp-kap (15 cellen, bedoeld voor 5-minutenframes) gaat voor een HARMONIE-paar naar 120;
  het bewegingsveld zat al in de data. Risico dat een still niet toont: waar het bewegingsveld niet klopt
  (bui die ontstaat of oplost) schuift er iets wat er niet hoort. Dat moet de PO afspelend beoordelen.

## 14:50 — frametijd, eerste versie (kernen in de tekenshader): AFGEKEURD
`rig/field-frames.ts` + `rig/run-field-frames.sh` (po-android: renderer-cgroup 40 %, 25 s laden, 20 s afspelen
in Weer vanaf +9 u; gepaard, om en om, perf-lock per run, load bij start ≤ 16). `metingen/frametijd-in-tekenshader-*.log`.
| HARMONIE-stand | frames in 20 s | p50 | p95 | frames > 34 ms | lange frames |
| --- | --- | --- | --- | --- | --- |
| bilineair (nu) | 875 / 761 / 1112 | 16,7 | 50 / 50 / 16,8 | 73 / 106 / 21 | 22 / 39 / 8 |
| blur 3×3 | 494 / 474 / 452 | 33,4 | 83 / 83 / 100 | 227 / 232 / 225 | 136 / 154 / 160 |
| bilineair (nu) | 1090 / 790 / 1067 | 16,7 | 33 / 50 / 33 | 30 / 95 / 35 | 8 / 26 / 10 |
| bronlineair | 756 / 645 / 354 | 16,7–67 | 50 / 67 / 133 | 113 / 169 / 212 | 55 / 79 / 185 |
In de tekenshader halveert blur 3×3 het aantal frames, en zelfs bronlineair (evenveel texels als nu) is trager.
De rig tekent met SwiftShader, dus dit is shaderwerk op de CPU en voor een telefoon-GPU een bovengrens — maar het
is precies de "nare perf-impact" waar de PO naar vroeg, dus niet zo laten. De sets voor glad en radar heb ik
afgebroken (zelfde conclusie, de perf-lock is schaars).

## 15:00 — omgebouwd: voorfilter per geüpload frame
De bronkernen draaien nu één keer per frame dat met zo'n kern getoond wordt (`RainLayer.filterFrame`: een pass
over het raster naar een tweede R8-textuur met dezelfde betekenis, 255 = geen data). De tekenshader leest dat
frame daarna met de ongewijzigde bilineaire `rainSample`. Per getekend beeld is het werk dus gelijk aan nu; de
vervaging kost alleen bij een nieuw frame (HARMONIE: één keer per uur kaarttijd; radar/nowcast: per 5 minuten
kaarttijd). `blokken` blijft een schakelaar in de tekenshader (één texel).
- Beeld gelijk aan de eerste versie, zelf bekeken: `beelden/voorfilter-stad-harmonie-nacht-1280.webp`,
  `beelden/voorfilter-nl-radar-dag-390.webp`. De 16 matrixbeelden zijn van de eerste versie (zelfde kernen).
- Frametijd, zelfde rig (`metingen/frametijd-voorfilter.log`). De host liep tijdens meerdere runs op tot
  load 22–29 (andere tracks); die runs staan tussen haakjes en tellen niet.
| | frames in 20 s | p95 | frames > 34 ms | lange frames |
| --- | --- | --- | --- | --- |
| HARMONIE +9 u: nu (bilineair, kruisfade) | (833) / (891) / 1168 | (67) / (50) / 16,8 | (91) / (73) / 5 | (31) / (17) / 5 |
| HARMONIE +9 u: blur 3×3 + meebewegen | 1165 / (537) / 1124 | 16,8 / (83) / 16,8 | 7 / (176) / 14 | 1 / (63) / 5 |
| radar/nowcast nu: bilineair | 1047 / 1164 / 1172 | 16,8 / 16,8 / 16,8 | 14 / 11 / 4 | 8 / 1 / 0 |
| radar/nowcast nu: glad | (786) / 1180 / 1184 | (50) / 16,8 / 16,8 | (51) / 4 / 5 | (32) / 2 / 1 |
  Op de rustige runs is er geen verschil: p95 16,8 ms in beide standen, frames binnen 1–4 %. De rommelige runs
  vallen samen met de load, niet met de stand (ze komen in beide rijen voor). Eerlijk voorbehoud: per stand
  blijven zo maar 2 geldige runs over, en de ene glad-run onder load had een uitschieter van 1,9 s (de nu-run
  ernaast 0,55 s) die ik niet kan toewijzen. De PO-telefoon op 4320 is de echte toets.

## 15:20 — oordeel en advies (niets vastgezet; standaard blijft bilineair + kruisfade)
- HARMONIE: **blur 3×3**. De blokken zijn weg op elk zoomniveau, de structuur van de buien (banen, kernen)
  blijft staan. `glad` is scherper maar houdt op schuine randen een zachte trap (`beelden/rand-boven-zee-harmonie-3x.webp`,
  linksonder); `bronlineair` geeft ruitvormige knikken in de pieken; `blur 5×5` is zichtbaar waziger en smeert
  smalle banen uit — te veel, al past dat bij een verwachting van 24+ uur.
- HARMONIE-tijd: **meebewegen**, mits het afspelend goed oogt (zie risico hierboven).
- Radar/nowcast: **glad**, of laten. Op landelijk niveau zie je geen verschil met nu; ingezoomd (zoom 9, vooral
  op de telefoon) verdwijnen de kartels langs droge gaten en buiranden zonder dat detail verloren gaat. De blurs
  kosten hier juist het detail waar radar goed in is: niet doen.
- Niet onderzocht: de ingest zelf bilineair laten regridden (dan is de bron al glad en hoeft de client niets);
  dat is een datawijziging en valt buiten deze track.

## 15:25 — gate (web/)
`pnpm typecheck` 0 · `pnpm test` 0 (80 bestanden, 534 tests) · `pnpm build` 0 ·
`MOTREGEN_E2E_PORT=4390 MOTREGEN_E2E_DATA_PORT=8390 pnpm e2e e2e/dev-panel.spec.ts e2e/rain-playback.spec.ts --project desktop` 0 (5 groen).
Preview 4320 draait op deze build (`MOTREGEN_DATA_ORIGIN=https://motregen.nl/data pnpm preview --host 0.0.0.0 --port 4320 --strictPort`, los van de sessie gestart).
