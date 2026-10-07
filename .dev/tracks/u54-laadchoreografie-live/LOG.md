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

## 2026-10-07 21:35 — A: profiel po-android gekalibreerd (op de code van de opname)

Knoppen: 390 × 844, UA Android 10 K, page-CPU 4×, 30 Mbps / 20 ms, synthraster ×3
(570 × 690, wire 5,5 MB). Vergeleken op main vóór iteratie 1 (fix tijdelijk teruggedraaid in de
werkboom, daarna hersteld), loadavg 6,0–6,9, `koud-spelend` ×2:

| meetpunt | PO 16:27:59 | rig run 1 (snelle tak) | rig run 2 (trage tak) |
| --- | ---: | ---: | ---: |
| eerste regenframe | 1151 ms | 1042 ms (−9 %) | 1801 ms |
| ttfh | 4026 ms | 4229 ms (+5 %) | niet binnen 30 s |
| ttfp | 4,0–4,6 s / uploads vanaf 7481 ms | 4003 ms | 7293 ms (−3 % t.o.v. 7481) |
| LoAF 12 s aantal / totaal | 22 / 4261 ms | 24 / 6249 ms | 28 / 11663 ms |
| decode p50 | 22 ms | 1,1 ms (−95 %) | 1,2 ms |

De rig reproduceert beide gezichten van de opname op dezelfde code: ttfh ≈ 4 s én de late
afspeelcadans rond 7,3–7,5 s. Decodetijd is niet te kalibreren:
- CDP-rem per worker geprobeerd (`Target.sendMessageToTarget` → `Emulation.setCPUThrottlingRate`):
  Chrome antwoordt "Operation is only supported for pages, not workers". Code weer verwijderd.
- Browser via `taskset` op 2 / 1 kernen: eerste regenframe 2506 / 7124 ms (telefoon 1151),
  decode p50 1,2 / 3,6 ms. Remt SwiftShader, niet de decoder. Code weer verwijderd.
Dus: decodes vóór een mijlpaal tellen als kostenpost (≈ 22 ms workertijd per stuk op de
telefoon), naast de klok. Volledige tabel en redenering: docs/perf.md §Profiel po-android.

Kanttekening: ×2 per variant en één profielkeuze; CPU 6× niet meer gemeten (host liep weer
naar loadavg 18). Genoeg voor "zelfde rangorde van kosten", niet voor procenten.

Volgende: main mergen (U58 is binnen), iteratie 1 opnieuw meten op po-android ×3, dan de
speelregel (cursorframe + volgend frame) als lus-item.

## 2026-10-07 21:50 — main (U58) gemerged; iteratie 2: speelregel ingeschakeld, meting loopt

Merge 4ca6bd3: U58 had de wolkenpublisher al tot één getemporiseerd kanaal gemaakt; daaroverheen
blijft uit iteratie 1 over dat het effect de cursor niet meer volgt (`untrack(selectedEpoch)`).
Typecheck exit 0, unit exit 0 (470 tests).

Iteratie 2 (orkestrator: niet-waarneembaar in de zin dat spelen alleen eerder begint):
- `App.tsx`: de poort "spelen pas na laadfase window" is weg. De afspeellus vraagt per beeld
  `playbackReach` (cursorframe + aaneengesloten geladen frames vooruit) en zet de cursor niet
  voorbij het eerste ontbrekende frame; dat frame wordt direct met hoge prioriteit gevraagd.
- `MrfClient.hasFrame`: aanwezigheid zonder URL-parse per aanroep.
- Keuzes die ik zelf maakte en die de PO mag omgooien:
  1. Wachtlimiet 3 s per ontbrekend frame (`PLAYBACK_FRAME_WAIT_MS`); daarna loopt de cursor
     door zoals vroeger, zodat een frame dat nooit komt de tijdlijn niet voorgoed stilzet.
  2. Tijdens het wachten staat de cursor stil zónder melding. De laadmelding op het slot is
     de PO-stap (kader); tot die er is, is dit precies de "stille pauze" uit MIP-19, alleen
     korter en nu met de kaart en de cursor in de pas.
- Rig: `?dev`-schakelaar `motregen-dev-speelregel=venster` zet de oude regel terug; scenario's
  `koud-spelend-dev` (nieuw) en `koud-spelend-vensterregel` (oud) meten beide uit één build.
  Eigenaar/vervaldatum in docs/dev-opties.md.

Nog niet gemeten: de host staat op loadavg 30–36. De A/B-run (po-android, ×3 per variant)
staat klaar en wacht per run op loadavg ≤ 8.

## 2026-10-07 22:40 — A herzien: renderer-quota via cgroup (orkestrator), profiel opnieuw gekalibreerd

