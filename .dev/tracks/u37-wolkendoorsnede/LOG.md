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
