# U54 laadchoreografie — LOG (append-only)

## 2026-10-07 19:05 — stap 0/1: meetpunten en referentie-rig gebouwd, nog geen geldige meting

Doel: `ttfp` (main) en `ttfp-ref` (Buienradar) meten vóór er iets verandert; daarna profiel
`po-android` en de autonome lus (spec-aanvulling 18:50).

Gebouwd (geen waarneembare verandering in de app, alleen meten):
- `web/src/core/perf.ts`: `firstRainMs`, `basemapReadyMs`, `ttfrMs` (= beide binnen), `ttfhMs`
  (= `window-ready:rain_rate`), `ttfpMs` (eerste wissel van het linker regenframe tijdens
  afspelen), `blankVisibleMs`; elk als `milestone:*`/`blank-visible` in de trace en in de HUD.
- `web/src/core/screen-truth.ts` + unit: slot = geladen / fog / leeg. Main tekent geen fog, dus
  elk zichtbaar regenslot zonder waarde telt als leeg. Alleen scrubber-regenslots; tabelrijen
  volgen na U58.
- `web/src/App.tsx`: drie haakjes (render → basemap klaar, rain-commit met frame + playing,
  effect voor lege slots). Bewust klein gehouden wegens U58.
- Rig: scenario `koud-spelend` (geen `?t`, dus de app speelt vanzelf — `koud` staat stil door
  de preset en kan geen ttfp meten); rapport met ttfp/ttfr/ttfh/blank-visible/LoAF eerste 12 s.
