# Regiobestanden (MIP-40)

De ingest schrijft met `--regions` (`MOTREGEN_REGIONS=true`, nix: `services.motregen.regionsInManifest`) per groep en
per regio één bestand met de puntreeksen van alle gridcellen die een plek in die regio leest. De client haalt bij
openen en bij een locatiekeuze zijn 3–4 regiobestanden op in plaats van tientallen hele rasters te decoderen.
Besluit en metingen: MIP-40; meting van deze bouw: `docs/perf/u102/regiobestanden-fase1-2026-11-09.md`.
Code: `crates/ingest/src/regions.rs`.

## Regioraster

Het NL+VL-kader van het 6 km-detailgrid in EPSG:3857, x 258.000–834.000 m, y 6.502.000–7.132.000 m, in 14 kolommen ×
15 rijen (≈ 25 km echt). Regio `id = rij × 14 + kolom`, met

```
kolom = min(13, floor((x − west) / ((east − west) / 14)))
rij   = min(14, floor((north − y) / ((north − south) / 15)))
```

voor `west ≤ x < east` en `south < y ≤ north`; daarbuiten is er geen regio. Alleen de 148 regio's met een plaats uit
de plaatsenlijst krijgen een bestand (`present` in het manifest, A3); de lijst staat in
`crates/ingest/src/regions/land.json` en komt uit `web/scripts/regio-land.ts`. Een plek buiten het kader, in een
regio zonder bestand of met een 404 valt terug op het huidige pad (rasters).

## Groepen

| groep | bronnen | ververst (prod-standaard) |
| --- | --- | --- |
| `radar` | `rtcor`, `nowcast`, `seamless` | elke 5 min (nieuwe RTCOR) |
| `harmonie` | `harmonie` (alle runs in het manifest), behalve `pressure_hpa` en `rel_humidity` | bij een nieuwe run (controle elke 3 u) |
| `extra` | `uv` (UV en UV onbewolkt), `icon_d2` | elke 15 min (UV) |
| `ecmwf` | `ecmwf` (dag- en stapvelden) | twee keer per dag |

