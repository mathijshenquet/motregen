# Pollen en luchtkwaliteit (CAMS)

Er is geen KNMI-pollenradar (MIP-14). De bron is de **CAMS European air quality
forecast** van Copernicus: de mediaan van een Europees modelensemble, op
0,1°, uurlijks, 00 UTC-run tot +96 u. We publiceren acht velden:

| field | CAMS-variabele (ADS) | eenheid | seizoen (KNMI/LUMC) |
| --- | --- | --- | --- |
| `pollen_alder` | `alder_pollen` | korrels/m³ | jan–mrt |
| `pollen_birch` | `birch_pollen` | korrels/m³ | apr–mei |
| `pollen_grass` | `grass_pollen` | korrels/m³ | mei–aug |
| `pollen_mugwort` | `mugwort_pollen` | korrels/m³ | jul–sep |
| `pm25` | `particulate_matter_2.5um` | µg/m³ | heel het jaar |
| `pm10` | `particulate_matter_10um` | µg/m³ | heel het jaar |
| `no2` | `nitrogen_dioxide` | µg/m³ | heel het jaar |
| `o3` | `ozone` | µg/m³ | heel het jaar |

Olijf en ambrosia bestaan in CAMS maar zijn voor Nederland irrelevant en worden niet
opgehaald.

## Wat de PO moet regelen: ADS-sleutel

1. Maak een ECMWF-account aan en log in op de Atmosphere Data Store:
   <https://ads.atmosphere.copernicus.eu> (rechtsboven "Login / Register").
2. Open de dataset
   <https://ads.atmosphere.copernicus.eu/datasets/cams-europe-air-quality-forecasts?tab=download>,
   scrol naar **Terms of use** en accepteer **"Licence to use Copernicus Products"**. Zonder
   deze stap geeft de API HTTP 403 (de ingest meldt dan precies dat).
3. Kopieer de **API Token** van je profielpagina
   <https://ads.atmosphere.copernicus.eu/profile> (een UUID-achtige string; het oude
   `UID:KEY`-formaat van de vorige ADS werkt niet meer).
4. Zet hem op één regel in:
   - dev-host: `.env` in de repo-root (`ADS_API_KEY=<token>`), naast `KNMI_OPEN_DATA_API_KEY`;
   - productie: `/var/lib/motregen/secrets.env` (root, 0600), zelfde regel. Dat bestand is de
     `EnvironmentFile` van zowel `motregen-ingest` als `motregen-cams`.

Een `~/.cdsapirc` is niet nodig; de ingest praat zelf met de API.

Zonder sleutel valt `motregen-cams` terug op Open-Meteo (hieronder). Wil de PO dat
productie zonder sleutel géén pollen publiceert, zet dan
`MOTREGEN_CAMS_PROVIDER=ads` in `secrets.env`: de job faalt dan hard zonder sleutel.

## Het ADS-verzoek

`POST https://ads.atmosphere.copernicus.eu/api/retrieve/v1/processes/cams-europe-air-quality-forecasts/execution`
met header `PRIVATE-TOKEN: <ADS_API_KEY>` en body `{"inputs": …}`:

```json
{
  "variable": ["mugwort_pollen", "particulate_matter_2.5um", "particulate_matter_10um",
               "nitrogen_dioxide", "ozone"],
  "model": ["ensemble"],
  "level": ["0"],
  "date": "2026-09-25/2026-09-25",
  "type": ["forecast"],
  "time": "00:00",
  "leadtime_hour": ["0", "1", "…", "96"],
  "data_format": "grib",
  "area": [53.9, 2.2, 50.2, 7.6]
}
```

`variable` bevat alleen de pollensoorten waarvan minstens één lead in het seizoen valt
(voorbeeld: 25 september → alleen bijvoet). Daarna pollt de job
`GET …/retrieve/v1/jobs/{jobID}` elke 10 s tot `successful` (maximaal 90 min), haalt
`GET …/jobs/{jobID}/results` → `asset.value.href`, downloadt de GRIB naar
`<data>/.ingest-cache/cams/<YYYYMMDDTHH>.grib2` en ruimt de job op met
`DELETE …/jobs/{jobID}`. Endpoints volgen de officiële `ecmwf-datastores-client`;
request-vorm en GRIB-codering volgen Open-Meteo's eigen CAMS-downloader.

