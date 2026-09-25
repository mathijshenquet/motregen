# U39 pollen-ingest (CAMS) — worker LOG (append-only, newest last)

## 2026-09-25 14:05 UTC — start, ontwerp
- Gelezen: spec, MIP-14, ingest main/publisher/pipeline/grid, docs ingest/contract/fields, nix module + VM-test.
- Referentie voor ADS: Open-Meteo's eigen CAMS-downloader (github open-meteo/open-meteo,
  `Sources/App/Cams/CamsDownload.swift`, `Helper/Download/Curl+CDS.swift`): ADS retrieve v1
  (`POST /api/retrieve/v1/processes/cams-europe-air-quality-forecasts/execute`, header
  `PRIVATE-TOKEN`, poll `/jobs/{id}`, `/jobs/{id}/results` → asset href, `DELETE /jobs/{id}`),
  `data_format: grib`, model ensemble, level 0, type forecast, time 00:00; GRIB-identificatie op
  (parameterNumber, constituentType): pollen 59/{62100 els, 62101 berk, 62300 gras, 62201 bijvoet},
  massa 0/{40009 pm2.5, 40008 pm10, 5 no2, 0 o3}; kg m**-3 ×1e9 → µg/m³.
- Open-Meteo levert CAMS-Europe op een 0,1°-rooster uitgelijnd op x.0 (gemeten: 52.05 → 52.0);
  run-tijd uit `/data/cams_europe/static/meta.json` (`last_run_initialisation_time`).
- Architectuur (besluit): aparte oneshot `motregen-cams` (systemd-timer 09:00 UTC) schrijft chunks
  in `<data>/chunks/` en een sidecar `<data>/cams.json`; de daemon neemt de sidecar bij elke
  poll mee (herleest alleen bij wijziging) in het manifest (chunks + sectie `cams`). Zo blijft de
  diff in eigen modules en blokkeert CAMS nooit de KNMI-publicatie.
- Grid: 6 km-uitsnede uitgelijnd op DETAIL_GRID, NL+Vlaanderen+marge; bilineair uit 0,1°.
- Geen ADS-sleutel: ADS-fixture wordt een GRIB2 met exact de ADS-codering (PDT 40,
  constituentType) gevuld met echte CAMS-waarden via Open-Meteo; generatorscript in deze map.

## 2026-09-25 14:45 UTC — Rust-kern groen
- Nieuw: `cams.rs` (velden, KNMI/LUMC-kalender, kwantisatie, bilineair 0,1° → 6 km CAMS_GRID
  96×105 uitgelijnd op DETAIL_GRID, chunks in dagdelen l1-24…l73-96, sidecar `cams.json`, daemon-
  `Feed`), `cams_ads.rs` (ADS retrieve v1 + GRIB2-decoder op parameterNumber/constituentType,
  kg m-3 ×1e9), `cams_open_meteo.rs` (terugval, 100 locaties per 12 s, 429-retry),
  `bin/motregen-cams.rs`, `env_file.rs` (uit main.rs gehaald, gedeeld). Gedeelde bestanden
  minimaal: publisher (`cams`-sectie + `write_chunks`), main.rs (Feed), 2× `pub(crate)`.
- ADS-fixture `crates/ingest/tests/fixtures/cams-ads-20260925T00-l0-24.grib2` (397 KB, 125
  berichten, leads 0–24, bijvoet + 4 luchtkwaliteit) via `make_ads_fixture.py`.
- Besluit: `pred`-codec op alle CAMS-velden: fixture 443 483 B → 239 131 B (−46 %), verliesvrij.
- Receipts: `cargo test -p motregen-ingest` TEST-EXIT 0 (35 lib-tests, 12 nieuw); clippy schoon.
  Fixture-run `motregen-cams --grib <fixture>` FIXTURE-EXIT 0 → 5 chunks. Live Open-Meteo-run
  OM-EXIT 0 → 20 chunks, 911 390 B/dag (run 2026-09-25T00Z). Eerste live-run faalde op een
  parserbug (`time`-array strings); test aangescherpt en gefixt.
- Inhoudscheck De Bilt (52,10 N 5,18 E) gedecodeerd vs Open-Meteo-punt: O₃ 12Z 74,0/74,0,
  NO₂ 00Z 19,5/19,3, PM2,5 8,0/8,1 — tijdas en oriëntatie kloppen.

