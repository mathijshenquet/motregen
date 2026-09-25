# U37 wolkendoorsnede — LOG (worker: claude opus 5.5)

## 2026-09-25 — start
- Branch `track/u37-wolkendoorsnede` op c44fb22 (main). devenv: `direnv allow` moet buiten de
  sandbox; env gedumpt naar scratch en daarna `source`d.
- GRIB-check op `data/HA43_N20_202608281200_00100_GB` (grib_ls): param 73/74/75, `sfc`, level 0,
  tri 0, tabel 253, min ~3e-5, max 1 → fractie laag/midden/hoog; 71 = totaal (bestaand).
- U35 (pressure_hpa) volgt hetzelfde patroon in knmi-grib + pipeline; conflicten verwacht in
  `AromeFields`/`DecodedArome`/`hourly_field_chunks` — ik houd mijn hunks klein en aangrenzend.

## 2026-09-25 — ingest
- knmi-grib: params 73/74/75 → `low/medium/high_cloud_cover`; pipeline: `cloud_layers: [_; 3]`,
  zelfde gather + integratie ×8 (SUMMARY_GRID 79×85) als `cloud_frac`, eigen tabel 5 %-stap
  (`linear_quantization_table(0, 5)`, index 0–20). Chunks `cloud_low|mid|high` naast de andere
  uurvelden (ook `hist<n>`, want dezelfde `hourly_field_chunks`).
- Test `crates/knmi-grib/tests/cloud_layers.rs` op het echte +1-lid (niet geskipt: `data` als
  symlink naar de hoofdcheckout, niet gecommit): alle drie 0–1, vol ergens, en nooit meer dan
  de totale bewolking.
- Receipt: `RUSTC_WRAPPER= cargo test -p knmi-grib -p motregen-ingest` → CARGO-EXIT: 0
  (knmi-grib 1+1+1, ingest 23+3). `cargo fmt --check` → 0.

## 2026-09-25 — client + stills
- `web/src/core/cloud-section.ts`: `cloudDrawParams` (fractie → opacity 0,9·f, dikte 0,18+0,82·√f,
  rafeligheid 4f(1−f): gebroken bewolking rafelt het meest) en `cloudBand` (gesloten SVG-paden per
  bewolkt stuk, rand = deterministische value-noise op epoch, horizontaal opacity-verloop per uur).
  Karakter per laag: laag = stapelwolken (bolle toppen, vlakke basis), midden = deken, hoog = dunne
  cirrussliert. Zachte rand via feGaussianBlur 0,9. Grijstinten als thematokens `--cloud-*`.
- Scrubber: prop `clouds` (alleen in de weermodus = geen gepinde focus). A (`clouds-replace`):
  doorsnede 62 % van de plot, regen eronder op halve breedte, zonder regengidsen, met laaglabels.
  B (`clouds-strip`): strook van 34 px, histogram eronder op de rest van de hoogte.
- App: `?dev` → Kaart → Scrubber (regen / A / B), opslag `motregen-scrubber-view` (reset wist hem).
  De drie lagen laden alleen als de weergave aanstaat: `fetchPayload` per chunk + puntreeks, lage
  prioriteit. `docs/dev-opties.md` bijgewerkt (eigenaar U37, vervalt bij PO-keuze).
- synthgen: warmtefront bij De Bilt (cirrus → midden → laag boven de synthetische regen +4…+7 u);
  bestaande chunks byte-identiek, nieuwe `cloud_*`-chunks met `git add -f` (zoals de andere).
- Stills (desktop, licht/donker): `.dev/tracks/u37-wolkendoorsnede/stills/u37-clouds-{replace,strip}-{light,dark}.png`.
- Receipts (synchroon):
  - `pnpm typecheck` → TYPECHECK-EXIT: 0; `pnpm test` → TEST-EXIT: 0 (46 bestanden, 298 tests);
    `pnpm build` → BUILD-EXIT: 0.
  - `RUSTC_WRAPPER= cargo test --workspace` → CARGO-EXIT: 0.
  - `MOTREGEN_E2E_PORT=4377 MOTREGEN_E2E_DATA_PORT=8377 pnpm e2e e2e/cloud-section.spec.ts
    e2e/dev-panel.spec.ts --project desktop` → E2E-EXIT: 0 (2 passed); load 2,6.