- `pnpm perf:mobile --scenario referentie-buienradar --repeat 3`: eigen Playwright-config
  (`playwright.reference.config.ts`), echte netwerk, zelfde Pixel 5-emulatie en CDP-profiel.
  Detectie: wissel van `img.leaflet-image-layer` (radar-png's, 1 beeld/s) + tijdlabel als
  tweede getuige; toestemmingsmuur wordt direct weggeklikt (gunstig voor Buienradar).
- `web/scripts/rig-host.ts`: loadavg-drempel 8 (wachten vóór de run, loadavg per run in het
  rapport, drukke runs buiten de mediaan) en een eigen vast poortpaar per worktree
  (4400–4899 / 8400–8899) i.p.v. de gedeelde 4392/8392.

Let op, semantiek: `ttfrMs` wacht nu ook op de basemap-tiles (MIP-19 §Meetkant). In de rig
kwamen de tiles vóór de regen, dus daar verandert het getal niet; `perf.spec`-budgetten nog
niet opnieuw bekeken.

Voorlopige getallen — NIET geldig als meting (host op loadavg 13–18, drie tracks draaiden rigs):
- Buienradar mobile-4g, koud ×3: ttfp-ref 3653 / 3495 / 3501 ms, eerste radarbeeld ≈ 2,5 s.
  De radar loopt al terwijl de toestemmingsmuur er nog staat.
- motregen main mobile-4g `koud-spelend`: run 1 time-out (poortbotsing/load), run 2 ttfp 2900 ms,
  run 3 ttfp 4514 ms met onvolledige responses. Spreiding te groot om iets te concluderen.
- PO-opname 16:27:59 (Android Chrome, koud): decode p50 22 ms (221 decodes, 5,5 s),
  basemap-tile p50 721 ms, 22 lange frames / 4,26 s in de eerste 12 s, `window-ready:rain_rate`
  4026 ms.

Receipts: `pnpm typecheck` exit 0; `pnpm test` exit 0 (69 bestanden, 456 tests; buiten de
sandbox, na `pnpm synthgen`).

Volgende stap: meten op een rustige host (loadavg ≤ 8) ×3, mediaan; dan `po-android`.

## 2026-10-07 19:45 — eerste geldige vóór-meting (mobile-4g, CPU 4×), referentie, oorzaak gevonden

Host rustig (loadavg 5,9–7,5; drempel 8, één referentierun op 8,71 weggegooid). Rig-commit
621576e, eigen poorten 4455/8455.

| maat (mobile-4g, koud, ×3) | run 1 | run 2 | run 3 | mediaan |
| --- | ---: | ---: | ---: | ---: |
| **ttfp** main, `koud-spelend` | 2558 | 4342 | 4446 | **4342 ms** |
| ttfr (regen én tiles) | 1600 | 1620 | 1588 | 1600 ms |
| eerste regenframe / basemap-tiles | 1600 / 1406 | 1620 / 1318 | 1588 / 1310 | |
| ttfh (regen nu ± 1 u) | 2887 | 25532 | 29487 | 25532 ms |
| blank-visible-ms | 3977 | 22215 | 26015 | 22215 ms |
| LoAF eerste 12 s (totaal / blocking) | 2672 / 965 | 10239 / 9094 | 10686 / 9525 | 10239 ms |
| decodes in 30 s | 356 | 341 | 276 | |
| wire (bodybytes) | 1675565 | 1675565 | 1675382 | |
| **ttfp-ref** Buienradar | 3728 | 3586 | (load 8,71) | **≈ 3,6–3,7 s** |

Buienradar: eerste radarbeeld ≈ 2,9 s, daarna 1 beeld/s; de animatie loopt ook onder de
toestemmingsmuur door. Stand: main 4,3 s tegen 3,7 s — de lat is niet gehaald.

De koude start is **bimodaal**: run 1 is de snelle tak (puntreeks `direct` op 2,7 s), run 2/3 de
trage (`direct` pas op 25 s, lange frames groeien van 0,5 naar 1,4 s). Oorzaak in de trage tak
(source-mapped self-profile run 2, 1162 samples): 64 % van de hoofddraad zit onder
`frame-batcher.ts` ← het wolkenreeks-effect in `App.tsx`. Dat effect leest `selectedEpoch()` en
draait dus tijdens afspelen elk beeld opnieuw: nieuwe leesopdrachten per laag en per chunk plus
een eigen rAF-publisher per run, die elk `setCloudValues` doen en de wolkensectie van de
scrubber opnieuw laten opbouwen. Dat verhongert de puntreeks. De PO-opname 16:27:59 toont
hetzelfde beeld: van 2,2 tot 7,2 s lange frames van ≈ 250 ms met elk een rij rAF-callbacks van
≈ 12 ms, en de kaart wisselt pas vanaf ≈ 7,5 s op afspeelcadans van frame.

Nevenvondst (speelregel, dus PO-stap, niet aangeraakt): `setMapReady(true)` start het
afspeel-effect synchroon vóórdat `initialPickStarted` op true staat. Afspelen begint daardoor
al tijdens laadfase `initial`, terwijl de poort dat juist wil tegenhouden; welke tak je krijgt
is een race.

PO-referentie vastgelegd: `web/perf/po-android-reference.json` (uit opname 16:27:59 via
`tsx scripts/po-reference.ts summarize`): eerste decode 1024 ms, eerste texture-upload 1151 ms,
ttfh 4026 ms, uploads op afspeelcadans vanaf 7481 ms, decode p50 22 ms, basemap-tile p50 721 ms,
22 lange frames / 4261 ms (blocking 2967 ms) in 12 s.

Profiel `po-android` staat als eerste aanzet in `e2e/profiles.ts` (390 px, UA Android 10 K,
CPU 4×, 30 Mbps/20 ms); nog NIET gekalibreerd. Grootste gat: decodes kosten in de rig 0,3 ms
(synthraster 190×230, workers ongeremd) tegen 22 ms op de telefoon.

Iteratie 1 (in meting, nog niet gecommit): het wolken-effect volgt de cursor niet meer
(`untrack`) en deelt één publisher per locatie/tijdlijn. Geen waarneembare verandering beoogd.
Receipts: `pnpm typecheck` exit 0, `pnpm test` exit 0 (456 tests).

## 2026-10-07 20:40 — iteratie 1: wolkenreeks-effect volgt de cursor niet meer

Wijziging (`web/src/App.tsx`, geen waarneembare verandering): het effect dat de wolkenreeksen
leest gebruikt de cursor alleen nog voor de volgorde (`untrack(selectedEpoch)`) en deelt één
`FrameBatcher` per locatie/tijdlijn. Vóór: elk afspeelbeeld opnieuw lezen + een eigen
rAF-publisher per run.

mobile-4g, CPU 4×, `koud-spelend`. Vóór = main ×3 (loadavg 6,1–7,5). Ná = ×5, waarvan alleen
run 1 onder de drempel liep (5,47); run 2–5 begonnen op loadavg 9,4–11,4 en tellen volgens de
regel niet mee. Ze staan er wel bij: een drukke host maakt tijden trager, niet sneller.

| maat | vóór (mediaan ×3) | ná run 1 (geldig) | ná run 2–5 (loadavg > 8) | verschil |
| --- | ---: | ---: | ---: | ---: |
| ttfp | 4342 ms (2558 / 4342 / 4446) | 2934 ms | 2756 / 2572 / 2708 / 2551 | −1408 ms |
| ttfp-ref Buienradar | ≈ 3,6–3,7 s | — | — | |
| ttfh | 25532 ms | 3127 ms | 4326 / 4102 / 4244 / 4615 | −22,4 s |
| blank-visible-ms | 22215 ms | 3919 ms | 5597 / 5407 / 5516 / 6449 | −18,3 s |
| LoAF 12 s totaal / blocking | 10239 / 9094 ms | 2813 / 1119 ms | 1991–3040 / 612–1019 | −7,4 s |
| decodes in 30 s | 356 / 341 / 276 | 356 | 356 / 355 / 356 / 356 | spreiding 25 % → 0,3 % |
| wire (bodybytes) | 1675565 | 1675559 | 1675559 ×4 | −6 B |

Lezing: de trage tak is weg (5 van 5 runs snel, tegen 1 van 3). Het effect is categorisch,
geen marge: ttfh van 25 s naar 3–4,6 s. Wat nog NIET hard is: het precieze ttfp-getal na de
fix rust op één geldige run; herhaling ×3 op een rustige host volgt. Op de rig staat ttfp nu
onder ttfp-ref, maar de rig is de telefoon niet (decodes 0,3 ms tegen 22 ms) — zie kalibratie.

ttfh blijft tweeledig (3,1 s tegen 4,1–4,6 s): afspelen begint rond 2,5 s, soms vóór het
regenvenster compleet is, en remt dan het histogram. Dat is de race uit de vorige entry
(speelregel, PO-stap).

Rig: wacht nu ook vóór elke afzonderlijke run tot loadavg ≤ 8 (tot 15 min), niet alleen vóór
de eerste. Nieuwe knoppen, nog zonder kalibratie: `--worker-cpu-rate` (CDP-rem per worker via
`Target.sendMessageToTarget`, onbewezen) en `--grid-scale` (synthraster bilineair opgerekt,
schaal 3 = 570 × 690).

Receipts: `pnpm typecheck` exit 0; `pnpm test` exit 0 (456 tests, vóór de speelregel-tests);
`pnpm exec vitest run src/core/playback-gate.test.ts` exit 0 (9 tests);
`pnpm perf:mobile --scenario koud-spelend --repeat 5` exit 0.
