# Track U4 — urenoverzicht: LOG (append-only, nieuwste onderaan)

## 2026-09-23 12:50Z — start, verkenning en ontwerp

Worker: claude opus 5.5 in herdr-pane, worktree `track-u4-urenoverzicht`.

Bevindingen bij het lezen (naast de orchestratorbevindingen in de spec):

- `buildTimeline` (web/src/core/time-model.ts) gooit voor ÁLLE velden frames
  met `t < now` weg tenzij de bron `rtcor` is. Daardoor tonen de historierijen
  van de tabel vandaag nooit temp/wind/RV/bewolking, en valt ook de UV-
  analyse (bron `uv`, alleen verleden!) volledig uit de tijdlijn — de
  UV-chip werkt dus nooit op historie. Contractregel "t < nu = alleen
  observaties" is bedoeld voor regen (MIP-4 ronde 4); voor uurvelden bestaan
  geen observaties. Voorstel: regel alleen op `rain_rate` toepassen; `uv`-
  analyses (status 1) tellen als waarneming. Contract.md krijgt een
  verduidelijkende changelogregel — ter review door orchestrator.
- Live prod-chunkgroottes (manifest 12:45Z, run 08Z, 24 frames): temp 315 kB,
  gevoel 317 kB, wind u/v 432/410 kB, straling 142 kB, RV 126 kB, bewolking
  93 kB, HARMONIE-regen 1.079 kB. Per uur dus ≈ 76 kB uurvelden + 45 kB regen.
- De tabel laadt passief (L0 "direct") alle rijen × 7 velden. Elke extra
  tabelrij kost live ≈ 76 kB passief. 24 → 48 u vooruit naïef = +1,8 MB
  passief: dat past niet bij MIP-8 (≤ 3 MB passief).
- HARMONIE-tar bevat leden +0…+60 (docs/arome.md); index-probe is al
  generiek in de horizon.

Ontwerp (keuzes; motivatie):

1. Ingest-horizon `--arome-hours` 24 → 48 (volledige vooruitzicht, ook
   "morgen de hele dag" bij een 7 u oude run). Kost: +24 leden × ≈14,2 MB ≈
   +340 MB download per verversing (elke 3 u) en ≈ +2,9 MB aan chunks op
   schijf; gebruikersbytes alleen als ze geladen worden (zie 3).
2. Historie: een tweede, oudere HARMONIE-run levert de uren tussen
   `nu − 6 u` en de huidige run-start. Keuze van die run: de nieuwste
   gelistte run met start ≤ min(vloer(nu) − 7 u, R − 1 u); leden +0…+(R−R_h)
   (lid +0 alleen als de-accumulatiebasis voor straling). Alleen de zeven
   uurvelden, geen regen (verleden = observaties). Stateless en
   herstartbestendig: bij 3-uurscadans is R_h meestal precies de vorige
   opgehaalde run, dus de leden staan al in de download-cache (cache-age
   12 u) → steady state 0 extra downloadbytes; na een herstart ≈ 4 leden
   ≈ 57 MB. Historie groeit tussen verversingen van ≥ 6 u tot ≥ 9 u.
   De client-compositie ("recentste run wint") heeft geen wijziging nodig.
3. Frontend: tabelrijen volgen de data (eerste beschikbare uur ≥ nu−6 u,
   laatste uur met data). Passief laadt alleen historie + 24 u vooruit (≈ de
   huidige 28 rijen); verdere rijen laden bij scroll-nabijheid
   (IntersectionObserver) of bij L2. Zo blijft passief-budget vlak.
4. UV-kolom: historie/nu uit bron `uv`; vooruit afgeleid uit straling en
   zonshoogte (formule + kalibratie op live data in docs/fields.md), label
   "≈" en tooltip "schatting".
5. Zon op/onder: berekend via solar.ts (−0,833°-kruising, bisectie) voor de
   gekozen locatie. Twee vormen achter een toggle; default + screenshots in
   deze LOG.
6. Kaartlabel "nu": klok lokale tijd, eigen component (diff in App.tsx
   minimaal i.v.m. U2), plus scrubbertijd als die ≠ nu.
7. MIP-9 regenkans: draft, niet implementeren.

## 2026-09-23 13:00Z — ingest live, frontend gebouwd

- Ingest (commit 8be1be8): `--arome-hours` 48, `--arome-history-hours` 6;
  `decode_arome_run` gedeeld; `arome_history_choice` getest.
