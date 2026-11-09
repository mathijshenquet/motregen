# Tussenbalken server-side? (U102, PO-vraag 2026-11-09)

PO: "kan je die averaging niet server side doen?" Gemeten met `motregen-regions --layout …` (release, zstd 19,
`RAYON_NUM_THREADS=2`, `--verify` groen voor alle waarden) op dezelfde snapshots als fase 1: droog = live 2026-11-09
10:15 UTC, nat = dev-archief 2026-09-30 07:10 UTC, beide met ECMWF 2026-11-09 00 UTC. De host was druk (loadavg
20–33), dus CPU-tijden zijn eerder te hoog dan te laag; de verhoudingen tussen de layouts staan.

## Waar de tussenbalken vandaan komen

Op drie snapshots (`buildTimeline`, `round(interval / 15 min) ≥ 2`): alleen **HARMONIE→HARMONIE binnen één chunk**
(37–39 paren van 60 min, 3 balken per paar) en soms **één overgangspaar seamless→HARMONIE** (40 min, 2 balken).
rtcor, nowcast en seamless liggen 5–10 min uit elkaar en hebben er nooit een. De regenrand van 17 cellen plus
beweging in de radargroep diende dus nergens voor, behalve dat ene overgangspaar.

## Layouts

| layout | regen radar | regen HARMONIE | overige velden | tussenbalken |
| --- | --- | --- | --- | --- |
| patch (fase 1, nu) | +17 cellen, beweging | +17 cellen, beweging | +1 cel | client, uit de patch |
| cel u16 | eigen cellen | eigen cellen | eigen cellen (ECMWF +1) | server, gemengde byte in 1/256 |
| cel u8 | idem | idem | idem | server, afgeronde byte |
| cel delta | idem | idem | idem | server, afgeronde byte min lineaire interpolatie van de cel (i8) |
| hybride | eigen cellen | +17 cellen, beweging | eigen cellen (ECMWF +1) | client, uit de patch (alleen HARMONIE) |

De server-side rekening is een letterlijke port van `rainBetween`/`motionWarpStrength`/`selectPairMotion` naar Rust
(`crates/ingest/src/regions/between.rs`), op het celmidden. De gelijkheidstest tegen de TS-code is nog niet gebouwd.

## Per locatie (4 bestanden)

| | patch (nu) | cel u16 | cel u8 | cel delta | hybride |
| --- | ---: | ---: | ---: | ---: | ---: |
| droog, gemiddeld | 34,4 kB | 49,4 kB | 34,0 kB | 28,5 kB | 27,9 kB |
| droog, p95 (som p95 per groep) | 41,0 kB | — | 51,0 kB | 45,5 kB | 34,1 kB |
| nat, gemiddeld | 45,6 kB | 64,5 kB | 41,4 kB | 32,9 kB | 33,8 kB |
| nat, p95 (som p95 per groep) | 99,4 kB | — | 70,8 kB | 59,9 kB | 54,1 kB |

De HARMONIE-regenchunk alleen (nat, per bestand): patch 11,2 kB, cel u8 18,7 kB. Drie voorgerekende, gebroken
waarden per uur per cel comprimeren slechter dan de ruwe rasterpatch met beweging; pas als verschil met de lineaire
interpolatie (delta) wordt het weer klein. De winst van alle cel-varianten komt uit de radargroep zonder rand
(nat 8,6 → 2,6 kB) en marge 0 voor de velden die niet bilineair gelezen worden; die winst heeft de hybride ook.

## Prod (baseline 108 MB live, ≈ 430 MB/dag)

Op het prod-ritme (radar 288×, harmonie 8×, extra 96×, ecmwf 2× per dag), schijfbytes in blokken van 4 KiB.

