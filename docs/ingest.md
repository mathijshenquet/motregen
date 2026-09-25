# Ingestdaemon draaien

`motregen-ingest` doet bij start een backfill en blijft daarna nieuwe
radar-, AROME- en UV-producten pollen. Vanuit de repository:

```sh
cargo run --release -p motregen-ingest
```

De binary leest `.env` in de huidige map en verwacht
`KNMI_OPEN_DATA_API_KEY`. Een expliciet geëxporteerde variabele of
`--api-key` wint van `.env`. De notification-key is nog niet nodig: voor de
MVP pollt radar iedere 60 seconden. Dat blijft ruim binnen de geregistreerde
quota en vermijdt MQTT-reconnecttoestand; MQTT is een vervolg.

Belangrijkste instellingen:

| vlag | env | standaard |
| --- | --- | --- |
| `--data-dir` | `MOTREGEN_DATA_DIR` | `data` |
| `--radar-cadence` | `MOTREGEN_RADAR_CADENCE` | `60s` |
| `--arome-cadence` | `MOTREGEN_AROME_CADENCE` | `3h` |
| `--uv-cadence` | `MOTREGEN_UV_CADENCE` | `15m` |
| `--history-hours` | `MOTREGEN_HISTORY_HOURS` | `3` |
| `--nowcast-minutes` | `MOTREGEN_NOWCAST_MINUTES` | `120` |
| `--arome-hours` | `MOTREGEN_AROME_HOURS` | `48` |
| `--arome-history-hours` | `MOTREGEN_AROME_HISTORY_HOURS` | `6` |
| `--prune-age` | `MOTREGEN_PRUNE_AGE` | `6h` |
| `--cache-age` | `MOTREGEN_CACHE_AGE` | `12h` |

Duraties accepteren onder meer `60s`, `20m` en `3h`. `--once` publiceert één
snapshot en stopt. `--run-for 20m` blijft na de startup-backfill twintig
minuten pollen en stopt daarna met exit 0; dit is bedoeld voor operationele
receipts.

## Uurvelden: horizon en historie

HARMONIE-AROME P1 levert +0…+60 u. De ingest publiceert +1…+48 u, zodat het
urenoverzicht ook bij een 7 u oude run de hele volgende dag toont. De negen
uurvelden gaan in chunks van 24 leads (`…-h48-l1-24`, `…-h48-l25-48`); de
client haalt een chunk in zijn geheel op zodra een locatie meer dan de helft
van de frames vraagt. Met dagdelen blijft de passieve tabel daardoor één
dag frames laden, ook bij een langere horizon. De regenchunk blijft één chunk
van 48 frames.

Voor de uren vóór de huidige run R kiest de ingest een tweede, oudere run:
de nieuwste run met start ≤ min(vloer(nu) − (historie + 1) u, R − 1 u).
Daarvan publiceert hij alleen de negen uurvelden voor leads +1…+(R − R_h)
(`…-hist<n>`), nooit regen, want in het verleden toont de client alleen
waarnemingen. KNMI publiceert P1 uurlijks met ≈ 3 u vertraging. Bij een
3-uurscadans is de historierun daardoor meestal niet de vorige opgehaalde
run: live kostte hij 6 leden = 82.887.104 B extra per verversing (±28 MB/u),
naast 693.501.914 B voor de 49 leden van de hoofdrun. Een mislukte
historiedownload blokkeert de hoofdpublicatie niet. De tabel heeft dan
tijdelijk minder historie.

Downloads landen atomair onder `<data-dir>/.ingest-cache`. Chunks worden
eerst als tijdelijke file geschreven en hernoemd; pas als radar en alle
AROME-velden gereed zijn wordt `manifest.json` op dezelfde manier vervangen.
UV is binnen zijn dagvenster onderdeel van dezelfde publicatie en ontbreekt
daarbuiten bewust. Namen zijn run-gestempeld en bevatten waar relevant de
ingesthorizon, bijvoorbeeld `rtcor-20260828T1615-h3.mrf`,
`harmonie-temp_c-20260828T1300-h24.mrf` en `uv-20260828T185313.mrf`;
daardoor blijven ze immutable, ook wanneer een operator de horizon wijzigt
of een dagelijks UV-bestand onder dezelfde bronnaam wordt bijgewerkt. Niet
meer gerefereerde chunks worden na de ingestelde bewaartijd verwijderd.
