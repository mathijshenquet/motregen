# U39 pollen-ingest (CAMS) — worker LOG (append-only, newest last)

## 2026-09-25 23:10 — start, ontwerp
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
