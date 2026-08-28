# HARMONIE-AROME GRIB-spike

## Bron en bestandsindeling

Op 28 augustus 2026 gaf de KNMI Open Data API voor
`harmonie_arome_cy43_p1` versie 1.0 tien recente bestanden terug van
866.897.920 tot 868.034.560 bytes. Voor deze spike is het nieuwste bestand
gebruikt: `HARM43_V1_P1_2026082812.tar` (exact 867.942.400 bytes).

Het bestand is een ongecomprimeerde tar met 61 bestanden zonder extensie:
`HA43_N20_202608281200_00000_GB` tot en met
`HA43_N20_202608281200_06000_GB`. Elk bestand bevat één lead time, van +0 tot
+60 uur. +0 is 11.986.144 bytes; de overige bestanden zijn ongeveer
14,2–14,3 MB. Een lead-timebestand bevat 49 GRIB edition 1-berichten. Alle
velden gebruiken een regulier lat-lon-grid van 390×390 punten:

- breedtegraad 49,000° tot 56,002°, oplopend met 0,018°;
- lengtegraad 0,000° tot 11,281°, oplopend met 0,029°;
- scanvolgorde: eerst langs de lengtegraden, daarna langs de breedtegraden.

De API publiceerde tijdens de meting ieder uur een nieuwe tar. Dat wijkt af
van de aanname van vier runs per dag in MIP-1 en moet bij de ingestplanning
opnieuw worden vastgesteld; het verandert de GRIB-gate niet.

## Neerslagparameter

De relevante parameter is totale neerslag aan het oppervlak:

| eigenschap | waarde |
| --- | --- |
| GRIB-editie | 1 |
| centrum | KNMI (99) |
| lokale tabel | 253 |
| `indicatorOfParameter` | 61 |
| niveau | type 105, hoogte 0 m (`sfc`/`heightAboveGround`) |
| tijdverwerking | accumulatie, `timeRangeIndicator=4` |
| tijdvak | runstart tot lead time, bijvoorbeeld 0–1 uur |
| eenheid | kg/m², numeriek gelijk aan mm water |

De standaard ecCodes-installatie bevat geen namen voor KNMI-tabel 253.
Daardoor rapporteren ecCodes/cfgrib `shortName=unknown`, `paramId=0` en
`units=unknown`. De decoder selecteert daarom niet op deze afgeleide namen,
maar op tabel 253, parameter 61, niveau 105/0 en accumulatiecode 4. Deze ruwe
GRIB1-sleutels zijn wel beschikbaar en stabiel.

Voor uur `N` is de regenintensiteit in mm/u:

```text
rain(N) = total_precipitation(N) - total_precipitation(N - 1)
```

Omdat de stappen precies één uur duren, is het verschil in mm ook de
gemiddelde mm/u over dat uur. Voor +1 wordt het nulveld van +0 afgetrokken.
De bibliotheek controleert dat grids gelijk zijn en lead times opeenvolgend
zijn; hij klemt negatieve verschillen niet stilzwijgend af.

## Uitvoerbare Python-referentie

`spec/export_fixture.py` opent één uitgepakt lead-timebestand met
xarray/cfgrib, selecteert de bovenstaande ruwe parameter en schrijft:

- `precip.npy`: het 390×390 veld als C-order float32;
- `metadata.json`: selector, stap, vorm en lat-lon-gridmetadata.

Reproductie:

```sh
direnv exec . uv run --project spec spec/export_fixture.py \
  data/HA43_N20_202608281200_00100_GB data/fixture-001
```

De Rust-integratietest voert dezelfde exporter uit en vergelijkt alle 152.100
float32-waarden met de output van `knmi-grib`. De vergelijking is exact; er
is geen tolerantie nodig omdat beide paden dezelfde ecCodes-decoder gebruiken
en daarna dezelfde f64→f32-conversie doen.

## Rust-pad en snelheid

`crates/knmi-grib` gebruikt de veilige high-level crate `eccodes` 0.14 tegen
libeccodes 2.48 uit nixpkgs. De FFI-route compileert en decodeert zonder eigen
`unsafe` code. `eccodes-sys` genereert bindings tijdens de build; daarom zijn
libclang en de glibc-headerlocatie expliciet onderdeel van devenv.

Gemeten op de devhost met een release-build en warme filesystemcache:

```sh
direnv exec . cargo build --release --example decode_run
direnv exec . bash -c \
  'time -p target/release/examples/decode_run data HA43_N20_202608281200'
```

Vijf opeenvolgende wall-times voor het decoderen en de-accumuleren van alle
24 uurvelden waren 0,20, 0,19, 0,18, 0,19 en 0,18 seconde (mediaan 0,19 s).
Dit ligt ruim onder de zachte grens van 2 seconden.