- Live receipt, synchroon: `RUST_LOG=info target/release/motregen-ingest --once
  --data-dir <scratch>/live/data` → `DAEMON-EXIT: 0`. Run 10Z +48 in 46,9 s,
  693.501.914 B download; historierun 05Z, 5 frames (06–10Z), 82.887.104 B
  (koude cache). Manifest 18→19 chunks, 22.446 B (gzip 1.373 B tegen 1.124 B
  prod vóór = +249 B per poll). `uv run --project spec
  spec/validate_manifest.py <live>` → `VALIDATE-EXIT: 0`.
- Correctie op mijn ontwerpaanname: KNMI publiceert P1 uurlijks met ≈ 3 u
  vertraging (10Z beschikbaar vóór 12:52Z). De historierun is daarom meestal
  NIET de vorige opgehaalde run, dus steady state ≈ 83 MB extra per
  verversing en geen 0. Geaccepteerd (≈ +12% ingestdownload); gedocumenteerd
  in docs/ingest.md.
- Frontend (commit 30741cd): ForecastTable-component, MapClock, zon op/onder,
  UV-kolom, verleden-regel alleen voor regen. Unit 98/98, typecheck 0.
- Zonsopgang/-ondergang geverifieerd tegen Python astral (NOAA): De Bilt
  2026-09-23 op 05:26:44Z tegen 05:27:04Z, onder 17:35:32Z tegen 17:35:16Z.
  Een eerste gegokte almanak-referentie in de test heb ik vervangen.
- UV-kalibratie (één ochtend, n ≈ 62k cel-uren): zie docs/fields.md;
  script `uvcal.py` in deze map. Middaguren volgen voor een herkalibratie.

### Zon-vorm (PO beslist op zicht)

Default = **tussenrij** (`zon-tussenrij.png`); alternatief via `?zon=markering`
(`zon-markering.png`). Motivatie: de tussenrij leest als gebeurtenis in de
tijdlijn ("Zon onder 19:35" tussen 19:00 en 20:00), houdt het
rijritme gelijk en is met woord zelfverklarend. De markering maakt de
betreffende uurrij hoger, en een los "19:35" met klein icoon is cryptisch.
Desktop-overzicht: `desktop-urenoverzicht.png`; kaartlabel:
`kaart-nu-label.png` (Nu 15:07 · Kaart 15:37 tijdens playback).

### e2e-ronde 1–2: passief-budget

- e2e-1 (exit 1 kwam door een redirect naar een niet-bestaande $TMPDIR buiten de
  sandbox; geen testuitslag). Herhaling: passief desktop 1.161.816 B, 4G
  1.167.484 B, Fast 3G 1.229.053 B (budget 800.000; baseline docs/perf.md
  547.578 B). Oorzaak: `MrfClient.fetchFrameSpan` haalt de hele chunk zodra
  > helft van de frames gevraagd wordt; met 48-frame-uurchunks trok de
  passieve tabel alle 48 frames per veld.
- Poging 1 (clientregel: hele chunk pas bij ≥ 75% span): passief 753.769 B
  desktop, maar Fast 3G 810.848 B en warm desktop 4.650 B (budget 0). Losse
  temperatuurlabelframes vielen buiten de kortere spans. Teruggedraaid.
- Poging 2 (huidig): de ingest splitst uurvelden in dagdelen van 24 leads
  (`-l1-24`, `-l25-48`); de clientregel blijft ongemoeid. Synthgen spiegelt dat.
- e2e-3 (dagdelen): desktop groen (passief 775.345 B, warm 0 B), Fast 3G
  832.424 B. e2e-4 (historie laden bij zicht): desktop 785.236 B en 4G
  790.904 B groen, Fast 3G 831.417 B.
- Uitsplitsing per bestand (eigen meetscript, zelfde synthdata, main-build
  ed05b51 tegen de mijne, Fast-3G-profiel): historiechunks ≈ 96 kB (op een
  telefoon staan de eerste tabelrijen al in beeld), dagdeel 2 ≈ 91 kB
  (passief tot nu+24 u liep over dagdeel 1 heen), straling ≈ 36 kB, UV +15 kB.

## 2026-09-23 13:35Z — ontwerpcorrecties op bytes, merge main

