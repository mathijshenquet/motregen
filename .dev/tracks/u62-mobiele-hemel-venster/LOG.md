# U62 — LOG (append-only)

## 2026-10-08 07:20 — start
Spec gelezen, PO-screenshots bekeken (cursor 08:08 vs 09:31: band 8u–9u wordt donkerder, as klopt).
Preview: http://ageq-dev2:4320/ (web/dist, `MOTREGEN_DATA_ORIGIN=https://motregen.nl/data pnpm preview
--host 0.0.0.0 --port 4320 --strictPort`, buiten de sandbox: binnen de sandbox is de poort niet bereikbaar).

## 07:35 — oorzaak (gemeten, niet de as-mapping)
Rig `rig/repro.ts` (390 px, touch-sleep −150 px, live data): uurstreep-x en schemergloed-x identiek vóór/ná,
49 stops in beide, `--day` gelijk. Wél 7 uurstops (8u–14u) met andere `--dark` (bv. 10u 0,919 → 0,18).
- `props.timeline` is de hele tijdlijn; alleen de baan-transform schuift. De as/hemel-mapping klopt.
- `stableByIndex` vergelijkt alle velden (ook `offset`); de index-hypothese van de orkestrator is weerlegd.
- Dader: de donkerte per stop is `cloudModification(straling)` of, zonder straling, de wolkenlaagschatting.
  `radiationSeries` werd gevuld voor de tabelrijen die getoond worden (`tableRowShown`): op een krap
  apparaat de gluur-rijen onder de kaart, die de cursor per uur volgen, en elke lezing verving de hele
  reeks. Een uurstop wisselde dus van bron zodra de cursor een uurrij verder was (de PO-observatie
  "bij uurrij-grenzen"). Desktop laadt alle rijen en had het niet.

## 07:50 — fix
- `core/forecast.ts`: `skyRadiationRows(rows, venster)` = niet-verleden uurrijen in het scrubbervenster ± 1 u.
- `App.tsx`: het stralingseffect vraagt op een krap apparaat tabelrijen ∪ hemelrijen; gelezen waarden
  blijven staan per locatie/tijdlijn (alleen ontbrekende frames worden nog gelezen). `radiation` hoort nu
  bij de getoonde velden (intent), `TABLE_ONLY_FIELDS` is weg.
- Unit: `forecast.test.ts` "sky radiation rows (U62)" — elke zichtbare uurstop (en die net erbuiten) is
  gevoed bij elke cursor. e2e: `e2e/sky-window.spec.ts` (plek onder het synthetische front,
  `/?lat=52.1&lon=3.7`; bij De Bilt is de synthetische dag onbewolkt en test het niets).

## 08:15 — kosten venster-stap (PO-aanvulling 1), `rig/step-cost.ts`
390 px, CPU 4×, 7,2 uur langzaam gesleept, live data; main = 9289cd6 in een tijdelijke worktree op 4321.
| build | lange frames (LoAF) | streken | hemelstops | wolktintstops | nevelstops | frame max |
| main run 1 | 2 (118 ms, max 65) | 598 | 40 | 120 | 37 | 50 ms |
| main run 2 | 2 (106 ms, max 54) | 598 | 40 | 120 | 37 | 50 ms |
| fix run 1/2/3 | 0 | 94 / 80 / 80 | 10 / 7 / 7 | 30 / 21 / 21 | 4 | 33 ms |
De herbouw per uurgrens kwam van de wisselende invoer, niet van een herberekening per venster-stap: de
hemel staat al één keer over de hele tijdlijn in baancoördinaten en schuift met de transform mee. Wat
overblijft (80 streken over 7 uur) is data die aan de vensterrand voor het eerst binnenkomt. Een aparte
afbeeldingscache heb ik daarom niet gebouwd; zie open punt A1.

## 08:30 — gate stap 1 (synchrone exit-statussen, vanuit web/)
- `pnpm typecheck` → 0
- `pnpm test` → 0 (72 bestanden, 480 tests; buiten de sandbox, tsx opent een IPC-socket)
- `pnpm build` → 0
- `MOTREGEN_E2E_PORT=4196 MOTREGEN_E2E_DATA_PORT=8196 pnpm e2e e2e/cloud-section.spec.ts
  e2e/sky-window.spec.ts --project desktop --project mobile-4g` → 0 (4 groen)
- Dezelfde `sky-window.spec` op main (9289cd6): desktop groen, mobile-4g ROOD (uurstop dark 0 → 0,207).
- `rig/repro.ts` op de fix: 0 gewijzigde stops in beeld (2 buiten het oude venster: data die binnenkomt).
- `rig/sample.mjs fix2`: pixelkleur op dezelfde uurstops vóór/ná identiek. Eigen beelden bekeken:
  `metingen/fix2-voor.png`, `fix2-na.png` (390 px), `fix2-desktop.png`.

## Open
- A1 (PO/orkestrator): statische afbeeldingslaag voor de hemel — volgens de meting niet nodig; alleen
  bouwen als de PO op de telefoon nog een hik ziet.
- A2: wolkenlagen laden ± 30 min rond het venster; de stop net buiten het venster kan nog zonder
  bewolking staan (alleen 's nachts/verleden relevant, waar de laagschatting geldt). Venster verbreden
  kost decodes (U49-budget) — niet gedaan.
- Stap 2 (tabelrijen tweenen niet bij handmatig seeken), stap 3 (contextgevoelig chrome), stap 4
  (windstreepjes mobiel): nog te doen, in die volgorde.

## 08:45 — stap 1 gecommit (4e0094e), gepusht, draft-PR #89
https://github.com/mathijshenquet/motregen/pull/89. Preview 4320 serveert deze build.

## 09:10 — stap 2 (tabelpiep tweent niet bij handmatig seeken): NIET gereproduceerd
Rig `rig/table-follow.ts` (390 px, touch; args: baseURL label stappen cpu-rem): legt per frame de scrollTop
van `.table-scroll` vast en elke `scrollTo` met gedrag, bij afspelen en bij een touch-sleep van ~3,5 uur.
| build | sleep | scrollTo bij seek | verloop per uurstap |
| main 9289cd6 | 4,8 s, CPU 1× | 4× smooth (+5× auto zonder verplaatsing) | 8 posities, ~130 ms |
| main | 1,2 s, CPU 4× | idem | 8 posities |
| main | 0,5 s, CPU 4× | 4× smooth (+4× auto) | 7–8 posities |
| fix 4e0094e | 1,2 s / 0,5 s, CPU 4× | idem | 7–8 posities |
Afspelen in dezelfde runs: 1× smooth, 8 posities. Code: afspelen en seeken lopen door hetzelfde effect
(`tablePreviewEpoch` → `queueTablePreview(…, 'smooth')`); er is geen aparte afspeeltik. De `auto`-aanroepen
komen van `scrollend`/ResizeObserver (`correct`) en verplaatsen in de rig niets.
Kandidaat-oorzaken die de rig niet kan uitsluiten: (a) Android Chrome behandelt een programmatische
smooth-scroll anders terwijl er een vinger op het scherm ligt; (b) `correct` (auto) valt op het toestel
midden in een lopende tween wanneer rijen bijladen en de tabel van hoogte verandert.
Niet blind omgebouwd. Voorstel als de PO het bevestigt: eigen tween op gecachte rij-offsets (één meting
per tabel-layout via de bestaande ResizeObserver, daarna geen layout-reads per uurstap), waardoor seeken
en afspelen per constructie gelijk zijn en `correct` een lopende tween niet meer kan afkappen.
Vraag aan de PO: welk gebaar (slepen met vinger erop, fling na loslaten, of tik) en springt de rij dan
in één keer of blijft hij staan tot je loslaat?

## 09:25 — orkestrator: preview stierf met het einde van de turn
Opnieuw gestart als losgekoppeld proces vanuit web/:
`MOTREGEN_DATA_ORIGIN=https://motregen.nl/data setsid nohup pnpm preview --host 0.0.0.0 --port 4320
--strictPort > tmp/u62/preview-4320.log 2>&1 < /dev/null &` (buiten de sandbox). Serveert web/dist; een
nieuwe `pnpm build` is direct zichtbaar.

## 10:20 — stap 3: contextgevoelig chrome
- (a) Tijdliniaal op de hemel: de hemel-gradient loopt 26 px door boven het plot (`.ruler-sky` + dezelfde
  zenittint als de bovenrand van het plot, anders een naad), met een sluier-gradient op dezelfde uurstops.
  Per uur dag of nacht (grens: daglicht 0,5): overdag lichte sluier + donkere inkt, 's nachts donkere
  sluier + lichte inkt; donker thema altijd donkere sluier + lichte inkt. Het vaste daglabel kiest zijn
  ondergrond naar de hemel waar het op dat moment boven staat. Zonder hemel (Expressief uit, vóór het
  laden) blijft de liniaal wit zoals hij was.
- (b) Koppenrij (= tabelkop én modusbalk, één `<thead>`): `headSky` uit `chromeSky` in App — daglicht op
  de cursorminuut, donkerte van het cursoruur via `hourDarkness` (uit ForecastTable naar core/forecast
  getild, zelfde bron als de rijen). CSS hergebruikt `tr.day-hour`/`tr.night-hour`; overdag donkerder
  inkt (`--muted #3a525c`, `--accent #0b607e`) omdat de kleine kopletters anders onder 4,5:1 zakken.