`taskset` op de hele browser was verworpen omdat SwiftShader de kernen opat (eerste regenframe
2,5–7,1 s) terwijl een decode op 1–4 ms bleef. Nieuwe knop: alleen het renderer-proces in een
cgroup (`--renderer-cmd-prefix=systemd-run --user --scope -p CPUQuota=N% -p
CPUQuotaPeriodSec=5ms`). Proef met een rekenlus: zonder quota 117 / 116 ms (hoofddraad /
worker), renderer 50 % → 250 / 243 ms, renderer 10 % → 1240 / 1220 ms; hele boom 50 % →
696 / 671 ms. De quota remt hoofddraad en workers dus gelijk; page-CPU (CDP) staat daarom op 1×.

Sweep op `koud-spelend-vensterregel`, loadavg 5,1–7,8 (tabel in docs/perf.md §Profiel
po-android). Gekozen 30 %:

| meetpunt | PO 16:27:59 | po-android 30 % (run 1 / run 2) | afwijking |
| --- | ---: | ---: | ---: |
| decode p50 | 22 ms | 9,8 / 10,3 ms | −55 % (was −95 %) |
| basemap-tile p50 | 0,7–1,0 s | 0,33 / 0,64 s | te laag |
| eerste regenframe | 1151 ms | 1719 / 1648 ms | +45 % |
| ttfh | 4026 ms | 5880 / 6113 ms | +50 % |
| ttfp | 4,0–4,6 s | 4050 / 4053 ms | binnen de band |
| LoAF 12 s totaal | 4261 ms | 5412 / 5158 ms | +24 % |

Niet gehaald: decode p50 ≈ 22 ms samen met de vroege mijlpalen. Eén quota laat alle draden uit
één budget putten; 25 % geeft decode 14 ms maar ttfh +91 %, 12 % geeft 33 ms en ttfp 16 s. De
rig is een ruwe telefoon: goed voor verschillen tussen varianten uit één build.

Volgende: A/B van de speelregel op dit profiel (loopt).

## 2026-10-07 23:10 — iteratie 2 gemeten: speelregel, A/B uit één build op po-android

Profiel po-android (renderer-quota 30 %, raster ×3), build van 3a907fe + rigwijzigingen,
loadavg 6,8–8,0 (alle zes runs onder de drempel). Oud = `koud-spelend-vensterregel`
(schakelaar), nieuw = `koud-spelend-dev`; beide met `?dev`.

| maat | oud: venster (run 1 / 2 / 3) | mediaan | nieuw: frame (run 1 / 2 / 3) | mediaan | verschil |
| --- | ---: | ---: | ---: | ---: | ---: |
| **ttfp** | 4363 / 3934 / 3820 | 3934 ms | 2619 / 2554 / 2838 | **2619 ms** | **−1315 ms (−33 %)** |
| eerste regenframe | 1723 / 1820 / 1805 | 1805 ms | 1619 / 1764 / 1749 | 1749 ms | −56 ms (ruis) |
| ttfh | 6418 / 6174 / 6529 | 6418 ms | 6319 / 6419 / 6568 | 6419 ms | 0 |
| blank-visible-ms | 6045 / 6036 / 6521 | 6045 ms | 5575 / 5580 / 5430 | 5575 ms | −470 ms |
| LoAF 12 s totaal | 4957 / 5302 / 5554 | 5302 ms | 5055 / 5009 / 5061 | 5055 ms | −247 ms |
| decodes in 30 s | 222 / 222 / 223 | 222 | 253 / 253 / 253 | 253 | +31 (+14 %) |
| wire (bodybytes) | 3705588 / 3705588 / 3707305 | | 3782348 ×3 | | +76760 B (+2,1 %) |
| decode p50 | 9,9 / 9,9 / 10,3 ms | | 9,9 / 9,5 / 9,1 ms | | |

Lezing:
- De speelregel alleen levert 1,3 s op ttfp. De spreiding binnen een variant (≈ 0,3–0,5 s) is
  kleiner dan het verschil en de varianten overlappen niet.
- Spelen begint nu ≈ 0,9 s na het eerste regenframe. ttfh verandert niet: het histogram is
  nog steeds pas rond 6,4 s compleet, dus afspelen loopt ≈ 3,8 s vóór het histogram uit. Dat
  is precies het gat dat kader + fog (PO-stappen) moeten dekken.
- Meer decodes en bytes binnen 30 s komen doordat de tijdlijn 1,3 s eerder loopt en dus verder
  komt; het is geen extra werk per getoond frame. Voor de `--compare`-gate (geen stijging) is
  dit wel een stijging en moet de PO/orkestrator het als bedoeld aanmerken.
- `perf:mobile` gaf exit 1: "meetbron onvolledig". In 3 van de 6 runs wijkt Resource Timing af
  van de Playwright-bodybytes (ontbrekende requests, bodies tot 10× verschil op de
  HARMONIE-chunks). De Playwright-totalen zijn per variant identiek; de mijlpalen staan er los
  van. Onder de renderer-quota is de wire-boekhouding dus nog niet sluitend — open punt.