| | patch (nu) | cel delta | hybride |
| --- | ---: | ---: | ---: |
| live, nieuwste + 1 run, droog / nat | 13,0 / 16,4 MB (+12 / +15 %) | 11,6 / 12,9 MB (+11 / +12 %) | 11,5 / 13,2 MB (+11 / +12 %) |
| geschreven per dag, droog / nat | 270 / 569 MB (+63 / +132 %) | 260 / 340 MB (+60 / +79 %) | 259 / 341 MB (+60 / +79 %) |
| ingest-CPU per dag, droog / nat | 5,2 / 13,4 min | 3,6 / 7,7 min | 2,2 / 6,2 min |
| HARMONIE-run: CPU / wandklok (2 draden) | 5,5 s / 2,9 s | 15,6 s / 8,0 s | 4,8 s / 2,6 s |

Van het schrijfvolume is 175 MB/dag (droog) de ondergrens van de radargroep: 148 bestanden van 0,3–2,6 kB nemen elk
een blok van 4 KiB, 288× per dag. Dat is een aparte hendel (één radarbestand per run met een index), los van deze
keuze.

## Afweging

- **Bytes:** cel delta en hybride liggen binnen 3 % van elkaar (droog 28,5 vs 27,9 kB, nat 32,9 vs 33,8 kB); de
  exacte server-variant (u16) is de duurste van allemaal.
- **Pariteit:** server-side rekent op het celmidden en rondt af (delta en u8: ±0,5 byte = ±1,9 % van de waarde op de
  regentabel, onzichtbaar in een balk); de client rekent nu op de plek zelf, exact. Elke wijziging aan warp of
  menging moet daarna in TS én Rust (zoals U101), anders lopen kaart en histogram uiteen.
- **Client:** de warp-code (`rainPatch`, `motionAtPatch`, `rainBetween`) blijft hoe dan ook: de terugval (zee,
  buitenland, 404, geen vlag) en het overgangspaar seamless→HARMONIE gebruiken hem. Wat wegvalt is de regiolijm:
  `RegionChunk.patch/motion/hasMotion`, `keepRegionRainPatches`, `loadPointPairMotion` en het bewegingsdeel van het
  formaat (≈ 120 regels TS, ≈ 60 Rust); erbij komt het lezen van de tussenreeks (≈ 30 regels).
- **Ingest:** server-side kost de HARMONIE-run 3× zoveel CPU en 8 s wandklok vóór het manifest (8× per dag).
- **Werk:** server-side ≈ 1 dag (port staat als prototype; gelijkheidstest TS↔Rust, clientlezer, docs). Hybride
  ≈ 1 uur: alleen de ingest-standaard; de client valt nu al per cel terug, dus geen clientwijziging.

Het overgangspaar seamless→HARMONIE heeft in cel- en hybride-layout geen patch uit het regiobestand: het histogram
toont daar lineair tot de kaart die twee frames heeft gedecodeerd (de bestaande terugval), daarna exact.

## Uitvoer


```
/home/mathijs/data/motregen-u102/live-20261109: nu 2026-11-09T10:15:00Z, 60 chunks, 148 regio's met een bestand, layout patch, zstd 19, 2 rayon-draden
| groep | chunks | bestanden | bytes per run | gem. / p95 per bestand | op schijf (4 KiB) | ongecomprimeerd | kop (los gecomprimeerd) | decode / knippen / zstd | wandklok | CPU (alle draden) |
| radar | 3 | 148 | 236 kB | 1595 / 1850 B | 622 kB | 95485 kB | 438 B per bestand | 73 / 126 / 285 ms | 496 ms | 750 ms |
| harmonie | 31 | 148 | 3338 kB | 22559 / 25964 B | 3682 kB | 48485 kB | 973 B per bestand | 107 / 30 / 2749 ms | 2892 ms | 5450 ms |
| extra | 3 | 148 | 195 kB | 1322 / 1650 B | 606 kB | 1706 kB | 343 B per bestand | 22 / 2 / 261 ms | 285 ms | 540 ms |
| ecmwf | 17 | 148 | 1317 kB | 8900 / 11525 B | 1597 kB | 2446 kB | 693 B per bestand | 9 / 2 / 320 ms | 332 ms | 630 ms |
Per locatie (som van het gemiddelde bestand per groep): 34376 B
```

