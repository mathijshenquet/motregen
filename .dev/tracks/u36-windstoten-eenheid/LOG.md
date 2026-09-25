# U36 LOG — windstoten + eenheidsinstelling (worker: claude opus 5.5)

## 2026-09-25 — start
- Branch track/u36-windstoten-eenheid op main c44fb22 (spec: .dev/specs/track-u36-windstoten-eenheid.md).
- Plan: (1) knmi-grib: 162/163 @10m TRI 2 decoderen; (2) ingest: uurveld gust_ms = |(162,163)|, 0,5 m/s tot 60;
  (3) web: summarizeWind per eenheid + stoot; (4) About-instelling motregen-wind-unit; (5) baken-veld unit.

## 2026-09-25 — ingest gust_ms (f69790f)
- grib_ls op het echte run-2026082812: 162/163 @ sfc 10 m, TRI 2, +0 stap 0–0, +1 stap 0–1 → max over het uur.
- knmi-grib decodeert ze verplicht (zoals de andere velden); pipeline: |(u,v)| per AROME-cel → gather →
  6 km-blokgemiddelde (factor 3, zelfde als wind) → tabel 0..127 m/s stap 0,5. De mrf-tabel eist 255
  stijgende waarden, dus "tot 60" = het bruikbare bereik; boven 60 ongebruikt (docs/fields.md).
- Conformance-test op het echte +1-lid: stoot ≥ wind in ≥99% van de cellen, alles in 0..60.
- Receipts: `direnv exec . cargo test --workspace` → CARGO-EXIT: 0;
  `cargo test -p knmi-grib --test conformance gusts` (met data/-symlink naar main) → CARGO-EXIT: 0.
