# U58 finishing touches (live) — LOG

## 2026-10-07 17:15 — start, stap 1 (globale Expressief-schakelaar) gebouwd, wacht op PO

- Worktree had geen `node_modules`: `pnpm install --frozen-lockfile` (root). `pnpm synthgen`, de preview en
  de screenshots moeten buiten de Claude-sandbox (tsx-IPC-pipe en poort-bind geven daar EPERM).
- Main gemerged vóór de eerste gedeelde build (fast-forward naar `15365cc`: permalink `?plaats=`, compacte `?t`).
- Preview draait: http://ageq-dev2:4320/ (`MOTREGEN_DATA_ORIGIN=https://motregen.nl/data pnpm preview --host
  0.0.0.0 --port 4320 --strictPort`; na een wijziging alleen `pnpm build`).
- Stap 1: `core/table-appearance.ts` → `core/expressive.ts` (`motregen-expressive`, standaard aan). Eén signaal
  in `App.tsx` stuurt `HistogramScrubber expressive` (U47; die ingang was nog nergens aangesloten) én
  `ForecastTable dayNight` (U42). About › Weergave: "Expressief — Hemel in de grafiek, dag en nacht in de tabel"
  vervangt "Dag en nacht in tabel". Migratie bij het laden: oude `motregen-table-day-night` = off → expressief
  off (tenzij er al een Expressief-keuze is), oude sleutel wordt verwijderd. `PRESERVED_STORAGE_KEYS` en
  `docs/dev-opties.md` §Opslag bijgewerkt.
- Zelf bekeken (`scripts/expressive-shot.ts`, desktop 1280 en 390 px): aan = hemel achter de scrubber +
  gekleurde tabel met zonsondergang-rij; uit = kale scrubber en vlakke tabel; paneel toont de schakelaar.
- Receipts (synchroon): `pnpm typecheck` exit 0; `pnpm test` exit 0 (68 bestanden, 451 tests); `pnpm build` exit 0.
- Repro: `cd web && pnpm typecheck && pnpm test && pnpm build`;
  `scripts/e2e-slot.sh pnpm exec tsx scripts/expressive-shot.ts http://localhost:4320 <uitmap>`.
- Volgende: PO-akkoord op stap 1 → commit; dan stap 2 (klokpil-jog, PO kiest richting/schaal live).

## 2026-10-07 17:35 — stap 1 gecommit (wacht op PO), orkestrator zet de laadregressie vóór stap 1

- `d42d56f` stap 1 als eigen commit, PO-akkoord staat nog open (tekst/icoon A2).
- Opdracht orkestrator (bevestigd in de pane): 25×-decodes per uurveld incl. RV, tabel-herrender, U47-SVG-
  herbouw; gate = rig + prof:capture.

## 2026-10-07 18:05 — laadregressie U42/U47: oorzaken, fix, metingen

**Oorzaak 1 — decodes.** Sinds U42 steken op een portrait-telefoon een paar tabelrijen onder de kaart uit.
`tableInView` werd daardoor waar en de planner (`readForecastPointSeries`) vroeg alle passieve rijen; het
U42-effect `loadHistoryRows` voegde de historie toe: 18 + 6 + nu = 25 rijen × 7 velden, RV inbegrepen terwijl
die kolom niet meer bestaat.
Fix: (a) RV-reeks helemaal weg (App, `ForecastSeries`, `HourlyForecastRow`); (b) `ForecastTable` meldt via een
IntersectionObserver welke rijen minstens half in beeld staan (`onVisibleRows`); zolang de tabel dicht is
(`tablePeeking`: in-view-apparaat, portrait, niet geopend/gesnapt) laden alleen die rijen — ook voor straling
en heldere-hemel-UV. Tabel open of ander layout: gedrag van U49 ongewijzigd.

**Oorzaak 2 — DOM-churn.** Niet per afspeeltik maar per aanvulling van een puntreeks (elke aanvulling is een
nieuwe array; tijdens afspelen schuift het venster en komt er steeds een frame bij):
- Scrubber (U47): `sky()`/`skyDetail()` leveren nieuwe objecten → `<For>` bouwde alle streken, sterren en
  gradient-stops opnieuw. Nu `<Index>` (alleen gewijzigde attributen), sterren met behouden identiteit,
  wolkenbanden per laagnaam gesleuteld.