- (c) Klokpil: `?dev` → groep Chrome → Klokpil wit/mee-tinten (`motregen-dev-klokpil`, eigenaar U62,
  vervalt na PO-keuze; docs/dev-opties.md bijgewerkt). Standaard wit = ongewijzigd.
- Contrast gemeten (`rig/chrome.ts`: inkt uit computed style tegen de slechtste pixel van de ondergrond
  achter elk label, 18 scènes = 390/desktop × licht/donker × dag/schemer/nacht × klokvariant):
  laagste waarden uurlabel 5,76 · daglabel 7,8 · koppenrij 5,29 · klokpil 5,42 (mee-tinten, schemer).
  Volledige tabel: `stap3/contrast.json`. Eerste meting had de koppenrij in donker thema overdag op 3,07
  (specificiteit van de donker-thema-regel); gerepareerd en opnieuw gemeten.
- Eigen beelden bekeken: `stap3/*.png` (390 dag/schemer/nacht, donker thema, desktop dag/nacht).
- Gate (web/, synchrone exit-statussen): typecheck 0 · `pnpm test` 0 (72 bestanden, 482 tests) · build 0 ·
  desktop `cloud-section sky-window table dev-panel freshness`: eerste run 9 groen / 1 rood (dev-panel:
  groepenlijst kende "Chrome" nog niet) → spec bijgewerkt + klokpil-check toegevoegd → dev-panel 0;
  mobile-4g `cloud-section sky-window` 0 (2 groen). De andere negen desktop-tests zijn na de
  spec-aanpassing niet opnieuw gedraaid (er veranderde alleen dev-panel.spec).
- Open voor de PO: de koppenrij wordt 's nachts een donkere balk tussen hemel en rijen (ook als de
  eerste zichtbare rij al dag is, bv. 07:45 vlak voor zonsopkomst) — bewust zo gelaten, PO-oordeel.

## 10:25 — stap 2: antwoord van de PO
Firefox Android, alleen zolang de vinger op het scherm ligt; na loslaten en in Chrome tweent het wel.
Dus kandidaat (a). Volgende: eigen tween op gecachte rij-offsets, zonder scrollTo tijdens een actieve
touch. Daarna in de wachtrij: compositorlaag/blokken-meting op po-android, stap 4 windstreepjes.

## 10:28 — stap 3 gecommit en gepusht (0c486c4)

## 11:00 — stap 2: eigen tween voor de tabelpiep
- `App.tsx`: `followTableToEpoch` — rAF-tween op `scrollTop` (220 ms, ease-out) naar een doel uit
  `tableRowTops` (epoch → scrollTop, één meting per tabel-layout; de ResizeObserver maakt hem ongeldig).
  Geen `scrollTo({behavior:'smooth'})` meer voor het volgen, dus niets wat Firefox tijdens een actieve
  touch kan weigeren; slepen, fling en afspelen lopen door hetzelfde pad. Een resize tijdens een tween
  laat hem doorlopen naar het nieuwe doel; `scrollend` van onze eigen frames wordt genegeerd.
  `scrollTableToEpoch` (native smooth) blijft alleen voor de tik op een rij in de open tabel.
