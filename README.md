# motregen

**[motregen.nl](https://motregen.nl)**: regen in Nederland, rechtstreeks uit de
open data van het KNMI. Gratis, zonder reclame en open source.

Voor iedereen die wil weten of het droog blijft: op de fiets, voor de was, voor
een wandeling. Kies een plek of gebruik je locatie en schuif door de tijd.

## Eén tijdlijn

Eén schuif loopt van wat er gevallen is, via wat er de komende uren valt, naar
de verwachting voor morgen. Je hoeft niet te wisselen tussen radar en
verwachting.

- **Radar**: gemeten neerslag van de KNMI-radar, elke 5 minuten, voor de
  afgelopen uren.
- **Nowcast**: de KNMI-neerslagverwachting voor de komende 2 uur.
- **Model**: HARMONIE-AROME van het KNMI, tot een etmaal vooruit. Het levert
  ook temperatuur, gevoelstemperatuur, wind, luchtvochtigheid en bewolking.
- **UV**: de UV-index van het KNMI, inclusief bewolking.

De kaart toont de regen als vloeiende WebGL-laag, met wind, temperaturen per
regio en zon waar het opklaart. Voor jouw plek zie je een regengrafiek en een
overzicht per uur. De kaartdata komt van
[OpenFreeMap](https://openfreemap.org) en
[OpenStreetMap](https://www.openstreetmap.org/copyright).

Er is geen tracking. Je locatie en favorieten blijven in je eigen browser.

## Zelf draaien

Nodig: [devenv](https://devenv.sh) met direnv. Die leveren Rust, Node/pnpm en
de systeembibliotheken (eccodes, HDF5).

```sh
direnv allow                       # of: devenv shell

# ingest: haalt KNMI-data op en publiceert binaire frames in ./data
echo 'KNMI_OPEN_DATA_API_KEY=…' > .env
cargo run --release -p motregen-ingest

# dataserver voor ./data op :8080
caddy run --config Caddyfile.dev

# frontend
cd web
pnpm install
pnpm dev                           # MOTREGEN_SYNTH=1 pnpm dev draait op synthetische data
```

Een API-key vraag je gratis aan op het
[KNMI Data Platform](https://developer.dataplatform.knmi.nl/).

Tests: `cargo test --workspace`, en in `web/`: `pnpm test` en `pnpm e2e`.

## Documentatie

Achtergrond staat in [`docs/`](docs/): de KNMI-datasets
([radar](docs/radar.md), [HARMONIE-AROME](docs/arome.md),
[velden](docs/fields.md)), het frameformaat ([mrf](docs/mrf.md),
[contract](docs/contract.md)), het ingestproces ([ingest](docs/ingest.md)),
performance ([perf](docs/perf.md)) en uitrol ([deploy](docs/deploy.md)).