Nog te meten: ttfp-ref (Buienradar) op po-android en de productieroute zonder `?dev`; beide
lopen nu.

Preview voor de PO: **:4355 serveert commit 069b48d** (normale build, productiedata via
`MOTREGEN_DATA_ORIGIN=https://motregen.nl/data`, echte basemap), overgenomen van de tijdelijke
kopie van de orkestrator. Herhaalbaar met `web/scripts/track-preview.sh 4355`: bouwt, kopieert
naar `web/dist-preview` (met `.commit`) en herstart. De rig bouwt voortaan naar
`web/tmp/rig-dist` en raakt `dist` en `dist-preview` niet meer. 069b48d bevat de speelregel
(iteratie 2) en iteratie 1.

## 2026-10-07 23:45 — ttfp-ref op po-android; PO-opnames 18:05 (koud) en 18:06 (warm) op :4355 (069b48d)

**ttfp-ref Buienradar op po-android** (renderer-quota 30 %, loadavg 3,7–6,5, ×3):
3239 / 2975 / 3246 ms, mediaan **3239 ms**; eerste radarbeeld mediaan 2066 ms. Kanttekening:
advertentie- en tracker-iframes draaien bij Buienradar in eigen rendererprocessen en krijgen
elk hun eigen quota; dat valt gunstig uit voor Buienradar.

| stand op po-android | ttfp (mediaan ×3) | t.o.v. ttfp-ref 3239 ms |
| --- | ---: | ---: |
| oude speelregel (venster) | 3934 ms | +695 ms, lat niet gehaald |
| nieuwe speelregel (cursorframe + volgend) | 2619 ms | −620 ms, 0,81 × ttfp-ref |

Op de rig is de lat daarmee gehaald (ambitie 0,8 × net niet). Op de telefoon nog niet
aangetoond: daar ontbreekt Buienradar als referentie (zie vraag 4).

**De twee PO-opnames** (`po-chrome-1805-koud.json`, `po-chrome-1806-warm.json`, in deze map):

| meetpunt | koud 18:05 | warm 18:06 | rig po-android (nieuw, mediaan) |
| --- | ---: | ---: | ---: |
| basemap-ready | 1542 ms | 1991 ms | — |
| eerste regenframe (`milestone:first-rain`) | 2540 ms | 1314 ms | 1749 ms |
| **ttfp** (`milestone:ttfp`) | **3647 ms** | **1797 ms** | 2619 ms |
| ttfh (`window-ready:rain_rate`) | 5552 ms | 2836 ms | 6419 ms |
| blank-visible | 7559 ms (2,52 → 10,08 s) | 2844 ms (1,28 → 4,13 s) | 5575 ms |
| lange frames (hele opname) | 7 / 596 ms | 5 / 420 ms | 5,1 s in 12 s |
| regen-decode p50 | 36 ms | 28 ms | 9,5 ms |

De rig zit tussen koud en warm in voor ttfp en eerste regenframe, is te pessimistisch voor
lange frames (de fix van iteratie 1 + U58 heeft ze op de telefoon vrijwel weggehaald: 0,6 s
tegen 4,3 s vanochtend) en te optimistisch voor decodetijd.

Antwoorden op de vier vragen van de orkestrator:

1. **Wat meet blank-visible, en wat stond er in die 7,5 s op het scherm?** Het telt de tijd na
   de splash waarin minstens één regenslot in het *hele zichtbare scrubbervenster* (≈ 8 uur,
   ≈ 110 frames) nog geen waarde heeft. Het is dus "tot de laatste zichtbare balk binnen is",
   niet "niets zinnigs op het scherm". In de koude run was in dat interval wél zichtbaar: de
   kaart met regen vanaf 2,54 s, een spelende tijdlijn vanaf 3,65 s, de wolkenlagen vanaf
   3,15 s en het histogram rond nu ± 1 u vanaf 5,55 s. Wat ontbrak waren balken verder naar
   buiten; main tekent daar een 2 px-streepje. Aantal regenframes binnen (van ≈ 110):
   2 op 2,5 s · 9 op 3,6 s · 42 op 5,6 s · 66 op 7,0 s · 86 op 8,0 s · 98 op 9,0 s · 110 op
   10,1 s — een gelijkmatige vulling van ≈ 13 balken per seconde.
   Het getal is te grof: één ontbrekende randbalk telt even zwaar als een leeg histogram.
   Voorstel (nog niet gebouwd): er een oppervlak van maken, `∫ lege slots / zichtbare slots dt`,
   en het huidige getal ernaast houden als "laatste balk binnen".
   Waarom zo traag koud: de decodewachtrij stond leeg (`waitMs` p50 = 0) en de decodes
   druppelden binnen; de workers wachtten op bytes, niet andersom. Koud is hier
   netwerk-begrensd (de preview op :4355 proxyt elke Range via de dev-host naar
   motregen.nl/data). Warm, met de chunks in de HTTP-cache, kwamen ≈ 100 regenframes in 2 s en
   was het CPU-begrensd (2 workers, 28 ms per decode). Het histogram decodeert per balk een
   volledig regenframe (108 × 39 ms = 4,8 s workertijd koud); dat is het echte werk achter
   ttfh en blank-visible.