- **Historie ingeklapt** achter een kopregel "Afgelopen 6 uur tonen" (commit
  d19ea9e; zie `historie-ingeklapt.png`, `historie-uitgeklapt.png`). De nu-rij
  staat daardoor bovenaan het zichtbare deel van de tabel; op mobiel hoef je
  niet eerst 6 verleden-uren door te scrollen, en historie kost bytes pas
  na een tik. Uitgeklapt: getinte rijen, UV = KNMI-analyse, regen alleen
  binnen de 3 u RTCOR-historie.
- **Passieve horizon 18 u.** De oude tabel vroeg +24 u, maar de run-
  verankerde data reikte tot R+24 ≈ nu+17…20 u. 18 u is dus gelijkwaardig en
  blijft meestal binnen dagdeel 1. Verdere rijen laden via L2 bij scroll.
- Merge main (U2 locatie, U5 gevoelstemperatuur): alleen het tabelblok in
  App.tsx conflicteerde; ForecastTable neemt U5's weergave over (gevoel
  groot, luchttemp klein, geen switch). U5's `feels_like_c`-body zit in de
  gedeelde decoder (alleen de aanroep bleef). `cargo fmt` reflowt één assert
  in U5's test; main zelf is daar niet fmt-schoon (rustfmt --check op
  main:pipeline.rs → exit 1).
- Gates op de gemergde boom (f2e31e5 + docs):
  `cargo fmt --all -- --check` → FMT-EXIT 0; `cargo clippy --workspace --
  -D warnings` → CLIPPY-EXIT 0; `cargo test --workspace` → CARGO-TEST-EXIT 0
  (54 passed); Cargo.lock == main, dus geen `nix flake check` nodig.
  `pnpm typecheck` 0; `pnpm test` 110/110.
- e2e-5 (gemergde boom), 5/6 groen: passief desktop **590.306 B**, 4G
  **600.560 B**, Fast 3G **631.385 B** (budget 800.000; main-build op
  dezelfde synthdata 547.578 B desktop). Warm 0 B, tweede klik 0 requests,
  manifest-refresh 0 chunkrequests. Eén fout: 4G warm TTFR 4.133,6 ms tegen
  een grens van 3.500. De host stond op load average 42 (Chromium-e2e van andere
  tracks tegelijk; fps 20 tegen 45–58 in docs/perf.md). Herhaling volgt op
  een rustige host.
- Tweede live daemonrun (dagdelen): `DAEMON-EXIT: 0`; hoofdrun 10Z uit cache
  (0 B, 38,5 s decode), historierun 06Z 4 leden 68.819.530 B. Dat bevestigt
  de cachemisser. UV-herkalibratie op deze data (07–13Z, historie 06Z):
  dezelfde p = 0,35 en k = 0,84, RMSE 0,295.
- MIP-9 (regenkans) draft geschreven met bronnen geverifieerd via de API:
  seamless-leden (al gedownload), seamless-kansen 7,7–8,4 MB, HARMONIE EPS
  P2a gelagd (per uurrun 000 + 5 roterende leden, leads 0–60, ≈ 1,9 GB/run,
  neerslag als 181+184+201).

## 2026-09-23 (na host-herstart) — merge U1, gates groen

- Achtergrond-e2e van vóór de herstart was weg (geen uitslag). Werkboom
  schoon op 6f389ce + LOG-fix.
- Merge main (U1 laadprofiel, ddef2d9): alleen `readForecastPointSeries`
  conflicteerde. De nieuwe `layer`-parameter is overgenomen; historierijen laden
  als `L2` (intentie), stralingsreads voor de UV-schatting als `L0`. U1 liet de
  hele-chunkregel in `MrfClient` gelijk, dus de dagdelen blijven nodig.
- Gates (ddef2d9): `cargo fmt --all -- --check` → FMT-EXIT 0; `cargo clippy
  --workspace -- -D warnings` → CLIPPY-EXIT 0; `cargo test --workspace` →
  CARGO-TEST-EXIT 0 (54 passed); Cargo.lock == main. `pnpm typecheck` 0;
  `pnpm test` 112/112.
- `MOTREGEN_E2E_PORT=4486 MOTREGEN_E2E_DATA_PORT=8486 pnpm e2e` →
  **E2E-EXIT: 0, 6/6**. Load bij start 5,9. Passief **755.460 B** in alle
  drie profielen (main na U1: 720 kB volgens U1-LOG, dus +35 kB: straling
  voor de UV-schatting en headers van de extra chunks). Warm 0 B in alle
  profielen, tweede klik 0 requests, sessie 1,96–1,98 MB.
- Klaar voor review. Open punten staan in de PR.