```
/home/mathijs/data/motregen-u102/live-20261109: nu 2026-11-09T10:15:00Z, 60 chunks, 148 regio's met een bestand, layout cel, zstd 19, 2 rayon-draden
| groep | chunks | bestanden | bytes per run | gem. / p95 per bestand | op schijf (4 KiB) | ongecomprimeerd | kop (los gecomprimeerd) | decode / knippen / zstd | wandklok | CPU (alle draden) |
| radar | 3 | 148 | 49 kB | 334 / 325 B | 606 kB | 29382 kB | 296 B per bestand | 62 / 23 / 36 ms | 131 ms | 180 ms |
| harmonie | 31 | 148 | 5789 kB | 39116 / 78255 B | 6053 kB | 92945 kB | 897 B per bestand | 109 / 2355 / 6464 ms | 8936 ms | 17560 ms |
| extra | 3 | 148 | 148 kB | 1003 / 1189 B | 606 kB | 1141 kB | 341 B per bestand | 21 / 1 / 154 ms | 175 ms | 320 ms |
| ecmwf | 17 | 148 | 1317 kB | 8900 / 11525 B | 1597 kB | 2446 kB | 693 B per bestand | 11 / 3 / 287 ms | 301 ms | 580 ms |
Per locatie (som van het gemiddelde bestand per groep): 49353 B
```

```
/home/mathijs/data/motregen-u102/live-20261109: nu 2026-11-09T10:15:00Z, 60 chunks, 148 regio's met een bestand, layout cel-u8, zstd 19, 2 rayon-draden
| groep | chunks | bestanden | bytes per run | gem. / p95 per bestand | op schijf (4 KiB) | ongecomprimeerd | kop (los gecomprimeerd) | decode / knippen / zstd | wandklok | CPU (alle draden) |
| radar | 3 | 148 | 49 kB | 334 / 325 B | 606 kB | 29382 kB | 296 B per bestand | 64 / 22 / 40 ms | 138 ms | 190 ms |
| harmonie | 31 | 148 | 3515 kB | 23754 / 37984 B | 3825 kB | 55087 kB | 893 B per bestand | 100 / 2176 / 4753 ms | 7034 ms | 13800 ms |
| extra | 3 | 148 | 148 kB | 1003 / 1189 B | 606 kB | 1141 kB | 341 B per bestand | 17 / 1 / 139 ms | 157 ms | 300 ms |
| ecmwf | 17 | 148 | 1317 kB | 8900 / 11525 B | 1597 kB | 2446 kB | 693 B per bestand | 11 / 2 / 277 ms | 290 ms | 540 ms |
Per locatie (som van het gemiddelde bestand per groep): 33991 B
```

```
/home/mathijs/data/motregen-u102/live-20261109: nu 2026-11-09T10:15:00Z, 60 chunks, 148 regio's met een bestand, layout cel-delta, zstd 19, 2 rayon-draden
| groep | chunks | bestanden | bytes per run | gem. / p95 per bestand | op schijf (4 KiB) | ongecomprimeerd | kop (los gecomprimeerd) | decode / knippen / zstd | wandklok | CPU (alle draden) |
| radar | 3 | 148 | 49 kB | 334 / 325 B | 606 kB | 29382 kB | 296 B per bestand | 73 / 29 / 39 ms | 153 ms | 200 ms |
| harmonie | 31 | 148 | 2697 kB | 18226 / 32434 B | 2994 kB | 55088 kB | 895 B per bestand | 112 / 2456 / 5442 ms | 8018 ms | 15620 ms |
| extra | 3 | 148 | 148 kB | 1003 / 1189 B | 606 kB | 1141 kB | 341 B per bestand | 22 / 4 / 154 ms | 180 ms | 310 ms |
| ecmwf | 17 | 148 | 1317 kB | 8900 / 11525 B | 1597 kB | 2446 kB | 693 B per bestand | 10 / 3 / 297 ms | 310 ms | 580 ms |
Per locatie (som van het gemiddelde bestand per groep): 28463 B
```