2. **Waarom ontbreekt ttfp in de warme run?** Hij ontbreekt niet: `milestone:ttfp` staat in
   de trace met duur 1797 ms (start 0, dus het tijdstip is de duur). Vermoedelijk gemist
   doordat alle mijlpalen `ts` = navigatiestart hebben en op duur gesorteerd moeten worden.
   Warm speelt de tijdlijn dus 0,48 s na het eerste regenframe.
3. **Koud eerste upload 2,5 s tegen 1,2 s eerder vandaag?** Niet de basemap en niet de nieuwe
   volgorde. De basemap-tiles begonnen in beide runs op ≈ 1,07 s en de app zelf tekende al op
   0,41 s. Het verschil zit in het eerste regenframe: de decode begon koud op 1916 ms, warm op
   1090 ms. De opname van 16:27:59 (eerste decode 1023 ms) past bij de warme run. Mijn lezing:
   de "koude start"-knop herlaadt de pagina maar leegt de HTTP-cache niet, dus de runs van
   vanmiddag hadden de chunk-bytes al; 18:05 was het eerste bezoek aan deze origin en moest
   de eerste regen-Range echt ophalen. Dat is een afleiding uit de tijden — de opname bevat
   geen netwerklog. Volgorde binnen de run pleit ook tegen "nieuwe volgorde": spelen begon
   pas 1,1 s ná het eerste regenframe.
4. **Buienradar op de telefoon — meetrecept.** Zie hieronder; twee varianten.

### Meetrecept ttfp op de telefoon (voor beide sites hetzelfde)

Definitie: van **het loslaten van de vinger op "Ga"/Enter in de adresbalk** tot **het eerste
moment dat het radarbeeld zichtbaar een ander beeld is dan het eerste** (de bui verspringt, of
bij Buienradar het tijdlabel linksboven op de kaart springt 5 minuten). Bij Buienradar is dat
≈ 1 s na het eerste radarbeeld; bij ons zodra de regen begint te schuiven.

A. Schermopname (aanbevolen, ±0,05 s):
1. Android-schermopname aan (snelmenu → Schermopname), met "tikken tonen" aan zodat de tik op
   Enter in beeld staat.
2. Chrome, gewoon tabblad. Eerst eenmalig buienradar.nl openen en de toestemming geven, zodat
   de muur niet meetelt. Dan Instellingen → Privacy → Browsegegevens wissen → alleen
   "Gecachte afbeeldingen en bestanden" (cookies laten staan): dat is "koud".
3. Adres typen, Enter. Wachten tot de radar een paar beelden heeft gelopen. Stoppen.
4. Drie keer voor buienradar.nl en drie keer voor de 4355-preview, om en om, zelfde wifi/4G,
   telkens met stap 2 ertussen. Voor "warm": dezelfde reeks zonder de cache te wissen.
5. In de opname beeld voor beeld (Google Foto's: slepen op de tijdbalk; of de video naar de
   dev-host en `ffprobe`/`ffmpeg`): tijd van de tik-stip en tijd van het eerste gewijzigde
   radarbeeld. Verschil = ttfp. Mediaan van drie.

B. Stopwatch (grof, ±0,3 s): tweede toestel als stopwatch, starten op Enter, stoppen op "de
   bui beweegt". Alleen bruikbaar als het verschil tussen de sites groter is dan ≈ 0,5 s.

Nauwkeuriger alternatief dat ik kan bouwen als de telefoon via USB aan de dev-host kan
(`adb`): dezelfde referentie-probe als in de rig over CDP op de echte Chrome van de telefoon
laten lopen, voor beide sites. Dan meet precies dezelfde code op het echte toestel.

Valkuil bij vergelijken: de 4355-preview haalt data via de dev-host (tailnet + proxy naar
motregen.nl); Buienradar komt rechtstreeks van zijn CDN. Koud is de preview daardoor in het
nadeel t.o.v. productie. Eerlijkst is koud tegen motregen.nl zelf zodra deze branch daar staat.

Volgende lus-kandidaten uit deze opnames:
- Het histogram decodeert per balk een heel regenframe (laag `L1`, 39 ms). Een puntreeks uit
  een goedkoper niveau zou ttfh en blank-visible direct verkorten.
- Koud is netwerk-begrensd: volgorde en grootte van de eerste regen-Ranges (de vraag
  "regen rond nu eerst, dan de uurvelden") is daar de hefboom, niet de CPU.

## 2026-10-08 00:30 — stap 3 (kader) als voorstel, klaar voor PO-akkoord

