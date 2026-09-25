# Track U39 — pollen (en luchtkwaliteit) inladen uit CAMS, met gratis API-sleutel (claude opus 5.5)

Read first: `AGENTS.md`, `.dev/proposals/0014-kolommen-en-extra-lagen.md`, `crates/ingest/src/`
(pipeline, chunking, manifest), `docs/ingest.md`, `docs/contract.md`, `.env`-gebruik voor de
KNMI-sleutel (nooit committen). LOG: `.dev/tracks/u39-pollen-ingest/LOG.md`. Branch
`track/u39-pollen-ingest` vanaf main. Eigen worktree. Ingest-only track: geen UI (die volgt in
de kolomconfiguratie-track U38).

## Bron

**CAMS European air quality forecasts** (Copernicus Atmosphere Monitoring Service), dataset
`cams-europe-air-quality-forecasts` in de Atmosphere Data Store (ADS): variabelen
`alder_pollen`, `birch_pollen`, `grass_pollen`, `mugwort_pollen`, `olive_pollen`,
`ragweed_pollen` (grains/m³) plus `particulate_matter_2.5um`, `particulate_matter_10um`,
`nitrogen_dioxide`, `ozone` (µg/m³); 0,1°-raster, uurlijks, 4 dagen vooruit, ensemble-mediaan;
gratis na registratie (ADS-account + API-sleutel, `~/.cdsapirc`/`ADS_API_KEY` in `.env`).
Terugvalbron zonder sleutel voor ontwikkeling: Open-Meteo air-quality API (zelfde CAMS-data,
punt- of rasterverzoeken, geen sleutel, rate-limit 10k/dag).

De PO vraagt de ADS-sleutel aan; tot die er is bouw en test je tegen Open-Meteo én tegen een
opgenomen ADS-fixture (documenteer het exacte ADS-request in `docs/pollen.md`).

## Opdracht

1. Nieuwe ingestbron `cams` naast KNMI: één run per dag (ADS publiceert ~08:00 UTC), NL+
   Vlaanderen-uitsnede, naar het 6 km-uurraster (bilineair uit 0,1°), velden `pollen_birch`,
   `pollen_grass`, `pollen_alder`, `pollen_mugwort` (grains/m³, kwantisatie log-schaal, 8 bit),
   `pm25`, `pm10`, `no2`, `o3` (µg/m³, 8 bit). Chunking/codec zoals de uurvelden; manifest-
   sectie `cams` met run-tijd en licentie-string (CAMS-attributie is verplicht: "Contains
   modified Copernicus Atmosphere Monitoring Service information").
2. Seizoenslogica: buiten het seizoen van een soort (KNMI/LUMC-kalender: els jan–mrt, berk
   apr–mei, gras mei–aug, bijvoet jul–sep) het veld niet publiceren (bytes).
3. Nix: secret via `.env`/EnvironmentFile zoals de KNMI-sleutel; systemd-timer 09:00 UTC;
   NixOS-test met fixture.
4. Docs: `docs/pollen.md` (bron, request, licentie, kalender), About krijgt later de
   attributieregel (U38).
5. Tests: `cargo test` op de herprojectie en kwantisatie; fixture-run; `nix flake check`.

## Gates

`cargo test`, `nix flake check`, synchrone exit statussen in de LOG. Draft-PR vroeg. Geen
client-wijzigingen.