- Tabel (U42): celwaarden waren kale functies; windsamenvatting/icoon/UV gaven steeds nieuwe objecten door en
  de lucide-iconen herbouwden hun paden. Nu memo per rij met veldgelijkheid (`sameFields`).

**Metingen** (zelfde host, 2026-10-07):

| meting | vóór | ná |
| --- | ---: | ---: |
| rig mobile-4g koud: decodes | 297 | 128 |
| rig mobile-4g koud: bodybytes | 1 646 413 | 1 127 376 |
| rig: lange frames (aantal / totaal / blocking) | 21 / 3179 / 1397 ms | 13 / 1894 / 685 ms |
| dom-churn 390 px, eerste 12 s: hemel-knopen | 72 494 | 18 |
| dom-churn 390 px, eerste 12 s: tabel-knopen | 1 196 | 16 |
| dom-churn 390 px, 12 s afspelen: hemel-knopen | 4 843 | 9 |
| dom-churn 390 px, 12 s afspelen: tabel-knopen | 775 | 35 |
| prof:capture mobile-4g passief: cloneNode + insertBefore | 940 + 721 ms | 8 + <1 ms |
| prof:capture: lange frames (aantal / totaal) | 56 / 13,5 s | 34 / 10,3 s |
| prof:capture: bezette samples | 1055 | 699 |

Per veld ná: rain_rate 66, wolkenlagen 3×9, uv 5, uv_clear 8, feels/temp/cloud_frac/wind_u/wind_v/gust elk 3,
radiation 3, rel_humidity 0. Baseline (vóór U42, 113): feels 2, wind_u/v 2, geen temp/cloud_frac/gust/radiation.

**Eerlijk over het doel (≤ 120 decodes / ≤ 1,1 MB, `--compare` groen): niet gehaald.**
- 128 / 1,13 MB. De 15 extra decodes zijn de rijen die echt in beeld staan (de piep volgt de cursor; in 30 s
  komen er drie rijen langs). Lager kan alleen met een productkeuze: piep-rijen leeg laten tot de tabel open
  is, of de piep onder de vouw. Niet zelf gekozen.
- `--compare` gooit "Baseline heeft een ander … meetcontract": de `contractHash` (fixture) van
  `perf/baselines/mobile-4g-koud.json` is ouder dan de huidige synthgen-fixture. Er is hoe dan ook een nieuwe
  baseline nodig (`--baseline --repeat 3`); niet gedaan, dat is een besluit.
- prof:capture "vóór" is opgenomen tegen de main-preview op 4330, "ná" tegen 4320: andere build en data-tijdstip,
  dus de lange-frame-totalen zijn indicatief. Wat er ná overblijft zit in kaart/wind-rendering (software-GL
  onder 4× CPU-rem), niet meer in DOM-werk.

**Receipts (synchroon):** `pnpm typecheck` 0; `pnpm test` 0 (68 bestanden, 452 tests); `pnpm build` 0;
`pnpm e2e e2e/decode-budget.spec.ts --project desktop` 0 (assertie aangepast: piep-rijen < 8 i.p.v. 0, RV altijd
0); `pnpm e2e e2e/decode-budget.spec.ts e2e/table.spec.ts e2e/cloud-section.spec.ts --project desktop`: table en
cloud-section groen (3 passed, 2 skipped), decode-budget rood vóór de assertie-aanpassing, daarna los groen.
Zelf bekeken: Lucht-scrubber desktop en hele pagina 390 px na de fix (hemel, wolken, gevulde piep-rijen).

**Repro** (alles in `web/`, buiten de sandbox):
- `pnpm perf:mobile --profile mobile-4g --scenario koud` (bouwt dist met de test-basemap; daarna `pnpm build`
  voor de 4320-preview)
- `scripts/e2e-slot.sh pnpm exec tsx scripts/dom-churn.ts http://localhost:4320 12 mobile` (nieuw script)
- `scripts/e2e-slot.sh pnpm prof:capture http://127.0.0.1:4320 <uit.json> --profile=mobile-4g --passive`,
  dan `pnpm prof:top <uit.json> 400`

Volgende: besluit orkestrator/PO over doel en baseline; dan PO-akkoord stap 1 en stap 2 (klokpil-jog).

