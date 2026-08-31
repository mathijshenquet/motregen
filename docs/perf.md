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
| warm TTFR | profielafhankelijk, zie hieronder | desktop blijft sneller dan cold; mobiele CPU-/netwerkprofielen hebben eigen marge |
| warm chunks | profielafhankelijk, zie hieronder | desktop blijft 0 B; CDP-netwerkthrottling draagt enkele actuele ranges opnieuw over |
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
en rAF-cadans. De budgetten vermijden daarom assertions op losse fps-waarden.

## Mobiele labprofielen

Dezelfde journey draait in drie Playwrightprojecten. Beide mobiele projecten
gebruiken de Pixel 5-emulatie van Playwright: viewport 393×727, Android-UA,
touch, DPR 2,75 en mobiel layoutgedrag. CDP zet de CPU op 4× vertraging. De
moderne combinatie `Network.emulateNetworkConditionsByRule` en
`Network.overrideNetworkState` emuleert daarnaast de verbinding in de browser:

| Profiel | CPU | Download / upload | RTT | Cold TTFR | Warm TTFR | Warm chunks |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Desktop | 1× | geen emulatie | — | < 2.000 ms | < 1.500 ms | 0 B |
| Mobiel 4G | 4× | 9 / 1,5 Mbps | 60 ms | < 4.000 ms | < 3.500 ms | ≤ 12.000 B |
| Mobiel Fast 3G | 4× | 1,6 / 0,75 Mbps | 150 ms | < 8.000 ms | < 4.000 ms | ≤ 12.000 B |

De sessiegrens van 8 MB, scrubgrens van minder dan één chunktransfer per drie
frames, nul browserfouten en nul datarequests bij de tweede locatieklik gelden
voor ieder profiel. Onder actieve CDP-netwerkthrottling draagt Chromium bij de
warmnavigatie reproduceerbaar enkele kleine Range-responses van het actuele
nowcastchunk opnieuw over: 8.792 B op 4G en 4.696 B op Fast 3G in de
kalibratieruns. Een limiet van 12 kB houdt dit expliciet begrensd; zonder
netwerkthrottling blijft dezelfde warmnavigatie exact 0 B.

Na integratie van de standaard autoplay en de verkorte scrubberhorizon bleek
die desktopnulgrens intermitterend te falen. Een falende run droeg 2.663 B
opnieuw over: drie motion-ranges van elk 63 B plus 1.274 B uit een grotere
nowcastrange. De horizon was niet de oorzaak. De eerste kaartframe prefetchte
buurframes als losse 206-ranges, terwijl de direct daarop gestarte
locatiereeks dezelfde immutable MRF-payload in bulk ophaalde. Die overlappende
responses leverden soms een onvolledige sparse Chromium-cache-entry op. De
redundante prefetch vóór de eerste locatiereeks is daarom verwijderd; latere
prefetch blijft ongewijzigd. Zes verse desktopjourneys daarna maten elk 0 B
warm en 1.282.633 B voor de volledige sessie, 6.865 B minder dan vóór de fix.
Het desktopbudget blijft dus bewust de strenge 0 B in plaats van de regressie
met een ruimer budget te maskeren. Bij een toekomstige failure logt de suite
de overgedragen chunk-URL en Resource Timing-bytevelden direct.

De warmbyte-snapshot wordt pas gemaakt nadat TTFR is vastgelegd, autoplay via
scrubberhover is gepauzeerd, de locatiereeks gereed is en het netwerk idle is.
Voorheen viel de snapshot precies op TTFR; een range die enkele milliseconden
later voltooide telde daardoor willekeurig wel of niet mee. TTFR zelf behoudt
zijn oorspronkelijke eerste-rendermeetpunt, maar de cache-gate omvat nu de
volledige warme startup.

De warmbudgetten zijn gekalibreerd tijdens zowel normale hostbelasting als een
load-average van 12 door gelijktijdige ingest. Daarbij werden uitschieters van
1.285 ms desktop en 2.991 ms op 4G gezien; 1.500/3.500 ms blijft streng maar
voorkomt een gate op toevallige hostcontendentie. De gevraagde mobiele
coldgrenzen van 4/8 seconden hoefden niet te worden verruimd. De twee verplichte
opeenvolgende runs na de finale kalibratie waren:

| Run / profiel | cold TTFR | warm TTFR | scrub p50/p95 | scrubtransfers | sessie | downloadtijd | tweede klik |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| synth 1 / desktop | 464,8 ms | 670,7 ms | 10,9 / 22,4 ms | 23 / 83 | 1.310.219 B | 5.692,0 ms | 0 |
| synth 1 / 4G | 1.727,0 ms | 1.232,4 ms | 17,9 / 39,7 ms | 23 / 83 | 1.326.870 B | 14.813,1 ms | 0 |
| synth 1 / Fast 3G | 3.985,2 ms | 1.664,4 ms | 21,9 / 49,4 ms | 22 / 83 | 1.326.870 B | 21.729,1 ms | 0 |
| synth 2 / desktop | 446,7 ms | 574,2 ms | 12,4 / 19,9 ms | 23 / 83 | 1.310.219 B | 5.791,2 ms | 0 |
| synth 2 / 4G | 1.659,9 ms | 1.450,5 ms | 19,2 / 47,0 ms | 23 / 83 | 1.326.870 B | 16.686,0 ms | 0 |
| synth 2 / Fast 3G | 3.984,8 ms | 1.431,0 ms | 17,4 / 46,7 ms | 21 / 83 | 1.326.870 B | 20.753,8 ms | 0 |

`downloadtijd` loopt van de cold navigatie tot de laatste voltooide response in
de gescripte journey. De vaste interactiestappen zitten dus in het interval;
het getal is bedoeld om profielen en latere data-diëten binnen deze suite te
vergelijken, niet als losse netwerkbenchmark.

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

### Mobiele nulmeting

Gemeten op 2026-08-31 met de productiebuild en lokale basemap tegen één
bevroren snapshot van de operationele ingest: gegenereerd om 14:28:36Z,
12 chunks, 9 velden en 121 zichtbare tijdlijnframes. Een lokale Caddy serveerde
de echte immutable chunks met Range-ondersteuning; alle CPU- en
netwerkbeperkingen zijn browser-side toegepast. Daardoor delen de drie
profielen exact dezelfde data en is netwerkruis van de origin geen verborgen
variabele.

| Profiel | cold TTFR | warm TTFR | scrub p50/p95 | scrubtransfers | sessie | downloadtijd | tweede klik | fouten |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Desktop | 1.203,8 ms | 1.425,6 ms | 18,5 / 47,5 ms | 22 / 121 | 20.758.929 B | 15.269,7 ms | 0 | 0 |
| Mobiel 4G | 12.994,9 ms | 2.949,4 ms | 35,4 / 80,2 ms | 22 / 121 | 20.759.059 B | 46.831,6 ms | 0 | 0 |
| Mobiel Fast 3G | 59.534,5 ms | 2.959,5 ms | 34,1 / 63,6 ms | 20 / 121 | 24.090.390 B | 141.760,5 ms | 0 | 0 |

De 4G/Fast-3G cold TTFR's van 13,0 en 59,5 seconden gelden niet als
budgetfailure: live data is informatief. Ze maken wel concreet dat de huidige
sessie van circa 21 MB op een typische mobiele verbinding het data-dieet
domineert. Fast 3G droeg bovendien 3,3 MB extra over door Range-herhalingen
onder throttling. De tweede locatieklik bleef in alle profielen exact nul.

Een directe run tegen `https://motregen.nl` is eveneens geprobeerd. De origin
serveerde op dat moment frontendasset `index-8SfFjKkC.js`, zonder de op `main`
aanwezige MIP-7-API `window.__motregenPerf`; de verse productiedata was wel
bereikbaar. Daarom is geen niet-vergelijkbare TTFR verzonnen en staat de tabel
hierboven expliciet als productiebuild plus operationele ingestsnapshot. Zodra
de frontenddeploy `main` heeft ingehaald, meet dezelfde live-opdracht de origin
zonder budgetasserties.

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

`cd web && pnpm e2e:live` draait de volledige journey voor desktop, 4G en Fast
3G tegen `https://motregen.nl`. Een andere origin kan met
`MOTREGEN_E2E_ORIGIN=https://voorbeeld.nl pnpm e2e:live` worden opgegeven. De
live-modus houdt functionele checks en foutregistratie, maar past geen TTFR-,
request- of bytebudgetten toe. Na iedere run schrijft hij
`web/tmp/perf-live.json` en `web/tmp/perf-live.md`.

`scripts/smoke.sh ORIGIN_URL` controleert synchroon index 200,
manifestversheid `<15 min`, de MIP-3 CORS/cache/ETag/Range-headers en een echte
`Range: bytes=0-7` → 206. Het script is alleen een handmatig/timerklaar target;
deze track activeert geen systemd-timer.