Besluiten orkestrator verwerkt of ingepland: +14 % decodes / +2 % wire zijn bedoeld (nieuwe
baselines volgen); blank-visible wordt een oppervlak met losse mijlpalen (volgt); lus
verbreed naar soepelheid (volgt, zie volgende entry).

Stap 3, wat er verandert (`HistogramScrubber.tsx`, `styles.css`):
- De laadtoestand dekte het plotvlak af met een wit blok, "Regenverwachting laden…" en een
  heen-en-weer lopend streepje. Nu blijft het kader zichtbaar: uurraster, verleden-tint,
  nu-lijn, cursor, dagstreep. De melding staat er gedempt in, rechts van de cursor, zonder
  beweging: "regen laden…" (of wolken / temperatuur / wind, naar de modus).
- Vóór het manifest is er geen tijdlijn; de scrubber rekent dan met de klok (nu − 3 u …
  nu + 48 u, op 5 minuten). As, "Nu", nu-lijn en cursor staan er daardoor vanaf het eerste
  beeld. Komt het manifest, dan verschuift de as hooguit het verschil tussen klok en laatste
  radarbeeld (minuten = enkele pixels).

Zelf bekeken (desktop 1280 en 390 px, trage lijn, CPU 4×; `scripts/load-shot.ts`), stills in
`stills/`:
- `stap3-voor-390.png`: oud — as erboven, plotvlak leeg wit met melding.
- `stap3-na-390.png` en `stap3-na-390-zonder-manifest.png`: kader compleet in beide fasen.
- `stap3-na-desktop-zonder-manifest.png`: idem op desktop.
Gezien en opgelost: de dagstreep liep door de tekst; de melding heeft nu een eigen ondergrond.

Gezien en NIET opgelost (voor de PO):
1. Vóór het manifest toont de tabel één rij "01:00 NU" (epoch 0) en ontbreken de modusknoppen
   op "Tabel"/"Uur" na. Dat is de tabel, niet de scrubber; hoort bij het skeleton van stap 4.
2. 's Nachts is het kader licht en wordt het plotvlak donker zodra de hemel (expressief)
   binnenkomt: een harde omslag van licht naar donker. Het kader zou de hemelkleur van het
   uur kunnen aannemen; dat is een smaakkeuze.
3. Na `loading` (eerste waarden binnen) tekent de scrubber voor ontbrekende balken nog het
   oude 2 px-streepje; fog is stap 4.

Receipts: `pnpm typecheck` exit 0, `pnpm test` exit 0 (470 tests; scrubber-test aangepast aan
de nieuwe meldingstekst), `pnpm build` exit 0. Nog niet: gerichte e2e desktop.

## 2026-10-08 00:55 — :4355 serveert d315561 (stap 3); meetpunten uitgebreid; soepelheid-nulmeting loopt

- **Preview :4355 = commit d315561** (stap 3-voorstel, speelregel, iteratie 1), via
  `web/scripts/track-preview.sh 4355`.
- blank-visible (8a… zie commit "meetpunt"): naast "laatste zichtbare balk binnen" nu ook als
  oppervlak — `blankSlotSeconds` (lege zichtbare slots × tijd) en `blankShareSeconds`
  (hetzelfde als aandeel: seconden volledig-leeg-equivalent) — plus mijlpaal `first-bar`.
  `ttfh` (`window-ready:rain_rate`) blijft de mijlpaal "nu ± 1 u compleet". In snapshot, HUD,
  trace en rig-rapport; unit-test erbij.
- Soepelheid (PO: "zo soepel mogelijk"): de rig-probe legt elk animatiebeeld vast; per venster
  van een scenario rapporteert de rig frame-tijd p50/p95/max en het aantal beelden > 50 ms en
  > 100 ms, plus texture-upload p50/p95 en scrub p50/p95 (invoer → regenbeeld, U49).
  Scenario's: `soepel` (afspelen tijdens laden 2–12 s, afspelen na laden 15–25 s, seeken na
  laden 26,5–36,5 s) en `soepel-seek-laden` (gepauzeerd, seeken 2–12 s). Seeken = elke 100 ms
  één stap vooruit op de tijdslider.
- Nulmeting soepelheid op po-android ×3 per scenario is gestart; wacht per run op loadavg ≤ 8.

Wachtrij, in deze volgorde:
1. Nulmeting soepelheid aflezen → tabel hier; PO-opnames (17:02, 18:05/18:06) ernaast.
2. Kandidaten met eigen pixelvergelijking: regentextuur R8 i.p.v. RG8 (upload halveren),
   uploads spreiden over beelden, wind-trail-werk per tik, tabel zonder layout-reads.
3. Koud eerste regenframe (1,9 s): grootte en prioriteit van de eerste regen-Range.
4. Nieuwe rig-baselines (`--baseline` ×3) zodra het meetcontract stilstaat; reden van de
   +14 % decodes / +2 % wire in docs/perf.md.
5. Gerichte e2e desktop na speelregel en stap 3 (nog niet gedraaid).