### GRIB-codering

GRIB2, product-definitietemplate 40 (chemische bestanddelen), discipline 0, categorie
20. Velden worden herkend aan (`parameterNumber`, `constituentType`):

| field | parameterNumber | constituentType | eenheid in GRIB |
| --- | ---: | ---: | --- |
| `pollen_alder` | 59 | 62100 | m⁻³ |
| `pollen_birch` | 59 | 62101 | m⁻³ |
| `pollen_grass` | 59 | 62300 | m⁻³ |
| `pollen_mugwort` | 59 | 62201 | m⁻³ |
| `pm25` | 0 | 40009 | kg m⁻³ (×10⁹ → µg/m³) |
| `pm10` | 0 | 40008 | kg m⁻³ |
| `no2` | 0 | 5 | kg m⁻³ |
| `o3` | 0 | 0 | kg m⁻³ |

Een onbekende combinatie is een fout, geen stille skip. Na decoderen controleert de job
per veld de domeinmediaan (≤ 50 000 korrels/m³, ≤ 1000 µg/m³); een eenheidsfout van 10⁹
valt daardoor op in plaats van als onzin gepubliceerd te worden.

### De ADS-fixture

`crates/ingest/tests/fixtures/cams-ads-20260925T00-l0-24.grib2` (772 KB) is sinds 2026-09-25 22:10 UTC
een **echte ADS-download** (run 2026-09-25 00Z, gebied 53,9 N–50,2 N / 2,2 O–7,6 O, 54×37, grid_simple),
opgenomen met `motregen-cams --provider ads --record …` en met eccodes teruggesneden tot de leads
0–24 (125 berichten; de volledige download had 0–96 en 3 MB). De eerdere synthetische fixture
(Open-Meteo-waarden in ADS-codering) is daarmee vervangen; `cargo test -p motregen-ingest cams` → 12/12.

## Terugval zonder sleutel: Open-Meteo

`https://air-quality-api.open-meteo.com/v1/air-quality` met `domains=cams_europe`,
`timezone=GMT`, `start_hour`/`end_hour` = run … run+96 u, voor een 0,1°-rooster van
50,2–53,9 N × 2,2–7,6 E (55×38 = 2090 punten). De run komt uit
`/data/cams_europe/static/meta.json` (`last_run_initialisation_time`). Open-Meteo telt
elke locatie als één call: 100 locaties per verzoek met 12 s pauze blijft onder hun
600/min; één run kost ~2100 van de 10 000 calls per dag en duurt ~4 minuten. Bij HTTP 429
wacht de job 65 s (max. 5 pogingen). Open-Meteo's gratis API is alleen voor
niet-commercieel gebruik.

## Van 0,1° naar het kaartgrid

- **Grid** `cams::CAMS_GRID`: EPSG:3857, 6 km-cellen uitgelijnd op het bestaande 6 km-uurgrid
  (`DETAIL_GRID`), uitsnede NL + Vlaanderen: `x0 = 258 000`, `y0 = 7 132 000`, 96×105 cellen
  (celranden 2,32–7,49 O, 50,32–53,80 N). Alle celcentra hebben vier CAMS-buren.
- **Herprojectie**: bilineair in lon/lat uit de vier omliggende 0,1°-punten; een cel buiten
  het bronraster wordt no-data.
- **Kwantisatie** (8 bit, index 255 = no-data):
  - pollen: index 0 = 0; 1…254 logaritmisch 0,1 → 10 000 korrels/m³ (≈ 4,7 % per stap);
    waarden < 0,05 worden 0.
  - µg/m³-velden: 0–100 in stappen van 0,5 (index 0…200), daarna 105–370 in stappen van 5.
- **Codec**: `pred` (verliesvrij predictief, docs/mrf.md) op alle CAMS-velden: op de fixture
  443 483 → 239 131 B (−46 %).

