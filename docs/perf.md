# Performance

De performance-aanpak volgt MIP-7: dezelfde browsermetingen voeden de
apparaat-HUD en de deterministische Playwright-gate. Er worden geen metingen
naar een server verstuurd.

## Meetpunten

- **TTFR** (time to first rain) loopt vanaf `navigationStart`
  (`performance.timeOrigin`) tot de eerste MapLibre-`render` nadat het eerste
  niet-verouderde regenframe naar de WebGL-laag is geüpload. Een fetch- of
  `triggerRepaint`-moment telt dus nog niet als zichtbaar frame.
- **Scrub-latency** loopt vanaf de laatste expliciete histograminput tot de
  MapLibre-`render` van het bijbehorende niet-verouderde regenframe. De HUD
  bewaart maximaal 256 samples en toont p50/p95.
- **FPS** is het aantal rAF-callbacks in een lopend venster van één seconde.
  Achtergrondpauzes langer dan 2,5 seconden resetten het venster.
- **Netwerk** komt uit Resource Timing. `bytes` is `transferSize` en telt dus
  alleen werkelijk overgedragen bytes; een cache-hit heeft nul bytes.
  Requests en bytes zijn uitgesplitst in manifest, chunks, tiles en overig.
- **Manifestleeftijd** is `Date.now() - manifest.generated`.

De HUD opent met `?perf=1` of drie tikken binnen 700 ms op het logo. De knop
`Kopieer JSON` kopieert de volledige actuele snapshot.

## Lab-gates

`cd web && pnpm e2e` maakt zelf synthdata, bouwt de productiefrontend en start
een preview plus een Caddy-dataserver. De lokale basemap bevat alleen een
achtergrondlaag; daardoor zijn OpenFreeMap en externe tilelatency geen bron van
flakiness, terwijl de echte Range- en cachepaden wel worden gebruikt. Een
warmmeting is een normale tweede navigatie in dezelfde browsercontext. Een
geforceerde browser-reload wordt niet gebruikt, omdat die cachevalidatie
expliciet kan forceren en daarmee een ander scenario meet.

| Gate | Budget | Kalibratie |
| --- | ---: | --- |
| cold TTFR | < 2.000 ms | gemeten 461–475 ms; ruime marge voor tragere hosts |
| warm TTFR | < 750 ms | startvoorstel 500 ms gaf op SwiftShader 520–600 ms; 750 ms is streng en stabiel |
| warm chunks | 0 overgedragen bytes | manifest is het enige veranderlijke dataobject |
| volledige scrub | < 1 chunktransfer per 3 frames | 23 transfers bij 83 frames; grens 27,7 |
| tweede locatieklik | 0 data-transfers | alle benodigde immutable ranges komen uit browser-/sessiecache |
| volledige sessie | < 8.000.000 bytes | gemeten 1.310.182 bytes |
| browserfouten | 0 | console, page errors en mislukte requests |

FPS wordt alleen gelogd: headless Chromium gebruikt SwiftShader en is geen
zinvolle GPU-gate. De twee verplichte opeenvolgende runs op 2026-08-31 waren:

| Run | cold TTFR | warm TTFR | scrub p50/p95 | scrub transfers | sessie | fps-indicatie |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| synth 1 | 461,3 ms | 520,2 ms | 10,0 / 19,3 ms | 23 / 83 | 1.310.182 B | 45–58 |
| synth 2 | 474,9 ms | 548,4 ms | 8,2 / 21,9 ms | 23 / 83 | 1.310.182 B | 40–56 |

De resterende meetruis komt vooral van SwiftShader-initialisatie, hostbelasting
en rAF-cadans. De budgetten vermijden assertions op losse fps-waarden en houden
ongeveer 150 ms marge boven de traagste waargenomen warmmeting.

## Nulmeting echte data

Gemeten op 2026-08-31 via productiebuild/preview op `:4186`, met `/data`
geproxyd naar de echte Caddy op `:8080` en dezelfde lokale basemap. Dataset:
12 chunks, 9 velden; manifest ongeveer 1–1,5 minuut oud. Chromium/SwiftShader,
1280×720:

- TTFR: **1.141,2 ms**;
- scrub (13 zichtbare commits over de tijdlijn): **p50 69,1 ms**, **p95 172,7 ms**;
- fps-indicatie na stabiliseren: **60**;
- eindstand Resource Timing: **110 requests / 20.118.133 bytes**, waarvan
  104 chunkrequests / 19.772.524 bytes;
- console-, pagina- en requestfouten: **0**.

De echte nulmeting ligt qua bytes bewust naast de synthetische lab-gate: de
live dataset gebruikt grotere grids en negen velden. De 20,1 MB is de huidige
praktijkbaseline om toekomstige verbeteringen of regressies tegen af te zetten;
de `<8 MB`-assertion blijft de reproduceerbare synth-gate uit MIP-7.

## Meetoverhead

Wanneer de HUD verborgen is, doet de collector per rAF alleen teller- en
tijdvergelijkingen zonder allocaties. Resource Timing-classificatie en
percentielsortering gebeuren uitsluitend bij een snapshot; een zichtbare HUD
vraagt die twee keer per seconde op. Een microbenchmark op dezelfde host mat
1.000.000 fps-callbacks in 7,14 ms (**0,007 µs/callback**) en 10.000 snapshots
met 120 resource-entries in 549 ms (**0,055 ms/snapshot**). Dit is ruim onder
één promille van een 16,7-ms framebudget; in de labruns was geen afzonderlijk
meetbaar fps-effect zichtbaar.

## Live-smoke

`scripts/smoke.sh ORIGIN_URL` controleert synchroon index 200,
manifestversheid `<15 min`, de MIP-3 CORS/cache/ETag/Range-headers en een echte
`Range: bytes=0-7` → 206. Het script is alleen een handmatig/timerklaar target;
deze track activeert geen systemd-timer.