## 2026-10-08 01:45 — MacBook-referentie uit de Firefox Profiler; kaderhemel achter ?dev; C2-diagnose

**:4355 serveert nu 0eda33a** (stap 3 + `?dev`-knop "Kaderhemel" in het dev-paneel, groep
Laden; standaard uit, herladen om te zien). Still: `stills/kaderhemel-390.png`.

**Firefox-profielen (PO, MacBook, 20:32 Buienradar / 20:33 motregen op :4355).** Nieuw:
`pnpm prof:firefox <opname.json.gz>…` (`web/scripts/firefox-profile.ts`). Uitkomst, ms sinds
`Navigation::Start`:

| meetpunt | Buienradar | motregen |
| --- | ---: | ---: |
| FirstContentfulPaint / LCP | 443 / 817 | 402 / 468 |
| eerste radarbeeld / regen-Range: begin → eind | 697 → 795 | 734 → 1579 |
| tweede radarbeeld / regen-Range: begin → eind | 1704 → 1816 | 1580 → 1859 |
| ttfp-ref / ondergrens ttfp | 1816 | 1859 |

Gelijk op "tweede beeld binnen"; voor ons is dat een ondergrens (decode + textuur + tekenen
komen erna). Niet uit het profiel te halen: onze UserTiming-mijlpalen (opname zonder `?perf`),
het moment van tekenen (geen WebGL-marker), of Buienradar blijft lopen (opname stopt na twee
beelden), de cachetoestand, spreiding (één lading per site). Volledig in docs/perf.md
§Referentie: desktop-MacBook. De ruwe profielen staan in `.gitignore` (ze bevatten de andere
tabbladen van de PO).
Verzoek aan de PO voor een volgende opname: motregen op `…:4355/?perf=1`, dan staan ttfp,
regenvenster, blank-visible en de eerste texture-upload er wél in.

**C2 — waarom het eerste regenframe koud laat is.** Drie bronnen wijzen hetzelfde aan:
- Rig (po-android): manifest binnen op 466 ms; 41 header-Ranges 563 → 953 ms; het eerste
  regenframe wordt pas op 838 ms gevraagd (na stijl + kaart-opzet), binnen op 993 ms.
- MacBook-profiel: 39 headers 590 → 1512 ms; eerste regen-Range 734 → 1579 ms (845 ms voor
  100 kB).
- Koude telefoonopname 18:05: kaart-tiles vanaf 1,07 s, eerste regen-decode pas op 1,92 s.
Het eerste regenframe wacht dus (a) op de kaart-opzet voordat het gevraagd wordt en (b)
daarna achter ≈ 40 gelijktijdige headers op hoge prioriteit.
Iteratie 3 (geschreven, nog niet gebouwd of gemeten): direct na het manifest worden het
regenframe op de cursor en het volgende gevraagd, vóór de headers van de andere velden.
A/B-schakelaar `motregen-dev-eerste-regen=laat` + scenario `koud-spelend-regen-laat`.
Volgende stap daarna, als het helpt: de overige headers op lage prioriteit of pas na het
eerste regenframe.

**Hygiëne (eigen fout):** een oude rig-run van mij (koud-spelend, uit de vorige keten) leefde
nog en liep tegelijk met de soepelheids-nulmeting; bovendien bouwde en fotografeerde ik
tijdens die meting. Beide rigs deelden `tmp/rig-dist`. De oude run is gestopt. Regel vanaf nu:
één rig tegelijk, geen build/test/screenshots terwijl een rig-run meet. De lopende nulmeting
beoordeel ik op de loadavg per run en draai ik zo nodig opnieuw.

## 2026-10-08 02:40 — main (U59) gemerged; :4355 serveert 526b987; nulmeting soepelheid; iteratie 3 niet aangetoond

**Merges:** 10b7ed6 (U59 eigen basiskaart) en 526b987 (vite-plugin die het PMTiles-archief
lokaal serveert). U59 had de rig zelf per poortpaar een eigen build- en fixturemap gegeven;
dat schema is overgenomen (`rigBuild` in `scripts/rig-host.ts`), met daarop de voorbouw vóór
het wachten, de renderer-quota en de soepelheidsvensters van U54. Typecheck exit 0, unit
exit 0 (479 tests).
**Preview :4355 = 526b987**, preview-server herstart (vite.config gewijzigd). Zelf bekeken op
390 px: eigen basiskaart zichtbaar, niet grijs; `/data/basemap/nl-0aa536ff364f7cce.pmtiles`
geeft 206 op een Range.

**Rig-fout van mij, hersteld:** sinds de rig naar een eigen outDir bouwde stond de stijl-URL
als prefix vóór `tsc -b` en bereikte hij `vite build` niet. De rig bouwde dus met de echte
basemap, blokkeerde die als extern verkeer en liep vast (runs die na 16 minuten strandden —
niet alleen de load). Geraakt: de afgebroken productierun en de eerste soepel-poging; de A/B
van de speelregel en de kalibratie zijn van vóór die wijziging. `perf:mobile` bouwt nu eerst
en wacht daarna op een rustige host.

