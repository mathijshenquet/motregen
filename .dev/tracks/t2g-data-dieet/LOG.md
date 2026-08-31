# T2g data-dieet — werklog

## 2026-08-31T13:53:29Z — start en contractkaders

- Doel: de live `data/chunks`-werkset byte-voor-byte verklaren, veilige server-side resolutiewinsten implementeren en contractwijzigingen uitsluitend als concept-MIP voorleggen.
- Werkboom `track/t2g-data-dieet` was schoon op `50c62d0`; direnv heeft de project-`.envrc` toegestaan en de devenv is actief.
- Gelezen: trackspecificatie, `AGENTS.md`, MIP-2, MIP-4, `docs/perf.md`, `docs/grid.md`, `docs/mrf.md`, `docs/fields.md`, `docs/ingest.md` en `docs/contract.md`.
- Kaders: regen blijft op het 1km-grid; MIP-2 houdt v0 intra-only en `dict: null`; MIP-4 staat gereduceerde uurveldgrids toe. Frontend- en contractwijzigingen zijn buiten scope.
- Live invoer wordt alleen gelezen uit `/home/mthq/motregen/data/chunks`; meetwerk gebeurt op kopieën of afgeleide data in een lokale tijdelijke map.
- Volgende stap: manifest/chunks inventariseren, mrf-frames decoderen en een reproduceerbare analyse voor veldgrootte, no-data, subsampling, dictionary, delta en sessietransfers bouwen.

## 2026-08-31T14:04:00Z — PO-richtlijn spatial scale

- Expliciete PO-call: bewolking en relatieve vochtigheid horen over een grotere ruimtelijke schaal geïntegreerd te worden; overtuigend grof maken is inhoudelijk correct, niet slechts een kwaliteitscompromis.
- Implementatierichting: `cloud_frac` en `rel_humidity` block-averagen vóór kwantisatie; straling op gebruiksdoel beoordelen. Regen blijft onaangeraakt hoogfrequent. Wind blijft een afzonderlijke, conservatieve keuze op basis van particle-fout en visuele verificatie.

## 2026-08-31T14:34:22Z — live meting en veilige implementatie

- Live snapshot vastgezet op manifest `generated=2026-08-31T13:52:05Z`: 12 chunks / 21.904.585 B; regen 10.456.776 B, zeven uurvelden 11.235.449 B, UV 212.360 B. Bronmap bleef read-only; alleen manifest-referenties zijn naar `/tmp/motregen-t2g-live.xYokSv` gekopieerd.
- Reproduceerbare analyzer toegevoegd (`crates/mrf/examples/data_diet.rs`). Uitkomst: dictionary inclusief ruwe dictbytes +605.943 B (+2,8%); regen-XOR/subtractiedelta beide circa +4,21 MB (+40,8…40,9%); dus geen van beide heropenen.
- Natural Earth 1:10m landmasker: 43,56% van het gedeelde grid is zee. NL+100km-crop afgewezen: veilig uurvelddoel is al haalbaar en crop zou geldige locaties buiten de buffer verwijderen.
- Browserpad tweemaal byte-exact: passief 17.096.316 B chunks / 21.498.845 B CDP; na 122-frame scrub 17.768.318 B / 22.170.607 B; scrubdelta 672.002 B chunks, 0 browserfouten. Exacte run: `cd web && devenv shell pnpm exec tsx scripts/measure-session.ts http://127.0.0.1:4186` tegen Caddy op de snapshot.
- Gekozen: temperatuur/gevoel/wind 6km, straling 8km, RH/bewolking 16km, altijd blockgemiddelde in fysieke eenheden vóór kwantisatie. Gemeten uurveldprojectie 1.921.863 B (−82,9%); regen blijft 1km en UV 5km.
- Implementatie plus unit-tests en documentatie toegevoegd; concept-MIP-8 bevat uitsluitend de contract/client-opties.
- Receipts: `devenv shell cargo test -p motregen-ingest` → 19 tests + doctests green, exit 0. `devenv shell cargo fmt --all -- --check && devenv shell cargo clippy --workspace --all-targets -- -D warnings` → exit 0. `cd web && pnpm build` → exit 0 na typefix van de meetscript-callbacks.
- Niet-receipts/voorvallen: ambient `cargo fmt` miste rustfmt (exit 101; devenv-wrapper gebruikt); eerste meervoudige cargo-testfilter was ongeldige CLI (exit 1); Playwright moest via `devenv shell` voor Nix-libs. Geen daarvan heeft een gatefout verhuld.
- Volgende stap: commit/push en vroege draft-PR; daarna echte 24u-ingest naar geïsoleerde data-dir, exacte voor/na-chunks en frontend-e2e tegen de nieuwe grids.

## 2026-08-31T14:58:33Z — daemon/e2e- en volledige gatereceipts

- Vroege draft-PR geopend: https://github.com/mathijshenquet/motregen/pull/18 op commit `6384774`.
- Geïsoleerde echte run: `devenv shell cargo run --release -p motregen-ingest -- --once --data-dir /tmp/motregen-t2g-new` → exit 0. Verwerkte AROME 11Z (24 frames), RTCOR 36, nowcast 25, seamless 48 en UV 37; manifest atomair gepubliceerd met 12 chunks.
- Werkelijke nieuwe grids/bytes: temp 209×225@6km 296.388 B; feels 296.428; wind U 439.326; wind V 387.430; radiation 157×169@8km 215.637; RH 79×85@16km 120.252; cloud 124.896. Uurvelden totaal **1.880.357 B** versus baseline **11.235.449 B** (−83,3%). Alle regen 1250×1350@1km, UV 250×270@5km en alle dictvelden null.
- Alle 12 nieuw gegenereerde chunks synchroon door `devenv shell cargo run --quiet -p mrf -- inspect CHUNK` gehaald → exit 0.
- Nieuw-data browserpad via Caddy/Vite: passief 6.841.689 B chunks; volledige 124-frame scrub 6.976.263 B; scrubdelta 134.574 B Resource Timing; 0 console-/page-/requestfouten. Eerste poging liep alleen tegen de 30s analysetimeout; op 120s voltooide dezelfde unsupported fallback-browser. TTFR 37,1s niet als perfbewijs gebruikt.
- Volledige gates: `devenv shell cargo test --workspace` → alle suites green incl. echte GRIB-conformance en HDF5-crosschecks, exit 0; `cd web && pnpm test` → 19 files / 58 tests green, exit 0; `pnpm typecheck` → exit 0; `devenv shell pnpm e2e` → 1 journey green, cold 462,8 ms, warm 502,7 ms, 23/83 scrubrequests, 1.310.219 B sessie, exit 0.
- Eerdere volledige fmt/clippy-receipt blijft geldig na alleen Markdown + TypeScript-timeoutwijziging; finalerun volgt na de log/doccommit.
- Volgende stap: final fmt/clippy/typecheck, commit/push, PR-beschrijving bijwerken en schone werkboom verifiëren.

## 2026-08-31T14:59:30Z — finale statische gates

- `devenv shell cargo fmt --all -- --check && devenv shell cargo clippy --workspace --all-targets -- -D warnings` → exit 0.
- `cd web && pnpm typecheck` → exit 0.
- Alle vereiste lokale gates zijn nu synchroon green; alleen commit/push/remote-verificatie resteert.