## 2026-10-07 18:55 — nieuwe rig-baselines, rig-klik gecorrigeerd, 4320 op de normale build

- Besluit orkestrator: 128 decodes / 1,13 MB is het nieuwe doel voor koud; baselines opnieuw zetten.
- Eerste twee baseline-runs niet gecommit: journey gaf 328 decodes omdat de Playwright-klik op "Weer" de
  pagina naar de tabelkop scrolde (klik op y=28 i.p.v. y=609); op een telefoon is dat de tabel openen en dan
  laadt de hele tabel (bedoeld gedrag). `elementFromPoint` op drie punten van de kop gaf in Wind-modus steeds
  de kop zelf: niets bedekt hem, dus geen aanwijzing voor een tikfout bij gebruikers; waarom Playwrights
  hit-test faalt is niet verder uitgezocht. Rig: moduswissel is nu een DOM-klik (akkoord orkestrator).
- Storm werd twee keer geweigerd ("Onvolledige response" voor het isoline-worker-script in één van de drie
  runs); in de derde run kwam dat niet voor. Flake, oorzaak niet uitgezocht.
- `SHOWN_ROWS_REST_MS` (200 ms rust voordat een rij als zichtbaar telt) toegevoegd op een hypothese die níet
  de oorzaak van de journey bleek; laten staan omdat langsschuivende rijen zo niet laden, maar het effect is
  niet apart gemeten.
- Baselines (3 runs, spreiding 0 %): koud 128 / 1 127 388 B; journey 228 / 1 293 377 B (was 207 / 1 225 342);
  storm 189 / 1 318 557 B (was 280 / 1 572 568). Fast-3G-baselines niet vernieuwd (oud meetcontract).
- Receipts (synchroon): `pnpm perf:mobile --profile mobile-4g --scenario all --baseline --repeat 3` exit 0;
  `pnpm perf:mobile --profile mobile-4g --scenario all --compare` exit 0 (drie keer "groen", 0,000 %);
  `pnpm typecheck` 0; `pnpm test` 0 (452); `pnpm e2e e2e/decode-budget.spec.ts e2e/table.spec.ts --project
  desktop` 0 (3 passed, 2 skipped); `pnpm build` 0. 4320 serveert `index-DmUYN7y1.js` = de dist van deze build.
- `docs/perf.md` §Mobiele laadrig: nieuwe baseline, reden voor 1,13 MB, DOM-klik en `dom-churn.ts`.
- Stap 1 opnieuw bekeken op deze build (desktop 1280 + 390 px): aan = hemel + gekleurde tabel met
  zonsondergang-rij; uit = kale scrubber met regenbalken en vlakke tabel; paneel toont de schakelaar.
- Volgende: PO-akkoord stap 1, dan stap 2 (klokpil-jog).

## 2026-10-07 19:50 — urgent punt 2: haperend afspelen in de eerste ~10 s (PO-opname Chrome op 4320)

Vóór-meting gereproduceerd met `prof:capture --profile=mobile-4g --passive` op de build van `2f94321`: lange
frames eerste 12 s = 34 stuks / 7 846 ms, ~0,8 s per seconde van t=0 tot t=10, daarna vrijwel 0.

**Oorzaken en fixes**
- (a) `showTemperature` én `wind-layer currentTrailView`/`drawHeads` lazen elke frame `clientWidth`/
  `clientHeight`. Zolang de DOM vuil is (reeksen komen binnen) dwingt elke lezing een layout af; die tijd
  staat in het profiel als zelf-tijd van de lezende functie. Nu: App vergelijkt op de backing store van het
  canvas (attribuut, geen layout) en leest de CSS-maat pas als de labels echt opnieuw berekend worden; de
  windlaag cachet de CSS-maat, bewaakt door de backing store. `showTemperature` begon bovendien elke tik
  opnieuw zolang dezelfde invoer nog laadde; nu één lading per invoer (`temperaturePending`).
- (b) `packRainTexture`: het inpakken gebeurde al alleen bij de eerste upload van een frame (WeakMap-cache),
  niet per gedecodeerd frame. Versneld met één 16-bit-schrijf per pixel (node, 700×765: 0,87 → 0,35 ms).
  NIET naar de worker verplaatst: dat verdubbelt de overdracht/cache per regenframe of vraagt een andere
  shader (R8 + handmatige bilineaire filter); als de resterende ~3 ms per frame nog stoort is dat de volgende
  stap, met visuele controle.