Elke groep bevat nu **alle frames van al zijn chunks**, niet een gekozen tijdlijn: de client bouwt zijn tijdlijn zoals
nu (`buildTimeline`) en leest dan (chunk, frame, cel) uit het regiobestand in plaats van uit het raster. De client
zoekt per chunk; wat een bestand niet heeft, leest hij uit het raster (zie [Client](#client)).

Luchtdruk (alleen isobaren op de kaart) en luchtvochtigheid (niet in `SHOWN_FIELDS`) leest geen puntlezer en zitten
er niet in.

## Welke cellen

Per chunk het venster van cellen die `floor((x − x0) / dx)`, `floor((y − y0) / dy)` voor een punt in de regio
oplevert, met een marge:

- `rain_rate`: 17 cellen (`WARP_CAP_CELLS` + 2): de regenpatch van `rainPatch` voor de tussenbalken;
- overige velden: 1 cel, voor bilineair lezen (`pointValueBilinear`, ECMWF en dagvelden);

afgekapt op de rand van het raster. Heeft de chunk bewegingsvelden, dan ook de bewegingsblokken die `motionAtPatch`
voor een punt in de regio leest (2 × 2 blokken rond elke plek), voor elk frame met een bewegingsveld.

## Bestandsformaat `mrr1`

```
"mrr1" (4 B) | zstd-frame( u32 LE koplengte | kop (JSON) | payload )
```

Eén zstd-frame op niveau 19, met inhoudsgrootte. Kop:

```json
{ "version": 1, "group": "radar", "region": 37,
  "chunks": [ { "url": "chunks/rtcor-….mrf", "source": "rtcor", "field": "rain_rate", "run": "…",
                "table": "<16 hex>", "window": { "column": …, "row": …, "width": …, "height": … },
                "frames": 36, "frame_indexes": [0, 3, 6, …], "offset": 0,
                "motion": { "grid": { "bw": …, "bh": … }, "window": { … }, "frames": [1, 2, …], "offset": … } } ] }
```

- Waarden: vanaf `offset` per cel van het venster, rij voor rij, `frames` bytes in tijdvolgorde. De byte van
  chunkframe `f` in rastercel (k, r) staat op `offset + ((r − row) × width + (k − column)) × frames + s`, met `s` de
  positie van `f` in `frame_indexes`, of `s = f` zonder die lijst (alle frames, zoals de ingest nu schrijft). Het zijn
  dezelfde gekwantiseerde bytes als in het raster.
- Beweging: vanaf `motion.offset` per frame uit `motion.frames`, per blok van het blokvenster (rij voor rij) twee
  i8 (x, y), zoals in de mrf-bewegingsmember.
- `table` verwijst naar het tabellenbestand.

## Tabellenbestand

`regions/tables-<hash>.json` = `{ "version": 1, "tables": { "<id>": { "grid": {…}, "quant": […] } } }`: grid en
kwantisatietabel per chunkgeneratie. Ze veranderen alleen als de generatiesuffix van een chunknaam verandert. Staan
ze in elk regiobestand, dan kosten ze ~600 B per chunk per bestand. De naam is de hash van de inhoud, dus het bestand
is immutable; het is nu 30 kB (6 kB met zstd) en wordt maar één keer opgehaald.

## Manifestsectie

```json
"regions": { "version": 1, "crs": "EPSG:3857", "west": 258000, "east": 834000, "north": 7132000, "south": 6502000,
             "columns": 14, "rows": 15, "present": [11, 12, …], "tables": "regions/tables-<hash>.json",
             "groups": [ { "name": "radar", "url": "regions/radar-<16 hex>/", "chunks": ["chunks/rtcor-….mrf", …] } ] }
```

Het bestand van regio `id` is `<url><id>.mrr`.

- **Generaties.** Een generatie heet naar zijn chunks (blake3 van formaatversie, groep, raster en chunk-URL's), dus
  dezelfde chunks geven dezelfde map; Caddy serveert hem immutable (`/data/regions/…`).
- **Schrijven.** De ingest schrijft eerst de map (via `.staging-…` en een rename), dan het manifest.
- **Mislukte groep.** Die valt uit de sectie; het manifest gaat gewoon door.
- **Opruimen.** Per groep en voor de tabellen blijven de nieuwste en de vorige staan (A5). Een client met een manifest
  van twee generaties terug krijgt een 404 en valt terug.

## Client

`web/src/core/region-points.ts`. Staat er een sectie `regions` (versie 1) in het manifest, dan vraagt de client voor
een plek per chunk het stuk regiobestand op (één fetch per groepsbestand, plus één keer het tabellenbestand) en leest
daaruit wat hij anders uit het gedecodeerde raster las:

| lezer | gebruikt voor | raster | regiobestand |
| --- | --- | --- | --- |
| `pointValue` | histogram, tabel (`readPointSeries`) | `point-value.ts` | `RegionChunk.value` |
| `pointValueBilinear` | dagenlijst (ECMWF) | `point-value.ts` | `RegionChunk.bilinear` |
| `rainPatch` | tussenbalken in het histogram | `rain-point-detail.ts` | `RegionChunk.patch` |
| `motionAtPatch` op het bewegingsveld | tussenbalken | `MrfClient.getMotion` | `RegionChunk.motion` |

Elke lezer geeft `undefined` als het bestand die cel, dat frame of dat bewegingsblok niet heeft, en dan leest de
client het raster zoals vóór MIP-40. Dat geldt ook voor een plek buiten het kader of in een regio zonder bestand, een
chunk die in geen groep staat en een 404 (oud manifest). Kleinere marges, minder frames (`frame_indexes`) of minder
chunks per groep vragen dus geen clientwijziging; ze verschuiven alleen werk terug naar de rasters. Een nieuwe
`version` laat de client de sectie negeren.

Controle tegen de rasters op echte ingest-uitvoer: `node --import tsx scripts/regio-check.ts <map>` (in `web/`; elke
waarde, bilineaire waarde, regenpatch en beweging voor ~300 plaatsen).

## Lokaal draaien

Meten op een bestaande datamap (manifest + chunks), zonder iets te veranderen:

```
cargo build --release -p motregen-ingest --bin motregen-regions
RAYON_NUM_THREADS=2 ./target/release/motregen-regions --data-dir <map> \
    [--sidecar <ecmwf-map>/ecmwf.json] [--verify] [--per-chunk] [--out <uitvoermap>] [--level 19]
```

- `--verify` vergelijkt elke cel, elk frame en elk bewegingsblok met het raster.
- `--per-chunk` bouwt elke chunk ook los, om te zien welke velden de bytes dragen.
- `--out` schrijft `regions/` zoals de daemon dat doet.

Een datamap maak je met `tools/fetch-data-snapshot.sh`; ECMWF met
`MOTREGEN_DATA_DIR=<map> ./target/release/motregen-ecmwf`. Met `--out <uitvoermap>` is de uitvoermap zelf een datamap
(`manifest.json` met `regions`, `chunks` als link naar de invoer), die je met de prod-cacheheaders serveert:

```
tools/fetch-data-snapshot.sh ~/data/snap
./target/release/motregen-regions --data-dir ~/data/snap --out ~/data/snap-regios
tools/serve-data-snapshot.sh ~/data/snap-regios 18394          # en de snapshot zonder regio's op 18393
cd web && MOTREGEN_DATA_ORIGIN=http://127.0.0.1:18394 pnpm dev   # of: pnpm perf:modes --data http://127.0.0.1:18394
```

De daemon zelf: `motregen-ingest --regions [--regions-zstd-level 19]` (of `MOTREGEN_REGIONS=true`). Hij logt per
gebouwde groep `region files written` met bytes, schijfbytes, decode-, knip- en zstd-tijd, wandklok en proces-CPU.
De proces-CPU telt ook andere draden mee, zoals de seamless-worker.
