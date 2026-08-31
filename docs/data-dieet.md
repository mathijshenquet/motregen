# Data-dieet

## Conclusie

De sessiepijn zit niet in scrubben maar in openen. Op de vastgezette live
werkset draagt een passieve sessie al **17.096.316 B chunkdata** over; de hele
scrub voegt slechts **672.002 B** toe. Inclusief app, headers en overige
resources is dat 21.498.845 B passief en 22.170.607 B na scrubben: 97,0% van
de volledige overdracht gebeurt dus zonder gebruikersactie.

De veilige winst is ruimtelijke integratie van de AROME-uurvelden vóór
kwantisatie. De gekozen grids brengen die zeven chunks van **11.235.449 B**
naar **1.921.863 B** (−82,9%), zonder wijziging aan regen, mrf v0 of de
frontend. De manifest-werkset daalt daarmee van 21.904.585 B naar circa
12.590.999 B. Op hetzelfde browserpad zou de volledige chunktransfer van
17.768.318 B naar circa 8.454.732 B dalen.

| gebruik | velden | oud | nieuw | gemeten chunks |
| --- | --- | ---: | ---: | ---: |
| labels, tabel en particles | temperatuur, gevoel, U/V-wind | 2 km | 6 km | 1.456.146 B |
| zon/pictogram | straling | 2 km | 8 km | 224.056 B |
| geïntegreerde tabel/pictogram-input | vochtigheid, bewolking | 2 km | 16 km | 241.661 B |

Bewolking en vochtigheid zijn op expliciete PO-call geïntegreerde
grootheden: het gemiddelde over de grotere schaal is daar het gewenste
signaal, niet een inferieure benadering van een puntwaarde. Regen blijft
ongewijzigd op 1 km.

## Meetopzet

Snapshot: manifest `generated=2026-08-31T13:52:05Z`, 12 immutable chunks uit
`/home/mthq/motregen/data/chunks`, eerst gekopieerd naar een tijdelijke map.
Alle maten hieronder zijn decimale bytes/MB.

`data_diet` decodeert ieder zelfstandig zstd-member, telt byte-entropie en
no-data, integreert blokken in fysieke eenheden met uitsluiting van no-data,
kwantiseert opnieuw met de meegereisde tabel en encodeert ieder alternatief
op mrf-niveau met zstd level 19. Kwaliteitsfouten vergelijken het grovere
blok terug met iedere oorspronkelijke cel; de stadsmaten gebruiken De Bilt en
de tien temperatuurankers uit de frontend. Reproduceren:

```sh
devenv shell cargo run --release -p mrf --example data_diet -- SNAPSHOT_DATA_DIR
```

