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

## Verdict

De MIP-1 GRIB-gate is **geslaagd**. De Rust-route decodeert de echte AROME
GRIB1-data via de onderhouden ecCodes-FFI, stemt op het volledige testveld
element voor element overeen met cfgrib en haalt +1…+24 in circa 0,19 s.
Resterende risico's zijn operationeel: KNMI's lokale tabel wordt niet door de
standaard ecCodes-definities benoemd, een toekomstige tabel/parameterwijziging
moet expliciet worden gedetecteerd, en de waargenomen uurlijkse runfrequentie
moet vóór ingestimplementatie worden bevestigd. Geen van deze punten vraagt
om een pure-Rust GRIB-decoder; die route is daarom niet verder onderzocht.