Alles hieronder is **vóór U59** gemeten (build van b29ed52, po-android, loadavg 5,1–7,9, ×3).

**Iteratie 3 — regen rond nu als eerste verzoek: op de rig NIET aangetoond.**

| maat | laat (oud) run 1 / 2 / 3 | mediaan | vroeg (nieuw) run 1 / 2 / 3 | mediaan |
| --- | ---: | ---: | ---: | ---: |
| ttfp | 3016 / 2745 / 2627 | 2745 ms | 2279 / 2433 / 2608 | 2433 ms |
| eerste regenframe | 1882 / 1770 / 1722 | 1770 ms | 1780 / 1917 / 2096 | 1917 ms |
| ttfh | 6322 / 7584 / 7718 | 7584 ms | 6545 / 6778 / 7352 | 6778 ms |
| decodes / wire | 253 / 253 / 250 · 3783170 B | | 253 / 252 / 252 · 3781390–3783107 B | |

De mediaan van ttfp is 312 ms beter, maar de reeksen raken elkaar (2608 tegen 2627) en het
eerste regenframe komt juist niet eerder. Dat klopt met de rig: daar wacht het eerste
kaartbeeld op de kaart-opzet, niet op bytes (lokale server, 20 ms). De winst die de echte
opnames voorspellen zit in een volle lijn (39–41 headers tegelijk), en die bootst de rig niet
na. Conclusie: geen claim. De wijziging blijft staan (geen zichtbaar effect, logisch gevolg van
de traces) met de schakelaar `motregen-dev-eerste-regen=laat` voor een echte A/B op de
telefoon met `?perf=1`.