- Gekozen voor scrollTop-frames in plaats van een transform op de rij-container: één mechanisme, geen
  overdracht transform → scrollTop aan het eind (naad-risico) en de IntersectionObserver van de
  gluur-rijen blijft kloppen. Als Firefox ook scrollTop-schrijven tijdens een touch tegenhoudt (niet
  verwacht: de sprong die de PO zag ís zo'n schrijfactie), is de transform-variant het vervolg.
- Rig `rig/table-follow.ts` (leest nu bewegingen uit de frames): CPU 4×, geen native scrollTo meer;
  afspelen 8–11 posities / 157–219 ms per uurstap; langzaam slepen 8–10 posities / 168–194 ms; snel
  slepen (3,5 u in 0,5 s) één doorlopende beweging van 17 posities / 392 ms.
- e2e `table.spec` "the table preview tweens to the cursor hour while a finger drags the scrubber (U62)":
  vinger blijft liggen, 0 native smooth-aanroepen, > 4 posities, rij staat op zijn plek.
- Gate (web/): typecheck 0 · `pnpm test` 0 (482) · build 0 · `table.spec --project desktop` 0 (4 groen,
  2 mobiele overgeslagen) · `table.spec sky-window.spec --project mobile-4g` 0 (6 groen, 1 overgeslagen).
- Niet te testen op deze host: Firefox (geen Playwright-Firefox aanwezig). De PO verifieert op zijn toestel.
- Eigen beelden bekeken: `metingen/stap2-na.png` (390), `metingen/stap2-desktop.png`.

## Wachtrij (orkestrator)
1. Scrubber-SVG op po-android: paint/composite per frame, varianten compositorlaag en blokken van 6 uur.
2. Stap 4: windstreepjes mobiel (twee niveaus achter ?dev, soepel-scenario po-android).

## 11:10 — stap 2 gecommit en gepusht (e9f1d17); PR #89 bijgewerkt

## 11:40 — scrubber-SVG: opbouw van de frametijd (VOORLOPIG, niet onder de perf-lock)
`rig/paint-cost.ts`: Chrome-trace tijdens een touch-sleep over ~7 uur, 390 px, CPU 4× (CDP-throttle, NIET het
po-android-profiel met renderer-quota). ms per frame op de trace (dus inclusief de 4×-rem), 2 runs:
| variant | Layerize | Paint | PrePaint | Commit | RasterTask | RunTask totaal | frame p95 | LoAF |
| nu | 2,64 / 2,84 (max 15,7) | 0,64 / 0,67 | 0,25 / 0,27 | 0,60 | 0,05 | 10,1 / 10,9 | 17 ms | 0 |
| `.scrub-surface { contain: paint }` | 1,18 / 1,14 (max 7,3) | 0,76 / 0,69 | 0,34 / 0,28 | 0,70 / 0,66 | 0,06 | 10,4 / 9,4 | 17 ms | 0 |
- De baan (`.chart-track`) heeft al `will-change: transform` (styles.css): een venster-stap ís al een
  transform op een eigen laag. Variant (a) is dus voor de helft de huidige toestand; wat rest is `contain: paint`.
- Paint (0,65 ms) en raster (0,05 ms) zijn klein; Layerize is de grootste renderpost en halveert met
  `contain: paint`. Frame-p95 en LoAF veranderen niet. De `frame max 33 ms` uit stap 1 is één gemist
  60 Hz-frame onder 4×-rem, geen paint-tijd.
- Variant (b) (baan in blokken van 6 uur) zou Paint/raster verkleinen, de posten die al verwaarloosbaar
  zijn; niet gebouwd.
- Beeld (`rig/contain-diff.ts`): desktop gelijk aan de ruis; 390 px 590 van 2,09 M bytes anders (grootste
  kanaalverschil 33), verspreid over de onderste ~46 px van het plot (randen van de regenbalken:
  anti-aliasing door andere laagindeling). Niet met het oog te zien, wel niet-nul.
- NIET overgenomen. Reden: gemeten zonder de perf-lock (regel kwam daarna) bij loadavg tot 33, en niet op
  po-android. Opnieuw meten onder de lock is de voorwaarde:
  `flock -w 7200 /home/mathijs/motregen-perf.lock pnpm exec tsx tmp/u62/paint-cost.ts http://127.0.0.1:4320 <label> '<css>'`
  (rigs staan in `rig/`; kopieer ze naar `web/tmp/u62/` — ze importeren uit web/node_modules).

## 11:45 — perf-lock (orkestrator)
Alle perf-metingen op deze host voortaan onder `flock -w 7200 /home/mathijs/motregen-perf.lock <commando>`;
e2e en builds niet. Het lockbestand bestond nog niet toen ik hem probeerde (`flock -w 5 … true` → 0, en
maakte hem daarmee aan). De metingen van stap 1 (`step-cost`), stap 2 (`table-follow`) en hierboven
(`paint-cost`) zijn vóór deze regel en zonder lock genomen; de tellingen (herbouwde streken, aantal
posities) zijn load-ongevoelig, de ms-waarden niet.

## Open
- MET PO: stap 2 op Firefox Android verifiëren; stap 3 beoordelen (o.a. donkere koppenrij 's nachts,
  klokpil wit of mee-tinten).
- VOOR AGENT: `contain: paint` opnieuw meten onder de lock op po-android en dan pas beslissen; stap 4
  windstreepjes mobiel (soepel-scenario po-android, ook onder de lock).

## 12:10 — orkestrator: laagvarianten onder de lock herhalen, daarna stap 4
Runner `rig/run-perf.sh` (vanuit web/, rigs in web/tmp/u62/): wacht eerst op loadavg < 8 en neemt dán
`flock -w 7200 /home/mathijs/motregen-perf.lock` per run (wachten mét de lock zou andere tracks blokkeren).
`paint-cost.ts` draait nu op het po-android-profiel (renderer-cgroup 40 % via `--renderer-cmd-prefix=
systemd-run --user --scope -p CPUQuota=40%`, viewport/UA van het profiel).
Leerpunt: `pkill -f <naam>` in een opdracht die die naam ook elders bevat doodt de eigen shell (2×).

## 12:40 — main gemerged (U57 pad-URI's, 65181e6), geen conflicten
- Adressen in mijn rigs: `/?lat=52.1&lon=3.7` (sky-window.spec) werkt nog; de app normaliseert naar
  `/weer/<plaats>`; `?dev` blijft `?dev=`. Een tijd in het adres (`#t=` of het oude `?t=`) opent sinds U57
  de dataversheid-dialoog: `rig/chrome.ts` (gebruikt `?t=`) moet bij hergebruik eerst Escape sturen, zoals
  `rig/wind-shots.ts` nu doet (`rig/dialog-probe.ts` legt het vast).
- Preview herstart (nieuwe vite-config): `/`, `/weer`, `/wind/amsterdam`, `/?dev` → 200.

## 12:50 — stap 4: windstreepjes mobiel (cfc85c3)
- Oorzaken in de code bevestigd: lijn op smal scherm 0,6 × 2,5 = 1,5 px; achtergrondsterkte 0,5 in Weer;
  koppen boven water een derde zachter (U34).
- `?dev` → Mobiel → Windstreepjes: uit (zoals nu) / iets (sterkte ×1,25, lijnfactor 0,72, zee-demping
  0,2) / meer (×1,5, 0,84, 0,08). Alleen bij `(pointer: coarse)` of breedte < 500 px; de versterking
  geldt voor de achtergrondwind en loopt terug naar 1 bij volle windfocus. Aantal streepjes ongewijzigd.
  `seaPenalty` en `narrowLineFactor` zijn windparameters geworden (waren constanten).
- Niet gedaan: lichtere streepjes of een donker randje boven water (shaderwerk); de zee-demping
  verlagen pakt hetzelfde punt aan met de bestaande middelen. Als "meer" boven zee nog te zwak is, is
  dat het vervolg.
- Eigen beelden bekeken: `stap4/wind-390-{uit,iets,meer}.png` (zichtbaar oplopend, vooral boven zee),
  desktop ongewijzigd (`data-wind-intensity` 0,50 in alle drie).
- Gate (web/, op de gemergde boom): typecheck 0 · `pnpm test` 0 (487) · build 0 · desktop `cloud-section
  sky-window table dev-panel freshness presets`: 18 groen / 1 rood (dev-panel: het filter `hasText: 'Wind'`
  ving ook de nieuwe groep Mobiel) → locator op de groepstitel → `dev-panel.spec` 0 (2 groen, incl. de
  nieuwe telefoontest) · mobile-4g `cloud-section sky-window table` 0 (7 groen, 1 overgeslagen).

## 14:10 — laagvarianten scrubber onder de perf-lock (po-android, 3 ronden door elkaar): NIETS overgenomen
`rig/run-perf.sh` → `rig/paint-cost.ts`, touch-sleep ~7 uur op 390 px, renderer-cgroup 40 %. ms per frame,
drie ronden en mediaan. Ronde 1 op de build van vóór de merge met main, ronde 2–3 erna (U57 raakt de
scrubber niet).
| variant | Layerize (r1/r2/r3 → med) | Paint | PrePaint | Commit | Raster | RunTask totaal (med) | frame p95 | LoAF |
| nu | 2,06 / 2,02 / 1,78 → 2,02 | 0,39 | 0,15 | 0,54 | 0,18 | 14,7 / 11,6 / 10,6 → 11,6 | 33 / 17 / 17 | 2 / 3 / 3 |
| `.scrub-surface { contain: paint }` | 0,76 / 0,84 / 0,79 → 0,79 | 0,55 | 0,22 | 0,72 | 0,23 | 15,0 / 13,3 / 12,8 → 13,3 | 33 / 17 / 17 | 3 / 5 / 3 |
| `.chart-track { will-change: auto }` | 2,26 / 1,94 / 2,22 → 2,22 | 0,54 | 0,21 | 0,72 | 0,20 | 17,1 / 10,6 / 14,5 → 14,5 | 33 / 17 / 33 | 6 / 1 / 0 |
- `contain: paint` verlaagt Layerize met 61 % (−1,2 ms/frame), herhaalbaar; Paint, PrePaint en Commit
  stijgen samen +0,4 ms. Op frameniveau is er niets te zien: p95 gelijk, lange frames niet minder, totaal
  hoofddraadwerk niet lager. Plus een (onzichtbaar maar niet-nul) pixelverschil op 390 px.
  Besluit volgens de opdracht "winnaar alleen als hij meetbaar beter is": niet overgenomen.
- `will-change` weghalen maakt niets beter; de bestaande laag blijft.
- Blokken van 6 uur niet gebouwd: wat ze kunnen besparen is Paint + raster ≈ 0,57 ms van 11,6 ms per frame.
- Kanttekening bij de betrouwbaarheid: elke run startte onder loadavg 8, maar de host liep tijdens de
  meeste runs op tot 8–17 (andere tracks). De Layerize-verhouding is daar ongevoelig voor; p95, LoAF en
  RunTask-totaal zijn dat niet (de contain-runs troffen telkens de hogere load).

## 14:20 — stap 4: frametijd wind uit vs meer (po-android, onder de lock)
`rig/wind-frames.ts`: 25 s laten laden, daarna 20 s afspelen in Weer; eigen rig in plaats van het
soepel-scenario van `perf:mobile`, omdat een extra scenario in `perf/scenarios.json` het contract van de
bestaande baselines verandert. Drie geldige runs per niveau (vier runs vielen af op de eigen load-check ≥ 8).
| niveau | frames | gemiddeld | p50 | p95 | max | frames > 34 ms | LoAF |
| uit | 1192 / 1187 / 1193 | 16,8 / 16,9 / 16,8 | 16,7 | 16,8 / 16,7 / 16,8 | 67 / 117 / 50 | 3 / 3 / 2 | 0 / 3 / 0 |
| meer | 1197 / 1190 / 1188 | 16,7 / 16,8 / 16,8 | 16,7 | 16,7 / 16,8 / 16,8 | 50 / 67 / 50 | 1 / 1 / 4 | 0 / 0 / 0 |
Geen stijging. Grens van de meting: de rig tekent met SwiftShader, geen telefoon-GPU; bredere lijnen
kosten vulwerk op de GPU dat hier niet zichtbaar wordt. De PO-telefoon is de echte toets.

## Open
- MET PO: stap 2 op Firefox Android; stap 3 (donkere koppenrij 's nachts, klokpil wit/mee-tinten);
  stap 4 niveau kiezen op de telefoon (`?dev` → Mobiel → Windstreepjes) en letten op haperen.
- VOOR AGENT: na de PO-keuzes de dev-knoppen Klokpil en Windstreepjes vastzetten of weghalen
  (docs/dev-opties.md); eventueel donker randje boven zee als "meer" niet volstaat.

## 15:30 — stap 3b (PO: "1 is top", één wijziging): koppenrij volgt de TABELSCROLL
- `ForecastTable.tsx`: de koppenrij neemt de hemel van de bovenste zichtbare rij aan. Een
  IntersectionObserver (wortel: de tabelscroller, of het scherm als de pagina scrolt; bovenrand min de
  kophoogte uit één ResizeObserver op de kop) meldt per rij het zichtbare deel; de bovenste is de vroegste
  rij die voor minstens de helft onder de kop uitsteekt. Geen layout-reads per frame. De hemel per rij komt
  uit de memo's die de rij al had (`daylight`, `dayDarkness`). Kleurwissel: de bestaande 0,3 s-transitie.
- De prop `headSky` (cursoruur) is weg; `chromeSky` in App voedt alleen nog de klokpil-variant. De
  liniaal blijft aan de scrubbertijd.
- Eigen beelden bekeken: `stap3b/kop-{390,desktop}-{nacht,dag}.png` (`rig/head-scroll.ts`): bovenste rij
  07:00 nacht → donkere kop; 11:00 dag → dagtint; op 390 px in de open tabel en op desktop.
  Rig-les: `thead tr` scrolt mee, alleen de `th`-cellen zijn sticky — de plek van de kop is die van een cel.
- Unit: `ForecastTable.test` "colours the heading row with the sky of the top visible row" (gestubde
  observers). e2e: `table.spec` "the heading row takes the sky of the top visible table row while scrolling".
- Gate (web/): typecheck 0 · `pnpm test` 0 (488) · build 0 · desktop `table dev-panel cloud-section
  sky-window`: 8 groen / 1 rood (mijn nieuwe test: de nu-rij-pin van desktop zette de scroll terug) → wieltik
  in de test → `table.spec --project desktop` 0 (5 groen, 2 overgeslagen) · mobile-4g `table sky-window` 0
  (6 groen, 2 overgeslagen).
- De ?dev-varianten Klokpil en Windstreepjes blijven staan tot de PO kiest.

## 15:35 — stap 3b gecommit en gepusht (bdf5321)

## 16:00 — PO-besluit: Kaderhemel vast aan, dev-knop weg (MIP-12)
- `HistogramScrubber.tsx`: de prop `frameSky` is weg; de hemel staat er altijd vóór de wolkenlagen, op
  `FRAME_SKY_ASSUMED_COVER` (constante met herkomstregel). `DevPanel`/`App`: knop, signaal en sleutel
  `motregen-dev-kaderhemel` verwijderd. Er was geen migratiecode voor die sleutel; een achtergebleven
  waarde wordt nergens meer gelezen en "Reset alle instellingen" wist hem (staat zo in docs/dev-opties.md).
  "Eerste regen" blijft staan (U63).
- Bijvangst: "Reset alle instellingen" zette de nieuwe knoppen Klokpil en Windstreepjes niet terug in de
  lopende pagina (wel in de opslag); dat doet hij nu.
- Eigen beelden bekeken: `stap3b/kaderhemel-{390,desktop}.png` (`rig/frame-sky-shot.ts`: chunks 8 s
  vertraagd) — kader met hemel en liniaal, melding "regen laden…", nog geen balken.
- Gate (web/): typecheck 0 · `pnpm test` 0 (488; scrubbertest aangepast: hemel staat er vóór de
  wolkenlagen en verandert als ze komen) · build 0 · desktop `table dev-panel cloud-section sky-window` 0
  (9 groen, 2 overgeslagen) · mobile-4g `cloud-section sky-window` 0 (2 groen).
- Niet gemeten: het effect van de altijd-aan-hemel op ttfp/laadtijd (dat was de vraag van de knop in
  U54; de PO heeft op het oog gekozen). Als U63 laadmetingen doet, is dit een gewijzigde uitgangssituatie.

## 16:05 — Kaderhemel vast aan gecommit en gepusht (d6b7eb8)

## 17:10 — experiment (PO-wens): de kaart tweent van dag naar nacht met de kaarttijd — achter ?dev, niets standaard
- `?dev` → Chrome → Kaart → "automatisch (volgt de kaarttijd)". Gebouwd als dev-knop in plaats van als derde
  stand in de themakiezer van Over: het app-thema (chrome, rijen) blijft wat het is; alleen de basiskaart
  volgt de zon. Promotie tot themastand is een PO-besluit.
- Goedkope route, zoals gevraagd: de lichte en de donkere stijl hebben dezelfde 14 lagen en maar 19
  verschillende paint-waarden (18 kleuren, 1 zoom-verloop tegenover één kleur). `core/basemap-blend.ts`
  mengt die in lineair licht; App zet ze met `setPaintProperty` op de ene geladen stijl, in 20 stappen
  (`MAP_NIGHT_STEPS`), MapLibre tweent elke stap zelf (300 ms). Aandeel nacht = dezelfde schemering als de
  hemel in de scrubber (`nightShare(sinElevation)` van de cursorminuut op de gekozen plek). De rand buiten
  het rooster mengt mee; de wind wisselt bij 0,5 van thema (anders vallen de streepjes weg).
- Labels: tekst en halo wisselen samen bij 0,5 van paar in plaats van te mengen — gemengd naderen ze
  elkaar rond de schemering. Unit-test: elk label ≥ 4,5:1 tegen zijn halo op alle 21 standen.
  Niet gemeten: label tegen de gemengde ondergrond achter de halo (de halo is 1 px).
- Eigen beelden bekeken (`kaart-experiment/`, `rig/map-night-shots.ts`), 390 px en desktop:
  18:00 nacht 0,00 · 19:00 0,55–0,60 · 19:20 0,90 · 20:00 / 23:00 / 06:00 1,00 · 07:40 0,85.
  Afwijking van de gevraagde tijden: in oktober gaat de zon om 19:01 onder, dus 20:00 is al volle nacht en
  21:00 is geen schemer; de schemerbeelden zijn 19:00, 19:20 en 07:40.
- Wat ik zie en de PO moet weten:
  1. De schemerstanden zijn een neutraal grijs (warm lichtbeige × donker blauwgroen gemengd), geen
     "avondkleur". Mooier kan met een eigen schemerpalet als derde anker; dat is niet de goedkope route.
  2. Wat het app-thema volgt en dus niet meetweent: temperatuurlabels op de kaart (donkere cijfers met
     witte halo, ook op de nachtkaart), isolijnen, de klokpil/knoppen en de attributie.
  3. Met donker app-thema overdag wordt de kaart licht in een donkere app (omgekeerd geval van 2).
- Gate (web/): typecheck 0 · `pnpm test` 0 (73 bestanden, 494 tests) · build 0 · desktop `dev-panel
  cloud-section sky-window` 0 (8 groen; `basemap.spec` hoort bij een andere Playwright-config en draaide
  hier niet mee).
- Kostenmeting (po-android, onder de lock): `rig/run-map-night.sh` staat klaar en wacht op loadavg < 7
  (host op 19–37 door andere tracks). Resultaat volgt in de volgende entry.

## 18:20 — orkestrator: `freshness.spec:108` rood op mobile-4g — NIET van U62, test gerepareerd
- Los gedraaid: `MOTREGEN_E2E_PORT=4196 MOTREGEN_E2E_DATA_PORT=8196 pnpm e2e e2e/freshness.spec.ts --project
  mobile-4g` → 1 (test 108 time-out: `locator.tap` op "Zoek plaats", `.freshness-clock` vangt de tik af).
- Dezelfde test op onaangeroerde main (8853c0d, tijdelijke worktree): ook 1, zelfde afvangende dialoog. De
  oorzaak is U57: zolang het versheidspaneel open is staat de tijd in het adres, en een adres met een
  tijd opent het paneel. De test drukt Escape en herlaadt direct (alleen in het touch-blok, daarom is
  desktop groen); het paneel was nog niet dicht, dus na de herlaad stond het er weer.
- Fix in de test (geen productwijziging): `await expect(dialog).toBeHidden()` vóór de herlaad, met reden
  erbij. Daarna `freshness.spec --project mobile-4g` → 0 (4 groen) en `--project desktop` → zie commit.
- Productvraag voor de PO/orkestrator (niet aangepast): wie het paneel sluit en binnen de sluitanimatie
  herlaadt, krijgt het paneel terug. Klein, maar het is gedrag van U57.

## 19:30 — deel 1 op main (8d75754f); branch bijgetrokken naar main (43b92d6, fast-forward)
- typecheck 0 · `pnpm test` 0 (494) · build 0 op de bijgetrokken boom; preview 4320 herstart als losgekoppeld
  proces op de normale build (`/`, `/weer`, `/weer?dev` → 200).
- Live-pane blijft open voor de PO-keuzes: klokpil (wit/mee-tinten), windniveau (uit/iets/meer),
  kaart-tween (MIP-24).
- Nog open VOOR AGENT: kostenmeting van de kaart-tween (`rig/run-map-night.sh`, onder de perf-lock) heeft
  nog niet gedraaid: de host staat sinds de start op loadavg 10–37, de runner wacht op < 7 en schrijft
  naar `web/tmp/u62/map-night-run.log`. Zonder die cijfers is "wat het kost" voor MIP-24 onbekend.

## 2026-10-08 avond — PO-keuzes vastgezet (klokpil/zoekbalk/druppel, kaart-tween, wind "iets")
- (1) Klokpil = mee-tinten, en de zoekbalk (dichte pil én open veld met resultaten) en de merkdruppel
  doen hetzelfde: klassen `sky-day`/`sky-night` + `--day-overcast` op `.map-shell` uit `chromeSky`
  (cursoruur); de CSS zet het palet alleen op `.map-clock`, `.search` en `.map-brand`, dus dialogen
  (dataversheid, Over) houden het app-thema. Dev-knop Klokpil + sleutel `dev-klokpil` weg.
- (2) Kaart volgt de kaarttijd zolang Expressief aan staat (`mapFollowsTime = expressive && !stillMode`);
  Expressief uit → vast licht/donker zoals voorheen. Dev-knop Kaart + sleutel `dev-kaart-automatisch` weg.
  Eigen keuze, niet gevraagd: stills (Telegram, `?still=1`) houden het vaste thema en de ongetinte klok,
  anders veranderen de botbeelden 's nachts ongemerkt. Zeg het als de PO dat anders wil.
- (4) Wind mobiel: de PO koos "iets" → `MOBILE_WIND` (sterkte ×1,25, lijnfactor 0,72, zee-demping 0,2) vast
  bij `(pointer: coarse)` of breedte < 500 px; knop + sleutel `dev-wind-mobiel` weg. (Ik had eerst zelf
  dit niveau gekozen op een verkeerd doorgegeven "kies zelf"; de waarden zijn dezelfde.)
- docs/dev-opties.md bijgewerkt (drie knoppen naar "Weggesnoeid", oude sleutels genoemd bij reset).
- Eigen beelden bekeken (`po-keuzes/`, `rig/map-chrome.ts`): klok/zoek/druppel dag (13:00), schemer (19:10)
  en nacht (23:00), 390 px en desktop, licht en donker app-thema, zoekbalk dicht en open.
- Contrast gemeten (slechtste pixel achter de tekst, 12 scènes): klokpil 6,39–11,79 · zoekresultaat
  11,12–11,86 · detailtekst in de resultaten 4,93–6,26. Het invoerveld zelf is niet apart gemeten (de
  tekst van een `<input>` laat zich niet verbergen voor de ondergrondmeting); het gebruikt dezelfde inkt
  en ondergrond als de resultaatrijen.
- Gate (web/): typecheck 0 · `pnpm test` 0 (73 bestanden, 494 tests) · build 0 · desktop `dev-panel
  freshness location cloud-section sky-window table presets telegram` 0 (32 groen, 2 overgeslagen) en na de
  windwijziging `dev-panel focus` 0 (10 groen, 2 overgeslagen) · mobile-4g `freshness location table
  sky-window cloud-section focus` 0 (17 groen, 11 overgeslagen).
- NOG OPEN: (2b) kostenmeting kaart-tween onder de perf-lock; (3) voorstel rand tussen kaart en zijpaneel.

## PO-keuzes gecommit en gepusht (15cf73c)

## Voorstel (3): rand tussen kaart en zijpaneel op desktop — NIETS vastgezet, wacht op PO-akkoord
`rig/border-proposal.ts` spuit de varianten als CSS in; het product is ongewijzigd. Beelden in
`voorstel-rand/` (1280 px; per beeld links nu, midden A, rechts B, gescheiden door een magenta streep):
`rand-dag-overzicht.png`, `rand-dag-naad.png` (3× vergroot), `rand-nacht-overzicht.png`, `rand-nacht-naad.png`.
De tabel is naar rijen van dezelfde toon als de kaart gescrold, want daar ontbreekt de rand: lichte kaart
naast dagrijen, nachtkaart naast nachtrijen. Waar de tonen verschillen is de naad al scherp.
- A — lijn van 1 px in de hemelkleur van het cursoruur: overdag `rgba(16,38,48,.2)`, 's nachts
  `rgba(237,248,252,.22)`, als `box-shadow: -1px 0 0` op `.dashboard` (geen layoutverschuiving).
- B — zachte schaduw de kaart in: overdag `-16px 0 30px -18px rgba(6,20,28,.5)`; 's nachts zwaarder
  plus een haarlijntje, omdat een schaduw op een donkere kaart anders niet te zien is.
- Wat ik zie: overdag doen beide hun werk; A leest als een rustige scheidslijn in de taal van de
  rijlijnen, B tilt het paneel op en maakt de kaartrand grijzer. 's Nachts is B bijna onzichtbaar en leunt
  hij toch op een lijn. Mijn voorkeur: A. Bijvangst: 's nachts staat er nu al een lichte verticale lijn op
  de naad (de linkerrand van de nachtrijen); A maakt dat over de volle hoogte en overdag consequent.

## Voorstel rand gecommit (fcc55d1)

## Lock-discipline (orkestrator)
Mijn runners (`rig/run-perf.sh`, `rig/run-map-night.sh`) wachten buiten de `flock` op de load en nemen de
lock per run. Eén uitzondering gevonden en verholpen: `rig/paint-cost.ts` wachtte intern tot 2 min op een
rustige host, dus mét de lock; het breekt nu direct af als de load ≥ 8 is.

## Stap 3c (PO-bijsturing): koppenrij wisselt op de zon-rij, niet per rij
- De kop is dag of nacht en wisselt wanneer de "Zon op/onder"-rij de bovenste zichtbare rij wordt;
  daartussen is hij constant. Twee wijzigingen in `ForecastTable.tsx`:
  1. bovenste rij = de vroegste uurrij waarvan nog iets onder de kop uitsteekt (was: voor minstens de
     helft). De zon-rij staat tussen twee uurrijen, dus "de uurrij erboven is helemaal weg" is precies
     "de zon-rij is de bovenste". Daardoor hoeven de zon-rijen zelf niet geobserveerd te worden; dezelfde
     IntersectionObserver, nu met alleen drempel 0.
  2. de bewolking van de rij kleurt de kop niet meer (`overcast: 0`): overdag één vaste hemeltint.
     Eigen keuze: de heldere tint als vaste dagkleur; op een grijze dag is de kop dus blauwer dan de
     rijen eronder. Alternatief is één vaste grijzere tint — PO-oordeel.
- Eigen beelden bekeken (`stap3c/`, `rig/head-transition.ts`), 390 px en desktop: `voor` = nog 6 px van de
  laatste nachtrij boven "Zon op 07:53" → kop nacht; `na` = de zon-rij bovenaan → kop dag.
  Rig-les: de laatste zonsopkomstrij staat te dicht bij het einde van de tabel om onder de kop te scrollen;
  de rig neemt de eerste na de nu-rij.
- Gate (web/): typecheck 0 · unit 0 (494; gedraaid als `pnpm synthgen && pnpm exec vitest run --exclude
  'tmp/**'`, omdat er voor de kostenmeting een tweede worktree in web/tmp staat die vitest anders meeneemt) ·
  build 0 · desktop `table dev-panel` 0 (7 groen, 2 overgeslagen) · mobile-4g `table` 0 (5 groen, 2 overgeslagen).

## Stap 3c gecommit (5fcb152); main gemerged (U65)

## Tijdelijke ?dev-schakelaar voor de rand (orkestrator, na twee keer heen en weer: hij komt er)
- `?dev` → Chrome → "Rand kaart/zijpaneel": geen / A: lijn / B: schaduw (`motregen-dev-rand`; eigenaar U62,
  vervalt na PO-keuze; docs/dev-opties.md bijgewerkt). Alleen desktop (≥ 960 px).
- Voor devtools: klasse op `main.app-shell` — `edge-line` (A) of `edge-shadow` (B); het effect is een
  `box-shadow` op `.dashboard`. De waarden zijn variabelen op `.app-shell`:
  `--edge-line-color` (dag `rgba(16,38,48,.14)`, nacht `rgba(237,248,252,.16)`) en `--edge-shadow`
  (dag `-18px 0 34px -20px rgba(6,20,28,.38)`, nacht `-20px 0 36px -18px rgba(0,0,0,.6)`); "nacht" =
  `.app-shell:has(.map-shell.sky-night)`. B is zachter gemaakt dan in de eerste beelden en heeft 's nachts
  geen haarlijn meer (PO: "schaduw is clean, borders te hard"); A is ook lichter (.2 → .14).
- Gevonden: `.dashboard` hééft op desktop al een schaduw (`-8px 0 24px rgba(21,51,63,.07)`), maar die
  valt achter de kaart weg omdat het paneel geen eigen stapelvolgorde heeft. De varianten geven het
  paneel `position: relative; z-index: 2`. Een derde optie is dus: alleen de bestaande schaduw zichtbaar
  maken (en eventueel iets aanzetten).
- Voor een zachtere versie van de bestaande lijnen: rijlijnen = `td { border-bottom: 1px solid var(--line) }`
  (in dag/nacht-rijen `color-mix(#fff 38%/16%, var(--line))`), de lijn onder de koppenrij =
  `th { box-shadow: inset 0 -1px 0 var(--line-strong) }`, de rand om het plot = `.chart-plot::after`.
- Eigen beeld bekeken: `voorstel-rand/rand-live.png` (geen | A | B, desktop, uit de live build).
- Gate (web/, gemergde boom): typecheck 0 · unit 0 (75 bestanden, 506 tests) · build 0 · desktop
  `dev-panel location`: 8 groen / 1 rood (`location.spec:88` time-out op de optie "Werk" bij loadavg 31)
  → die test alleen herdraaid: 0 (8,9 s). Als load-flake genoteerd, niet verder onderzocht.

## Rand-schakelaar gecorrigeerd (PO: "de lijn verandert nooit per setting")
- De orkestrator had gelijk en mijn vorige entry was op één punt FOUT: `.dashboard` heeft op desktop
  `border-left: 1px solid var(--line)` + `box-shadow: -8px 0 24px rgba(21,51,63,.07)` + `z-index: 2`, en
  als grid-item werkt die z-index wél — de bestaande schaduw viel dus niet "achter de kaart weg". Mijn
  schakelaar verving alleen de box-shadow en liet de border in alle standen staan; "geen" was niet geen.
- Nu vier standen (`motregen-dev-rand`: `oud`/`geen`/`a`/`b`, standaard `oud` = product ongewijzigd):
  oud = border + lichte schaduw zoals het was; geen (`.edge-none`) = `border-left: none; box-shadow: none`;
  A (`.edge-line`) = alleen `box-shadow: -1px 0 0 var(--edge-line-color)`; B (`.edge-shadow`) = alleen
  `box-shadow: var(--edge-shadow)`. De hint in het ?dev-paneel beschrijft "oud".
- Gecontroleerd in de live build (`rig/edge-live.ts`, `voorstel-rand/rand-live.png`: oud | geen | A | B):
  rand 1px / 0px / 0px / 0px en per stand een andere box-shadow. `dev-panel.spec` controleert border en
  schaduw per stand → 0 (2 groen). typecheck 0, build 0; unit niet opnieuw gedraaid (alleen CSS, de knop
  en de spec gewijzigd).

## Rand-schakelaar gecorrigeerd en gepusht (0abc5e7)

## Eén lijnensysteem voor dag en nacht (PO: "rijdividers 's nachts harder dan overdag; maak alles consistent")
### Meting vooraf (`rig/line-contrast.mjs`, WCAG-ratio lijn tegen vlak, berekend uit de CSS-waarden)
| ondergrond | --line | --line-strong | rijlijn zoals getekend |
| dag, wit vlak (#d5e1e5 / #b7cbd2 op #fff) | 1,33 | 1,68 | 1,19 |
| dag, hemelrij helder | 1,00 | 1,27 | 1,12 |
| dag, hemelrij bewolkt | 1,07 | 1,18 | 1,20 |
| nacht, nachtrij (#25404b / #3b5a66 op #0a1820) | 1,64 | 2,44 | 2,66 |
| donker thema, vlak | 1,57 | 2,33 | 4,71 |
Gemeten uit de pixels van de oude build (`rig/lines.ts`, 4321): rijlijn dag 1,10–1,14, nacht 4,96.
De rijlijn was een menging met wit (`color-mix(#fff 38 %/16 %, var(--line))`): overdag bijna de kleur van
het vlak, 's nachts een lichte streep.
### Keuze
Lijn = de tekstkleur met een beetje dekking. Eén α geeft GEEN gelijk contrast (α 0,14 → 1,30–1,32 overdag,
1,48 's nachts): dezelfde dekking oogt op donker harder. Daarom per ondergrond een eigen dekking, gekozen
op gelijk contrast: lijn ~1,3, sterke lijn ~1,6.
- `--line-on-light: rgba(16,38,48,.14)` · `--line-strong-on-light: rgba(16,38,48,.24)`
- `--line-on-dark: rgba(237,248,252,.10)` · `--line-strong-on-dark: rgba(237,248,252,.16)`
- `--line` / `--line-strong` verwijzen daarnaar, overal waar `--text` wisselt (licht/donker thema, nachtrijen,
  dagrijen in donker thema, koppenrij, klokpil/zoekbalk/druppel). Geen losse lijnkleuren meer in die regels.
### Toegepast op
- rijlijnen: de twee wit-mengregels zijn weg; `td { border-bottom: 1px solid var(--line) }` geldt overal;
- lijn onder de koppenrij (`th` inset shadow) en grafiekrand (`.chart-plot::after`): gebruikten al
  `--line-strong`, gaan dus vanzelf mee; de bovenrand van het plot op de hemel is nu `var(--line)`;
- zon-op/onder-rij: de eigen randen zijn WEG (`border-block: 0`). Een rand op die cel werd over het witte
  tabelvlak getekend in plaats van over de kleurstrook en gaf daardoor altijd een harde lichte streep
  (pixels: 255,239,225 oud; ook met het nieuwe token nog 252,254,255). De kleurstrook is zelf de scheiding;
- kaart/paneel-rand stand A: `--edge-line-color` = `var(--line-on-light)` / `var(--line-on-dark)`;
- klokstrip (bronstrook in het versheidspaneel): de scheiding daar is een uitsparing in de vlakkleur
  (`box-shadow: -1px 0 0 var(--surface)`), geen lijn; niet aangepast.
- Bereik: `--line`/`--line-strong` worden op 51 plekken gebruikt (randen, hulplijnen, schuifbalk); die
  krijgen allemaal de nieuwe waarden. Bekeken heb ik de tabel, de koppenrij, de scrubber en de kaartpillen;
  dialogen (Over, dataversheid) en het dev-paneel niet apart.
### Meting achteraf (pixels uit de nieuwe build, 390 px en 1280 px, licht en donker app-thema)
rijlijn dag 1,30–1,32 · rijlijn nacht 1,31 · lijn onder de koppenrij 1,59 (was 1,28).
De zon-rij is met deze methode niet te meten (twee verschillende vlakken raken elkaar); pixelcontrole: de
kleurstrook gaat nu zonder tussenlijn over in de nachtrij (214,64,101 → 54,29,53).
- Beelden (zelf bekeken): `lijnen/oud-*.png` en `lijnen/nieuw-*.png` — dezelfde rijen rond zonsondergang
  (dagrijen boven, nachtrijen onder), 390 px en 1280 px, licht en donker.
- Gate (web/): typecheck 0 · unit 0 (75 bestanden, 506 tests, vitest met `--exclude 'tmp/**'`) · build 0 ·
  desktop `table dev-panel cloud-section freshness` 0 (12 groen, 2 overgeslagen) · mobile-4g `table` 0.
- De rand-schakelaar staat er nog (wacht op de PO-keuze).
