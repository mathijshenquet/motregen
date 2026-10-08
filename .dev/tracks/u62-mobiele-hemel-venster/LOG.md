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