## 2026-09-25 15:05 UTC — Nix, docs, manifest-vlag
- Nix: `motregen-cams.service` (oneshot, DynamicUser met `User=motregen-ingest`, zelfde
  StateDirectory/EnvironmentFile, Restart=on-failure na 30 min) + `motregen-cams.timer`
  09:00 UTC Persistent; pakket wrapt beide binaries; VM-test draait de job op de ADS-fixture.
- Eerste `nix flake check`: FLAKE-CHECK-EXIT 1 — terecht gevangen: vanaf de host is de CAMS-chunk
  eigendom van uid 65534 terwijl de ingest als 63278 draait (idmapped StateDirectory?). Test
  herschreven naar wat telt: eigenaar + schrijf/lees-recht gezien vanuit de mount-namespace van
  de draaiende ingest (nsenter met diens uid/gid); host-view wordt geprint voor de LOG.
- Meting: prod-manifest nu 27 chunks, 103 263 B headers, 26 318 B JSON. CAMS in het manifest:
  +20 chunks, +63 262 B header-prefetch per sessie (client haalt alle headers, App.tsx:284),
  +18 513 B per manifest-poll. Besluit (ter review orkestrator/PO): daemon-vlag
  `MOTREGEN_CAMS_IN_MANIFEST` / NixOS `services.motregen.camsInManifest`, standaard UIT;
  U38 zet hem aan samen met een client die alleen getoonde velden prefetcht, of serveert
  cams.json als op-aanvraag-manifest (MIP-14 data-op-aanvraag).
- Docs: `docs/pollen.md` (sleutel-stappen PO, exact ADS-request, GRIB-mapping, fixture-herkomst,
  kalender, kwantisatie, licentie), contract.md-amendement, ingest.md-verwijzing.

## 2026-09-25 — gates op 379b895, rebase op c719a82
- Receipts op 379b895 (na nsenter-herschrijving): CARGO-TEST-EXIT 0 (`cargo test --workspace`),
  CLIPPY-EXIT 0 (`--workspace --all-targets -D warnings`), FMT-EXIT 0, FLAKE-CHECK-EXIT 0
  (`nix flake check -L`). VM: host-view owner van de CAMS-chunk `65534 65534`, vanuit de
  ingest-namespace gelijk aan de ingest-uid → StateDirectory is idmapped; delen werkt.
- Gerebased op origin/main c719a82 (conflictvrij); gates opnieuw gedraaid, zie volgende entry.

### Staat voor de PO / orkestrator (expliciet)
- **Manifest-vlag staat standaard UIT**: `services.motregen.camsInManifest = false`
  (`MOTREGEN_CAMS_IN_MANIFEST`). De dagelijkse job schrijft chunks + `cams.json`, maar het
  manifest krijgt ze pas als de vlag aan staat (U38, samen met een client die alleen getoonde
  velden prefetcht). Met de vlag uit ruimt de daemon de CAMS-chunks na de prune-leeftijd op.
- **ADS-sleutel, wat de PO moet doen** (docs/pollen.md §"Wat de PO moet regelen"):
  1. ECMWF-account aanmaken/inloggen op https://ads.atmosphere.copernicus.eu;
  2. op https://ads.atmosphere.copernicus.eu/datasets/cams-europe-air-quality-forecasts?tab=download
     de licentie "Licence to use Copernicus Products" accepteren (anders HTTP 403);
  3. API Token kopiëren van https://ads.atmosphere.copernicus.eu/profile;
  4. `ADS_API_KEY=<token>` toevoegen aan `.env` (dev-host) en `/var/lib/motregen/secrets.env`
     (productie; EnvironmentFile van ingest én motregen-cams).
  Daarna: `motregen-cams --provider ads --record <pad>` en de fixture vervangen door die echte download.
- Zonder sleutel gebruikt productie Open-Meteo (alleen niet-commercieel); `MOTREGEN_CAMS_PROVIDER=ads` maakt het hard.

## 2026-09-25 — gates op gerebasete head (op c719a82)
- Head 0b1495b: CARGO-TEST-EXIT 0, CLIPPY-EXIT 0, FMT-EXIT 0, FLAKE-CHECK-EXIT 0.
  Repro: `cargo test --workspace; cargo clippy --workspace --all-targets -- -D warnings;
  cargo fmt --all --check; nix flake check -L` (elk met `; echo "<GATE>-EXIT: $?"`).