- (c) Perf-markeringen draaien alleen met de `?perf`-vlag of de zichtbare HUD (`detailedMeasurementsEnabled`;
  `measurePerfPhase` geeft anders direct `operation()` terug). Let op: `?perf` is plakkerig via localStorage
  tot `?perf=0`. Overhead in perf-modus verlaagd: één `performance.measure` op tijdstempels in plaats van
  twee marks + measure + drie keer opruimen.
- (d) Wolkvormen (`puffOutline`) en scrubberwerk liepen per publicatie van een reeks, en dat was elke
  animatieframe. `FrameBatcher` kent nu een minimuminterval; regen-, tabel- en wolkenreeksen publiceren
  hooguit elke 200 ms (`SERIES_PUBLISH_INTERVAL_MS`). Zichtbaar gevolg: de grafiek vult tijdens het laden in
  stapjes van 0,2 s aan in plaats van per frame — productkeuze die de PO mag terugdraaien.
- Bijvangst: het permalink-effect in App hing aan `selectedEpoch()` en liep elke afspeeltik (nieuwe URL +
  params), ook als het tijdstip niet in de URL staat; nu alleen nog als het klokpaneel open is.
- Niet aangepakt: basemap-tiles (8 × ~1 s in de PO-opname; netwerk + parse, E8 PMTiles), de per-tik
  daglabel-transform en cursor-tags in de scrubber (~0,3–0,5 s per 30 s in mijn opname).

**Metingen** (`prof:capture http://127.0.0.1:4320 --profile=mobile-4g --passive`, headless SwiftShader, 4× CPU)

| meting | vóór (`2f94321`) | ná |
| --- | ---: | ---: |
| lange frames eerste 12 s (aantal / totaal) | 34 / 7 846 ms | 25 / 4 586 ms |
| laatste seconde met > 300 ms lange frames | t = 10 | t = 5 |
| `showTemperature` in de profieltop | plaats 1 (8,4 % van de samples) | niet meer in de top 22 |
| `currentTrailView` in de profieltop | plaats 3 (5,4 %) | niet meer in de top 22 |

Kanttekeningen: (1) de "self ms" van `prof:top` zijn bij deze schaarse bemonstering (~46 ms per sample)
onbetrouwbaar — `packRainTexture` staat ná op 9 % van de samples terwijl de fase `texture-upload` in dezelfde
opname 34 uploads / 479 ms telt; ik reken daarom met LoAF en fasen. (2) Headless SwiftShader rendert kaart en
wind in software; wat ná overblijft (t=0–5 s) valt samen met het laden van basemap-tiles en de eerste
kaartrenders en zegt weinig over een echte GPU. De echte toets is een nieuwe PO-opname in Chrome.
(3) De rig-LoAF's zijn ruis: koud gaf nu 17 / 2 224 ms tegen 8 / 859 ms in de baseline-run en 13 / 1 894 ms
eerder vandaag, bij gelijke code voor dat pad; hoofddraadbezetting daalde wel (koud 11,9 → 8,5 %, journey
22,5 → 19,2 %) en ttfh werd niet slechter (koud 2 627 → 2 313 ms).

**Receipts (synchroon):** `pnpm typecheck` 0; `pnpm test` 0 (68 bestanden, 453 tests, +1 FrameBatcher-
interval); `pnpm build` 0; `pnpm perf:mobile --profile mobile-4g --scenario all --compare` 0 (drie keer
groen: decodes 0,000 %, wire +0,02 %); `pnpm e2e e2e/decode-budget.spec.ts e2e/table.spec.ts
e2e/cloud-section.spec.ts e2e/freshness.spec.ts e2e/focus.spec.ts --project desktop`: 15 passed, 1 failed
(`focus.spec` "pinned isolines re-render…": strict-mode-fout op `.freshness-refresh`, twee knoppen sinds de
deelknop — stond los van deze wijziging); locator aangepast naar de knop "Nu verversen", daarna
`pnpm e2e e2e/focus.spec.ts --project desktop` 0 (8 passed, 2 skipped). dom-churn 390 px na de wijziging:
hemel 33 / 9 knopen, tabel 35 / 12 (eerste 12 s / afspelen). Zelf bekeken: 390 px en desktop — stads-
temperaturen op de kaart, regen, hemel en gevulde piep-rijen staan er.

