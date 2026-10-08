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