De zeefractie is bepaald op celcentra met Natural Earth 1:10m
[`land`-polygonen](https://www.naturalearthdata.com/downloads/10m-physical-vectors/10m-land/),
die grote eilanden meenemen. Die bedraagt 43,56% op zowel het 1km- als
2km-grid (43,55% op 5 km). No-data en zee zijn afzonderlijke eigenschappen:
een zeecel kan een geldige weerswaarde hebben.

De sessiemeting draaide een productiebuild via Vite en Caddy op de gekopieerde
snapshot, in een nieuwe headless-Chromiumcontext. Zij wacht eerst tot de
automatisch gekozen locatie De Bilt en de uurtabel volledig geladen zijn,
meet dan de passieve toestand, scrubt alle 122 samengestelde regenframes en
meet opnieuw:

```sh
cd web
devenv shell pnpm exec tsx scripts/measure-session.ts http://127.0.0.1:4186
```

Twee runs leverden byte-exact dezelfde Resource Timing-totalen en geen
browserfouten. TTFR/FPS uit deze analyse-run zijn niet als performancebewijs
gebruikt: de fallback-Chromiumbuild op NixOS wijkt af van de gekalibreerde
MIP-7-browser.

## Waar de bytes zitten

`B/frame` is de hele chunk inclusief header en eventuele motion-annex,
geamortiseerd over zijn frames. `H` is de Shannon-entropie van de
gekwantiseerde bytes; dit is een verklarende maat, geen voorspelde bitrate.

| bron | veld | grid | frames | chunk | B/frame | no-data | zee | H (bit/cel) |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| RTCOR | rain_rate | 1250×1350 | 36 | 3.541 MB | 98.360 | 31,40% | 43,56% | 1,923 |
| nowcast | rain_rate | 1250×1350 | 25 | 1.761 MB | 70.458 | 20,50% | 43,56% | 1,507 |
| seamless | rain_rate | 1250×1350 | 48 | 3.330 MB | 69.385 | 4,59% | 43,56% | 1,238 |
| HARMONIE | rain_rate | 1250×1350 | 24 | 1.824 MB | 75.995 | 4,59% | 43,56% | 3,807 |
| HARMONIE | temp_c | 625×675 | 24 | 1.030 MB | 42.924 | 4,74% | 43,57% | 4,743 |
| HARMONIE | feels_like_c | 625×675 | 24 | 1.030 MB | 42.928 | 4,74% | 43,57% | 4,743 |
| HARMONIE | wind_u_ms | 625×675 | 24 | 1.565 MB | 65.201 | 4,74% | 43,57% | 5,382 |
| HARMONIE | wind_v_ms | 625×675 | 24 | 1.352 MB | 56.321 | 4,74% | 43,57% | 5,366 |
| HARMONIE | radiation | 625×675 | 24 | 1.367 MB | 56.956 | 4,74% | 43,57% | 4,972 |
| HARMONIE | rel_humidity | 625×675 | 24 | 2.375 MB | 98.973 | 4,74% | 43,57% | 6,512 |
| HARMONIE | cloud_frac | 625×675 | 24 | 2.516 MB | 104.841 | 4,74% | 43,57% | 5,208 |
| UV | uv | 250×270 | 33 | 0.212 MB | 6.435 | 69,84% | 43,55% | 2,810 |

Regen kost samen 10.456.776 B, de zeven uurvelden 11.235.449 B en UV
212.360 B. Bewolking plus vochtigheid is alleen al 51,3% van de uurvelden.

## Subsampling en gebruikskwaliteit

De tabel geeft de volledig her-encodeerde chunkgrootte voor 2×/4×/8×
integratie in beide ruimtelijke richtingen, met daarnaast de p95 absolute
fout op alle geldige oorspronkelijke cellen. Eenheden volgen het veld.

| bron/veld | 2× bytes / p95 | 4× bytes / p95 | 8× bytes / p95 |
| --- | ---: | ---: | ---: |
| RTCOR regen | 1.854 MB / 0,212 | 0.644 MB / 0,411 | 0.219 MB / 0,768 |
| nowcast regen | 0.931 MB / 0,087 | 0.333 MB / 0,163 | 0.117 MB / 0,318 |
| seamless regen | 1.956 MB / 0,019 | 0.618 MB / 0,032 | 0.189 MB / 0,046 |
| HARMONIE regen | 2.518 MB / 0,042 | 0.893 MB / 0,139 | 0.261 MB / 0,233 |
| temperatuur | 0.566 MB / 0,3 °C | 0.191 MB / 0,6 °C | 0.064 MB / 0,6 °C |
| gevoelstemperatuur | 0.566 MB / 0,3 °C | 0.191 MB / 0,6 °C | 0.064 MB / 0,6 °C |
| wind U | 0.870 MB / 0,50 m/s | 0.280 MB / 0,75 m/s | 0.088 MB / 1,00 m/s |
| wind V | 0.761 MB / 0,25 m/s | 0.252 MB / 0,50 m/s | 0.082 MB / 0,75 m/s |
| straling | 0.750 MB / 25 W/m² | 0.224 MB / 40 W/m² | 0.066 MB / 65 W/m² |
| relatieve vochtigheid | 1.275 MB / 1,57 pp | 0.396 MB / 2,76 pp | 0.120 MB / 3,94 pp |
| bewolking | 1.349 MB / 14,17 pp | 0.405 MB / 26,38 pp | 0.122 MB / 39,76 pp |
| UV | 0.112 MB / 0,283 | 0.036 MB / 0,520 | 0.015 MB / 0,803 |

Regen wordt niet gereduceerd. De p95 verbergt daar plaatselijk grote
piekafvlakking (RTCOR maximaal 90,7 mm/u bij 2×), en HARMONIE-regen wordt bij
2× zelfs 38,1% groter doordat het gemiddeld veld minder goed als lange runs
van gelijke bytes comprimeert. Dit bevestigt dat celreductie geen generieke
compressiewinst is en dat de kernlaag hoogfrequent moet blijven.

Voor de gekozen tussenstap 3× (6 km) zijn de label- en particlemetingen:

- temperatuur en gevoel: elk circa 0,301 MB; stad-p95 0,3 °C en 85,2% van
  afgeronde stadslabels bytegelijk aan de oude puntwaarde;
- wind: U+V 0,855 MB; p95 vectorfout 0,707 m/s, p95 richtingsfout 6,6°,
  98,5% gelijke achtstreeks stadsrichting en 89,0% gelijke Beaufortklasse;
- 4× straling: stad-p95 40 W/m²; 8× is met 90 W/m² te grof voor de
  zon-drempel en is daarom niet gekozen;
- 8× bewolking/vochtigheid: respectievelijk stad-p95 44,9 en 6,7 procentpunt.
  Die verschillen zijn verwacht bij schaalintegratie. Regenachtige
  pictogrammen worden bovendien door regen, niet de bewolkingsklasse,
  bepaald.

## Dictionary en delta

De dictionarytest is bewust gunstig voor de optie: per chunk is op alle
eigen frames een dictionary tot 64 KiB getraind en daarna ieder frame weer
onafhankelijk op level 19 gecomprimeerd. Zelfs met alleen de ruwe
dictionarybytes meegeteld (dus nog zonder JSON/base64-overhead) groeit het
beeldpayloadtotaal van 21.720.023 B naar 22.325.966 B: **+605.943 B
(+2,8%)**. Per veld ligt het resultaat tussen +0,5% en +7,9%. Een dictionary
heeft op deze grote, al sterk gecomprimeerde members dus geen positieve
businesscase.

Voor regen is frame 0 intra gebleven en zijn volgende frames exact als XOR
en als modulo-256 subtractie tegen hun voorganger gecodeerd, ieder opnieuw als
zelfstandig meetmember. De intra-baseline van 10.302.316 B groeit naar
14.507.956 B (XOR, +40,8%) of 14.516.398 B (subtractie, +40,9%). Dit komt
doordat advecterende echo's bij celgewijze delta twee randen introduceren;
zonder motion compensation is temporele afhankelijkheid hier slechter dan
het bestaande sparse intra-veld.

## Crop

Een rechthoek rond Europees Nederland plus 100 km kustbuffer beslaat ongeveer
26% van het huidige gridoppervlak. Na de gekozen integratie is de geometrische
bovengrens van extra besparing op de niet-wind-uurvelden circa 0,79 MB; zstd
maakt de werkelijke winst weerafhankelijk. Die winst rechtvaardigt niet dat
kaartpicks in België, Duitsland of verder op zee plots no-data krijgen, en is
niet nodig om het uurvelddoel te halen. Daarom blijft de volledige extent
behouden. Wind wordt inhoudelijk sowieso niet gecropt: stroming boven zee is
betekenisvol voor particles.

## Reproduceerbare artefacten

- `crates/mrf/examples/data_diet.rs`: chunk-, dictionary-, delta-,
  subsampling- en gebruikskwaliteitsanalyse;
- `web/scripts/measure-session.ts`: passief-versus-scrub browserpad;
- ruwe live data en analyseresultaten blijven machine-lokaal en worden niet
  gecommit.