**Nulmeting soepelheid** (scenario's `soepel`, `soepel-seek-laden`; run 1 / 2 / 3):

| venster (10 s) | frame-tijd p95 | beelden > 50 ms | beelden > 100 ms | LoAF totaal | scrub p50 / p95 |
| --- | ---: | ---: | ---: | ---: | ---: |
| afspelen tijdens laden | 100 / 100 / 100 ms | 47 / 40 / 39 | 17 / 15 / 16 | 3679 / 3321 / 3119 ms | — |
| afspelen na laden | 16,8 / 16,8 / 16,8 ms | 3 / 3 / 4 | 0 / 0 / 0 | 298 / 137 / 301 ms | — |
| seeken na laden | 133 / 83 / 83 ms | 67 / 43 / 32 | 16 / 5 / 7 | 4638 / 2350 / 2490 ms | 105 / 75 / 74 · 175 / 120 / 175 ms |
| seeken tijdens laden | 133 / 117 / 133 ms | 55 / 56 / 49 | 20 / 17 / 19 | 3941 / 4031 / 3970 ms | 60 / 70 / 60 · 164 / 160 / 135 ms |

Texture-upload: p50 0,1 ms, p95 4,7–9,4 ms (53–61 uploads per run). Eerste balk 1,67–1,91 s;
blank-visible als oppervlak 228–231 slot-s (3,6 s volledig-leeg-equivalent) bij afspelen,
249–260 slot-s (4,0–4,2 s) bij seeken tijdens laden.

Lezing: afspelen na het laden is glad. Het haperen zit in (1) seeken, ook ná het laden — elke
stap kost een lang beeld, 2,4–4,6 s LoAF per 10 s — en (2) alles tijdens het laden. Seeken na
laden is de eerste kandidaat: daar is geen netwerk of decode-achterstand meer als excuus.
Kanttekening bij texture-upload: onder de renderer-quota meet de rig 0,1 ms per upload
(telefoon 5,8 ms); de winst van een kleinere regentextuur (R8) is op deze rig dus niet te
zien en moet uit een telefoonopname komen.

Loopt nu (na U59): nieuwe baselines `--baseline` ×3 voor de zes klassieke combinaties, daarna
po-android `koud-spelend` / `soepel` / `soepel-seek-laden` ×3 en ttfp-ref ×3 voor de
"na U59"-regel.

## 2026-10-08 04:15 — lus-tabel, nieuwe regel "na U59"; baselines gezet; meetfout in de referentie hersteld

**Baselines:** `--baseline` ×3 voor de zes klassieke combinaties, exit 0, spreiding 0 %,
loadavg 5,5–7,9 (commit f105483). `journey` +15 % decodes / +2,9 % wire is bedoeld en staat
met reden in docs/perf.md §Baselines na U54 + U59.

**Lus-tabel po-android** (renderer-quota 30 %, raster ×3, ×3 per regel, loadavg ≤ 8):

| stand | ttfp (run 1 / 2 / 3) | mediaan | ttfp-ref | eerste regenframe | ttfh | LoAF 12 s | decodes / wire in 30 s |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| oude speelregel (`?dev`, vóór U59) | 4363 / 3934 / 3820 | 3934 ms | 3239 | 1805 | 6418 | 5302 ms | 222 / 3,71 MB |
| speelregel (`?dev`, vóór U59) | 2619 / 2554 / 2838 | 2619 ms | 3239 | 1749 | 6419 | 5055 ms | 253 / 3,78 MB |
| + eerste regen vroeg (`?dev`, vóór U59) | 2279 / 2433 / 2608 | 2433 ms | 3239 | 1917 | 6778 | 5724 ms | 252 / 3,78 MB |
| **na U59, productieroute (526b987)** | 2350 / 2256 / 2072 | **2256 ms** | **3112 / 3223** | 1771 | 6021 | 5138 ms | 252 / 3,79 MB |

Na U59: ttfp 2256 ms tegen ttfp-ref 3112–3223 ms, ≈ 0,71 ×. Op de rig is ook de ambitie
(≤ 0,8 ×) gehaald. Eerste balk 1,58–1,83 s; blank-visible 225–227 slot-s (3,5–3,6 s
volledig-leeg-equivalent), laatste balk binnen na 5,2–5,3 s.

**Meetfout, hersteld.** De referentie-samenvatting toonde "3112 / 2975 / 3223": de middelste
waarde was een rapportbestand van de run van 18:06. Run 2 van nu mislukte — Buienradar zelf
gaf "Niet gevonden — momenteel kunnen wij geen informatie ophalen" en toonde geen radar
(screenshot bekeken). Geldig zijn dus twee runs: 3112 en 3223 ms. `perf:mobile` wist voortaan
de rapporten van dezelfde profiel/scenario-combinatie vóór een run. De eerdere tabellen zijn
nagelopen: daar slaagden alle runs van de aanroep, dus geen oude bestanden in de uitslag.

**Soepelheid na U59** (run 1 / 2 / 3; tussen haakjes de nulmeting vóór U59):

| venster (10 s) | frame-tijd p95 | beelden > 50 ms | LoAF totaal | scrub p95 |
| --- | ---: | ---: | ---: | ---: |
| afspelen tijdens laden | 217 / 117 / 117 ms (100 / 100 / 100) | 66 / 48 / 47 (47 / 40 / 39) | 6683 / 3357 / 3734 ms | — |
| afspelen na laden | 33,3 / 33,4 / 33,3 ms (16,8 ×3) | 6 / 10 / 6 (3 / 3 / 4) | 461 / 796 / 240 ms (298 / 137 / 301) | — |
| seeken na laden | 100 / 117 / 100 ms (133 / 83 / 83) | 68 / 68 / 55 (67 / 43 / 32) | 4074 / 4117 / 2915 ms | 269 / 195 / 216 ms (175 / 120 / 175) |
| seeken tijdens laden | 150 / 117 / 133 ms (133 / 117 / 133) | 53 / 48 / 51 (55 / 56 / 49) | 4184 / 4323 / 4338 ms | 230 / 240 / 140 ms (164 / 160 / 135) |

Opvallend en consistent (3 van 3 aan beide kanten): **afspelen na laden ging van p95 16,8 naar
33,3 ms** tussen de build van vóór U59 en die erna. Tussen die twee builds zit de U59-merge én
mijn knop "Kaderhemel" (standaard uit) en LoAF-rapportage; ik heb het niet uitgesplitst. Het
is een signaal, geen diagnose — voor de orkestrator/U59 om mee te wegen.

**Waar het haperen bij seeken vandaan komt (rig):** in het venster "seeken na laden" vielen 370
decodes, 7,3 s workertijd in 10 s. Niet regen, maar uurvelden voor wat in beeld schuift:
`feels_like_c` 33 × 110 ms (3,8 s), de rest ≈ 10 ms per stuk. Twee kanttekeningen maken dit
geen productconclusie: (1) de quota laat workers en hoofddraad uit één budget putten, op een
telefoon met meerdere kernen verdringen decodes de hoofddraad veel minder; (2) op de telefoon
kost `feels_like_c` 27–35 ms, geen 110. En de rig zet maar 34 stappen in 10 s. Er is geen
telefoonopname van seeken; de opname van 17:02 is een koude start van 10 s.
**Verzoek aan de PO:** één opname "30 s" op de telefoon terwijl hij na het laden 10 s
heen en weer scrubt en 10 s laat afspelen — dan is er een echte referentie voor soepelheid.

**Nieuw in deze commit:** `?dev`-knop "Eerste regen" (vroeg/laat, groep Laden) zodat de A/B
van iteratie 3 op de telefoon kan met `?perf=1&dev`.

Nog niet gedaan: rendering-kandidaten (R8-regentextuur, uploads spreiden, wind-trail per tik,
tabel zonder layout-reads) — niet begonnen; gerichte e2e desktop — niet gedraaid.
