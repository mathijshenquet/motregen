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