## Chunks, seizoen en manifest

Per veld vier chunks van 24 leads (`cams-<field>-<YYYYMMDDTHH>-l1-24`, `l25-48`, `l49-72`,
`l73-96`), source `cams`, run = 00 UTC. Lead 0 wordt niet gepubliceerd, net als bij
HARMONIE. Een pollenchunk zonder één frame in het seizoen van de soort wordt niet
gemaakt (de bytes bestaan dan niet); buiten alle seizoenen (okt–dec) publiceert CAMS dus
alleen de vier luchtkwaliteitsvelden. Live op 25 september 2026 (Open-Meteo): 20 chunks,
911 390 B.

`motregen-cams` is een oneshot. Hij schrijft de chunks naar `<data>/chunks/` en daarna
atomair `<data>/cams.json` (run, provider, licentie, manifest-entries). De ingest-daemon
leest dat bestand bij elke poll (alleen opnieuw als het verandert), controleert elke
chunk tegen zijn entry en neemt ze op in `manifest.json`, met de sectie

```json
"cams": {
  "run": "2026-09-25T00:00:00Z",
  "provider": "ads",
  "license": "Contains modified Copernicus Atmosphere Monitoring Service information"
}
```

**Standaard staat opname in het manifest uit** (`MOTREGEN_CAMS_IN_MANIFEST=true` of NixOS
`services.motregen.camsInManifest = true` zet hem aan). Reden, gemeten op 25 september: de
huidige client haalt bij elke manifest-load de header van *elke* chunk op (`App.tsx`), en
het manifest wordt gepolld. CAMS voegt 20 chunks toe: +63 262 B headers per sessie (prod:
27 chunks, 103 263 B) en +18,5 KB per manifest (prod: 26 318 B). Zolang geen client de velden
gebruikt is dat pure last. Voorstel voor U38: of de client prefetcht alleen headers van
velden die hij toont en de vlag gaat aan, of `cams.json` wordt als eigen, op-aanvraag
geladen manifest geserveerd (MIP-14: "elke extra kolom = data-op-aanvraag") en het
hoofdmanifest krijgt alleen de `cams`-sectie.

Een run ouder dan 72 uur valt uit het manifest; de chunks worden daarna gewoon gepruned.
Caddy serveert `cams.json` niet (alleen `manifest.json` en `chunks/`).

## Licentie en attributie

CAMS-data valt onder de Copernicus-licentie (gratis, ook commercieel). Attributie is
verplicht: **"Contains modified Copernicus Atmosphere Monitoring Service information"**
(plus jaartal als we het netjes willen: "… information 2026"). De string reist mee in het
manifest; de About-regel volgt in U38 ("niet alles is meer rechtstreeks van het KNMI").

## Draaien

```sh
cargo run --release -p motregen-ingest --bin motregen-cams            # ADS als ADS_API_KEY er is, anders Open-Meteo
cargo run --release -p motregen-ingest --bin motregen-cams -- --provider open-meteo
cargo run --release -p motregen-ingest --bin motregen-cams -- --grib crates/ingest/tests/fixtures/cams-ads-20260925T00-l0-24.grib2
```

| vlag | env | standaard |
| --- | --- | --- |
| `--data-dir` | `MOTREGEN_DATA_DIR` | `data` |
| `--ads-api-key` | `ADS_API_KEY` (ook uit `.env`) | — |
| `--provider auto\|ads\|open-meteo` | `MOTREGEN_CAMS_PROVIDER` | `auto` |
| `--run YYYY-MM-DD` | — | vandaag (UTC) |
| `--grib <pad>` | `MOTREGEN_CAMS_GRIB` | — (decodeer een opgenomen GRIB) |
| `--record <pad>` | — | `<data>/.ingest-cache/cams/…` |

In NixOS draait `motregen-cams.service` via `motregen-cams.timer` elke dag om 09:00 UTC
(`Persistent=true`), als dezelfde dynamische user als de ingest. ADS publiceert de 00Z-run
rond 08–10 UTC; mislukt een poging, dan probeert systemd het na 30 minuten opnieuw.