### CPU- en geheugenprofiel

Een release-run onder Valgrind Callgrind telde 1.348.080.640 instructies. De
zichtbare afzonderlijke hotspot was ecCodes' simple-packingdecoder met
120.660.933 instructies (8,95%). De selector las aanvankelijk vijf metadata-
sleutels voor ieder bericht, ook wanneer de parameter al niet overeenkwam.
Na goedkoop-naar-duur kortsluiten daalde het totaal naar 1.337.885.068
instructies (-0,76%). De vijf warme native wall-times bleven binnen de
meetruis: 0,22, 0,19, 0,19, 0,18 en 0,19 seconde, opnieuw mediaan 0,19 s.

Massif mat een piek van 3.970.634 bytes nuttige heap plus 111.686 bytes
allocatoroverhead. De grootste gelijktijdige eigen buffers waren twee
float32-velden van samen 1.216.800 bytes en ecCodes' tijdelijke float64-
decodeerbuffer van 1.216.800 bytes. DHAT rapporteerde over de hele run
657.952.334 gealloceerde bytes in 650.373 blokken, maar geen live bytes aan
het einde vanuit de grote databuffers. De allocation churn komt vooral van
ecCodes: het maakt bij het sequentieel zoeken tijdelijke buffers voor de 43
berichten vóór parameter 61 (alleen die berichtbuffers waren circa 278 MB
over de run).

Een GRIB1-headerprefilter met byte-offsets zou die churn en een groot deel van
de resterende CPU kunnen vermijden door alleen het neerslagbericht aan
ecCodes te geven. Dat zou eigen GRIB-framingcode en extra formatrisico
introduceren voor een pad dat al circa tienmaal onder de snelheidsgrens zit.
Daarom is die optimalisatie niet toegevoegd; bij grotere bestanden of een
strengere latency-eis is dit de eerstvolgende meetbare optimalisatierichting.

## Verdict

De MIP-1 GRIB-gate is **geslaagd**. De Rust-route decodeert de echte AROME
GRIB1-data via de onderhouden ecCodes-FFI, stemt op het volledige testveld
element voor element overeen met cfgrib en haalt +1…+24 in circa 0,19 s.
Resterende risico's zijn operationeel: KNMI's lokale tabel wordt niet door de
standaard ecCodes-definities benoemd, een toekomstige tabel/parameterwijziging
moet expliciet worden gedetecteerd, en de waargenomen uurlijkse runfrequentie
moet vóór ingestimplementatie worden bevestigd. Geen van deze punten vraagt
om een pure-Rust GRIB-decoder; die route is daarom niet verder onderzocht.

## T2-downloadstrategie: tar via Range

De tijdelijke S3-download-URL antwoordt op een `GET` met
`Range: bytes=0-511` met `206 Partial Content`, een exact 512-byteantwoord,
`Accept-Ranges: bytes` en een correcte `Content-Range` over de volledige
867.368.960 bytes van run `2026082813`. Een `HEAD` op dezelfde presigned URL
geeft 403 omdat de URL voor GET is getekend; bereik/omvang worden daarom uit
de download-URL-respons en GET-responses gecontroleerd, niet met HEAD.

GNU tar zet vóór ieder GRIB-bestand een klein PAX-record. De ingest leest per
lead time één probe van 1.536 bytes: PAX-header, maximaal één PAX-datablok en
de echte bestandsheader. Uit de octale groottetekens rekent hij direct de
volgende headeroffset uit. Checksums, `ustar`, type en een unieke volledige
set `_00000_GB`…`_02400_GB` worden gevalideerd; de tarvolgorde zelf is niet
numeriek. Daarna haalt hij alleen de
25 data-ranges +0…+24 op; +0 is nodig als nulbasis voor de-accumulatie. De
live T2-run mat 352.864.390 bytes (40,7%) tegenover de volledige
867.368.960-byte tar. Er wordt geen gedeeltelijke tar
als productieformaat bewaard: iedere member gaat rechtstreeks naar een
cachebestand en vervolgens door ecCodes.

AROME wordt standaard iedere drie uur gecontroleerd/ververst, configureerbaar
met `--arome-cadence`/`MOTREGEN_AROME_CADENCE`. Daardoor is de gemiddelde
download circa 117 MB/u in plaats van 868 MB/u bij het volgen van iedere
gepubliceerde run. Een recentere run mag de vorige pas in het manifest
vervangen nadat alle 25 ranges, GRIB-decodering en mrf-publicatie zijn
geslaagd. RTCOR en nowcast blijven los iedere 60 seconden pollen; MQTT blijft
een vervolg omdat polling binnen de geregistreerde API-quota past en minder
operationele reconnecttoestand introduceert voor de MVP.