Volgende: PO-opname in Chrome op 4320 als echte ná-meting; PO-akkoord stap 1; stap 2 (klokpil-jog).

## 2026-10-07 20:35 — urgent punt 2b: wolkendoorsnede werd tijdens laden ~15×/s herbouwd (PO-opname run 3)

PO: stap 1 AKKOORD (via orkestrator). PO-opnames op de vorige build: koud 4,3 s lange frames (beter), warm
0,3 s, run 3 slechter (9,3 s) met Solid/hemel/wolken in de top.

Gereproduceerd met `prof:capture --profile=mobile-4g --passive --mode=lucht` (nieuwe vlag; start via de
permalink-parameter `modus`). Tellers per scrubber-memo in de eerste 12 s (fasen `scrubber-paint:<memo>`,
hemel/hemeldetail waren nog niet geteld en zijn nu `scrubMemo`'s):

| meting (Lucht, mobile-4g passief, eerste 12 s) | vóór (`d19827b`) | ná |
| --- | ---: | ---: |
| lange frames (aantal / totaal) | 29 / 5 976 ms | 16 / 2 301 ms |
| laatste seconde met > 300 ms lange frames | t = 7 | t = 3 |
| hemeldetail (streken + sterren + schemering) | 175× / 3 279 ms | streken 11× / 242 ms, sterren 6× / 5 ms |
| wolkenlagen | 175× / 247 ms | 14× / 26 ms |
| texture-upload (hele opname, incl. inpakken) | ~13 ms per upload | 49× / 72 ms (~1,5 ms) |
| `packRainTexture` op de hoofddraad (prof:top, 400 regels) | aanwezig | 0 treffers |

**Oorzaak:** de 200 ms-begrenzing van de vorige ronde werkte niet voor de wolken: het effect maakte per
venster een nieuwe `FrameBatcher`, elk met een eigen klok, dus tijdens afspelen ~15 publicaties per seconde.
Elke publicatie herbouwde hemelstops, alle streken, sterren, schemering en alle wolkvormen.

**Fix:**
- één gedeeld publicatiekanaal voor de wolkenlagen; interval 250 ms (`SERIES_PUBLISH_INTERVAL_MS`);
- `core/stable.ts` (`sameFields`, `stableByIndex`): hemelstops, streken en schemering geven het vorige object
  terug als de inhoud gelijk is, en de vorige lijst als niets verschilt — dan loopt er niets door;
- `hemeldetail` gesplitst: zonsop/-ondergangen hangen niet meer aan de bewolking;
- `cloudBand` cachet de paden per wolk (laag, vak, maten): een nieuwe chunk tekent alleen haar eigen uren;
- zonnestand per tijdstip gecachet per plek (`sunElevationAt` in App);
- (3) regenframes worden op een eigen worker ingepakt vóór ze getoond worden (`prepareRainTexture`,
  `rain-pack.worker.ts`); mislukt dat, dan pakt de upload zelf in zoals voorheen. Bewust op aanvraag en niet
  in de decode-worker: ~9 van de 10 gedecodeerde regenframes dienen alleen de puntreeks, en elk ingepakt
  frame kost twee keer het frame aan geheugen.

**Receipts (synchroon):** `pnpm typecheck` 0; `pnpm test` 0 (69 bestanden, 455 tests; nieuw: stable.test);
`pnpm build` 0 (aparte bundel `rain-pack.worker`). Zelf bekeken: Lucht-scrubber 390 px (wolkvormen, streken,
schemergloed, sterren) en de hele pagina desktop (regen op de kaart, tabel) — geen zichtbaar verschil.
Nog niet opnieuw gedraaid op deze stand: rig `--compare` en de gerichte e2e (volgt na de scroll-bug).

Volgende: PO-bug "naar de tabel scrollen laat een strook histogram staan" (Android Chrome), dan stap 2.

## 2026-10-07 21:20 — PO-bug tabel-scroll (Android Chrome) + meting "scrubben tijdens laden"

**Scroll-bug** (PO-screenshot `po-scroll-bug-chrome.png`: ~48 CSS-px histogram blijft boven de tabelkop, "Weer"
nog gepind, kaart actief). Oorzaak volgens mij: `.forecast-panel` was `100svh` hoog. Klapt de adresbalk in,
dan is het scherm hoger dan 100svh en eindigt de pagina vóór het paneel bovenaan staat; de snap komt niet
aan, `panelTop` wordt nooit ≤ 2 px en dus geen tabelview en geen kaartpauze. De strook in de screenshot is
ongeveer een adresbalk hoog. scroll/scrollend-afhandeling bestond al (debounce 160 ms + `scrollend`).
- Fix 1 (CSS): paneel `height: 100dvh` (min-height blijft 100svh).
- Fix 2 (JS, vangnet): staat de pagina aan haar einde en steekt er hooguit `TABLE_SNAP_SLACK_PX` (120) boven
  het paneel uit, dan geldt dat als gesnapt — voor `settleTableView` én voor de kaartpauze
  (`tableCoversViewport`).
- Test: `table.spec` "telefoon met ingeklapte adresbalk" (390×844, touch): paneel 56 px korter dan het
  scherm, wielscroll zonder klik → `table-view-open`, `table-scroll-open`, Tabel gepind, kaart
  `data-rendering=false`; terug naar boven → kaart weer actief.
- Zelf bekeken (390 px, na wielscroll): gewoon → paneel op 0, Tabel gepind, kaart gepauzeerd; nagebootste
  balk → paneel op 56 px, Tabel gepind, kaart gepauzeerd. In die nabootsing blijft de strook zichtbaar (ik
  forceer daar de hoogte); of de strook op het echte toestel met `100dvh` verdwijnt kan ik headless niet
  aantonen — dat moet de PO op Android bevestigen. Niet tegen de oude code gedraaid om de test rood te zien.
- `pnpm e2e e2e/table.spec.ts --project mobile-4g` (eenmalig, buiten de desktop-regel, omdat de wijziging
  precies dit pad raakt): 3 passed, 1 failed — "mobile previews the heading…" zoekt een knop "Tabel openen"
  die in `src` niet bestaat (de knop heet "Tabel"); verouderde test, niet door deze wijziging. Niet gefixt.

**Scrubben tijdens laden** (correctie orkestrator: PO-run 3 was handmatig scrubben, run 2 telt niet).
`prof:capture --scrub`: twaalf seconden lang elke 800 ms een sleep van een derde plotbreedte. Vóór = build
van `d19827b` (de stand van de PO-opname; bronnen tijdelijk uitgecheckt, gebouwd naar een scratchmap,
geserveerd op 4321), ná = huidige stand op 4320. mobile-4g, headless SwiftShader.

| eerste 12 s | vóór Lucht | ná Lucht | vóór Weer | ná Weer |
| --- | ---: | ---: | ---: | ---: |
| lange frames (aantal / totaal) | 39 / 8 449 ms | 41 / 3 957 ms | 36 / 8 919 ms | 25 / 2 646 ms |
| wolkenlagen herbouwd | 236× | 22× | 259× | 20× |
| texture-upload | 41× / 316 ms | 56× / 75 ms | 2× / 67 ms | 16× / 49 ms |

Vóór komt overeen met PO-run 3 (~1 s lange frames per seconde tot t≈14). Ná: Lucht hapert nog licht tot
t≈10 (0,2–0,5 s per seconde); grootste resterende scrubberpost is `hemelstreken` (17–20× / ~0,4 s).

**Receipts (synchroon):** `pnpm typecheck` 0; `pnpm test` 0 (69 bestanden, 455 tests); `pnpm e2e
e2e/decode-budget.spec.ts e2e/table.spec.ts e2e/cloud-section.spec.ts e2e/freshness.spec.ts e2e/focus.spec.ts
--project desktop` 0 (17 passed, 4 skipped); `pnpm perf:mobile --profile mobile-4g --scenario all --compare`
0 (drie keer groen, decodes 0,000 %, wire +0,09…0,10 %); `pnpm build` 0, 4320 serveert `index-DCUpyv9q.js`.
Valkuil: een eerdere `--compare` gaf drie time-outs op ttfr terwijl de rig van track U59 tegelijk draaide
(zelfde poorten 8392/4392, andere worktree); alleen opnieuw gedraaid toen de poort vrij was. Twee rigs
tegelijk op deze host bijten elkaar — het e2e-slot dekt dat kennelijk niet af.

Volgende: PO bevestigt de scroll-fix op Android en maakt een nieuwe scrub-opname; dan stap 2 (klokpil-jog).

## 2026-10-07 21:55 — PO-opname Android Chrome ná de fixes (`po-chrome-1702-na.json`): nog binnen bereik?

PO/orkestrator: lange frames 9,3 → 1,35 s, blocking 8,2 → 0,28 s in 10 s. Opname: 387 samples over 9,5 s.
Leeswijzer: de "self ms" van `prof:top` wegen elk sample met het gat tot het volgende en zijn hier grof;
ik reken met het aantal samples (1 sample ≈ 0,26 %) en met de gemeten fasen in dezelfde opname.

| post | samples | oordeel |
| --- | ---: | --- |
| maplibre `xs` / `receive` / `calculatePosMatrix` | 27 / 11 / 1 | niet van mij (basemap-tiles, U59) |
| `measurePerfPhase` | 3 (0,78 %) | niet de moeite: de 508 ms is weegruis. Zonder vlag geeft de functie direct `operation()` terug (code gelezen, niet apart gemeten); met vlag is het sinds `d19827b` één `performance.measure` |
| `mrf.ts:176` | 7 | niet de moeite: dit is het antwoord van de decode-worker (boekhouding + volgende opdracht versturen), 280× in 10 s; geen chunkparsing. Het frame komt al als Transferable |
| `texImage2D` | 12 | niet gedaan: fase `texture-upload` 55× / 153 ms (2,8 ms per nieuw frame). Halveren kan met R8 + een shader die zelf filtert; raakt de regenweergave, dus alleen met visuele controle |
| `prepareRainTexture` | 9 | niet gedaan: de kopie van het frame naar de pack-worker. Goedkoper dan inpakken op de hoofddraad, maar niet nul |
| `postMessage` | 7 | niet de moeite: alle grote berichten gaan al als Transferable |
| Solid `markDownstream`/`readSignal`/`cleanNode` | 11 / 7 / 7 | deels gedaan: zie hemelstreken; de rest is de cursor per afspeeltik (scrubber, klok) |
| `scrubber-paint:hemelstreken` (fase) | 18× / 304 ms | **gedaan**: pad per streek gecachet, nachtstreken niet meer bemonsterd |
| `showTemperature` | 6 | **gedaan**: per tik eerst op getallen vergelijken (stap, zoom, canvasmaat) vóór frames opzoeken en een sleutel met twee chunk-URL's bouwen |
| `scrollTableToEpoch` | 8 | niet gedaan: de tabelpiep volgt de cursor en leest daarbij rijposities (layout). Kan goedkoper met een vaste rijhoogte, maar dat raakt U42's scrollgedrag |
| `overlay-canvas resize` | 4 | niet de moeite |

Gemeten effect hemelstreken (prof:capture `--scrub --mode=lucht`, om en om tegen de build van `842a493`,
host zwaar belast — load 17–25 door een botrenderer op 337 % CPU en de rig van U59):
vorige 17× / 431 ms en 18× / 371 ms → nieuw 19× / 55 ms en 15× / 48 ms. Lange frames in die vier runs:
vorige 7,5 / 5,3 s, nieuw 5,5 / 5,8 s — onder deze belasting geen bruikbaar verschil; een eerdere, rustiger
run gaf 4,0 s. De stadstemperatuur-tik is niet apart gemeten.

Receipts (synchroon): `pnpm typecheck` 0; `pnpm test` 0 (455 tests); `pnpm build` 0. Niet opnieuw gedraaid op
deze stand: gerichte e2e en rig `--compare` (de host is nu te druk voor een zinnige rig-run).

Wachtrij (orkestrator): bot-item voor stap 4–6 — Playwright-renderer van de bot houdt een GPU-proces op
300+ % CPU (page.close in finally, context per generatie sluiten, afspelen uit in de render-URL, CPU 60 s na
een generatie meten, docs/telegram.md).