```
/home/mathijs/data/motregen-u102/live-20261109: nu 2026-11-09T10:15:00Z, 60 chunks, 148 regio's met een bestand, layout hybride, zstd 19, 2 rayon-draden
| groep | chunks | bestanden | bytes per run | gem. / p95 per bestand | op schijf (4 KiB) | ongecomprimeerd | kop (los gecomprimeerd) | decode / knippen / zstd | wandklok | CPU (alle draden) |
| radar | 3 | 148 | 49 kB | 334 / 325 B | 606 kB | 29382 kB | 296 B per bestand | 74 / 33 / 45 ms | 169 ms | 220 ms |
| harmonie | 31 | 148 | 2618 kB | 17692 / 21011 B | 2936 kB | 46314 kB | 980 B per bestand | 121 / 32 / 2397 ms | 2558 ms | 4820 ms |
| extra | 3 | 148 | 148 kB | 1003 / 1189 B | 606 kB | 1141 kB | 341 B per bestand | 21 / 1 / 150 ms | 172 ms | 300 ms |
| ecmwf | 17 | 148 | 1317 kB | 8900 / 11525 B | 1597 kB | 2446 kB | 693 B per bestand | 10 / 2 / 310 ms | 322 ms | 620 ms |
Per locatie (som van het gemiddelde bestand per groep): 27929 B
```

```
/home/mathijs/data/motregen-devdata/data: nu 2026-09-30T07:10:00Z, 59 chunks, 148 regio's met een bestand, layout patch, zstd 19, 2 rayon-draden
| groep | chunks | bestanden | bytes per run | gem. / p95 per bestand | op schijf (4 KiB) | ongecomprimeerd | kop (los gecomprimeerd) | decode / knippen / zstd | wandklok | CPU (alle draden) |
| radar | 3 | 148 | 1279 kB | 8644 / 56825 B | 1642 kB | 95499 kB | 475 B per bestand | 83 / 57 / 1199 ms | 1351 ms | 2550 ms |
| harmonie | 31 | 148 | 4058 kB | 27425 / 30302 B | 4362 kB | 48490 kB | 990 B per bestand | 101 / 20 / 2605 ms | 2729 ms | 5210 ms |
| extra | 2 | 148 | 95 kB | 646 / 753 B | 606 kB | 1245 kB | 247 B per bestand | 1 / 1 / 137 ms | 139 ms | 270 ms |
| ecmwf | 17 | 148 | 1317 kB | 8900 / 11525 B | 1597 kB | 2446 kB | 693 B per bestand | 11 / 4 / 307 ms | 322 ms | 590 ms |
Per locatie (som van het gemiddelde bestand per groep): 45615 B
```

```
/home/mathijs/data/motregen-devdata/data: nu 2026-09-30T07:10:00Z, 59 chunks, 148 regio's met een bestand, layout cel, zstd 19, 2 rayon-draden
| groep | chunks | bestanden | bytes per run | gem. / p95 per bestand | op schijf (4 KiB) | ongecomprimeerd | kop (los gecomprimeerd) | decode / knippen / zstd | wandklok | CPU (alle draden) |
| radar | 3 | 148 | 390 kB | 2637 / 18002 B | 872 kB | 29397 kB | 336 B per bestand | 79 / 22 / 483 ms | 594 ms | 1060 ms |
| harmonie | 31 | 148 | 7754 kB | 52393 / 83485 B | 8069 kB | 92950 kB | 918 B per bestand | 105 / 2208 / 10653 ms | 12972 ms | 25580 ms |
| extra | 2 | 148 | 83 kB | 567 / 645 B | 606 kB | 867 kB | 245 B per bestand | 1 / 1 / 92 ms | 93 ms | 190 ms |
| ecmwf | 17 | 148 | 1317 kB | 8900 / 11525 B | 1597 kB | 2446 kB | 693 B per bestand | 11 / 2 / 290 ms | 303 ms | 580 ms |
Per locatie (som van het gemiddelde bestand per groep): 64497 B
```

```
/home/mathijs/data/motregen-devdata/data: nu 2026-09-30T07:10:00Z, 59 chunks, 148 regio's met een bestand, layout cel-u8, zstd 19, 2 rayon-draden
| groep | chunks | bestanden | bytes per run | gem. / p95 per bestand | op schijf (4 KiB) | ongecomprimeerd | kop (los gecomprimeerd) | decode / knippen / zstd | wandklok | CPU (alle draden) |
| radar | 3 | 148 | 390 kB | 2637 / 18002 B | 872 kB | 29397 kB | 336 B per bestand | 73 / 18 / 459 ms | 562 ms | 1000 ms |
| harmonie | 31 | 148 | 4329 kB | 29253 / 40647 B | 4653 kB | 55092 kB | 916 B per bestand | 117 / 2350 / 5873 ms | 8348 ms | 16390 ms |
| extra | 2 | 148 | 83 kB | 567 / 645 B | 606 kB | 867 kB | 245 B per bestand | 2 / 1 / 126 ms | 129 ms | 230 ms |
| ecmwf | 17 | 148 | 1317 kB | 8900 / 11525 B | 1597 kB | 2446 kB | 693 B per bestand | 11 / 3 / 315 ms | 329 ms | 620 ms |
Per locatie (som van het gemiddelde bestand per groep): 41357 B
```

```
/home/mathijs/data/motregen-devdata/data: nu 2026-09-30T07:10:00Z, 59 chunks, 148 regio's met een bestand, layout cel-delta, zstd 19, 2 rayon-draden
| groep | chunks | bestanden | bytes per run | gem. / p95 per bestand | op schijf (4 KiB) | ongecomprimeerd | kop (los gecomprimeerd) | decode / knippen / zstd | wandklok | CPU (alle draden) |
| radar | 3 | 148 | 390 kB | 2637 / 18002 B | 872 kB | 29397 kB | 336 B per bestand | 100 / 32 / 469 ms | 616 ms | 1070 ms |
| harmonie | 31 | 148 | 3080 kB | 20813 / 29738 B | 3375 kB | 55093 kB | 918 B per bestand | 116 / 2515 / 5877 ms | 8516 ms | 16520 ms |
| extra | 2 | 148 | 83 kB | 567 / 645 B | 606 kB | 867 kB | 245 B per bestand | 2 / 1 / 122 ms | 124 ms | 220 ms |
| ecmwf | 17 | 148 | 1317 kB | 8900 / 11525 B | 1597 kB | 2446 kB | 693 B per bestand | 12 / 3 / 320 ms | 335 ms | 630 ms |
Per locatie (som van het gemiddelde bestand per groep): 32917 B
```

```
/home/mathijs/data/motregen-devdata/data: nu 2026-09-30T07:10:00Z, 59 chunks, 148 regio's met een bestand, layout hybride, zstd 19, 2 rayon-draden
| groep | chunks | bestanden | bytes per run | gem. / p95 per bestand | op schijf (4 KiB) | ongecomprimeerd | kop (los gecomprimeerd) | decode / knippen / zstd | wandklok | CPU (alle draden) |
| radar | 3 | 148 | 390 kB | 2637 / 18002 B | 872 kB | 29397 kB | 336 B per bestand | 86 / 29 / 487 ms | 613 ms | 1070 ms |
| harmonie | 31 | 148 | 3204 kB | 21650 / 23972 B | 3526 kB | 46319 kB | 997 B per bestand | 114 / 33 / 2563 ms | 2717 ms | 5210 ms |
| extra | 2 | 148 | 83 kB | 567 / 645 B | 606 kB | 867 kB | 245 B per bestand | 2 / 1 / 118 ms | 121 ms | 230 ms |
| ecmwf | 17 | 148 | 1317 kB | 8900 / 11525 B | 1597 kB | 2446 kB | 693 B per bestand | 11 / 3 / 313 ms | 327 ms | 630 ms |
Per locatie (som van het gemiddelde bestand per groep): 33754 B
```
