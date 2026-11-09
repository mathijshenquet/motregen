# Regiobestanden fase 1: bytes en ingest-CPU (U102, 2026-11-09)

Gemeten met `motregen-regions` (release, zstd 19, `RAYON_NUM_THREADS=2` zoals de 2-vCPU-VM) op ageq-dev2, met
`--verify`: elke cel, elk frame en elk bewegingsblok in de bestanden is gelijk aan het raster. De host was druk
(loadavg 17–25 op 32 cores); CPU-tijd lijdt daar minder onder dan wandklok.

- **droog**: live snapshot 2026-11-09 10:15 UTC (`~/data/motregen-u102/live-20261109`);
- **nat**: dev-archief 2026-09-30 07:10 UTC, zonder ICON-D2;
- beide met de echte ECMWF-run van 2026-11-09 00 UTC (`motregen-ecmwf`, 17 chunks, 286 MB gedownload).

Reproduceren: `docs/regiobestanden.md` § Lokaal draaien.

## Per run

| groep | bytes per run, droog / nat | op schijf (4 KiB), droog / nat | gem. per bestand, droog / nat | p95 per bestand, droog / nat | CPU per run (2 draden), droog / nat |
| --- | ---: | ---: | ---: | ---: | ---: |
| radar | 236 / 1.279 kB | 622 / 1.642 kB | 1.595 / 8.644 B | 1.850 / 56.825 B | 0,62 / 2,47 s |
| harmonie | 3.338 / 4.058 kB | 3.682 / 4.362 kB | 22.559 / 27.425 B | 25.964 / 30.302 B | 4,89 / 5,53 s |
| extra | 195 / 95 kB | 606 / 606 kB | 1.322 / 646 B | 1.650 / 753 B | 0,41 / 0,27 s |
| ecmwf | 1.317 kB | 1.597 kB | 8.900 B | 11.525 B | 0,54 / 0,62 s |

148 bestanden per groep per run. Tabellenbestand (grid en kwantisatie, immutable): 15 tabellen, 30 kB JSON (6,4 kB met
zstd).

## Per dag en per locatie

Op het prod-ritme: radar 288×, harmonie 8× (controle elke 3 u), extra 96×, ecmwf 2× per dag. Baseline prod: 108 MB
live, ≈ 430 MB per dag geschreven, 2.358–2.740 kB client vóór het histogram (MIP-40).

| | droog | nat | MIP-40-schatting (210 regio's, alle gridpunten) |
| --- | ---: | ---: | ---: |
| client per locatie (4 bestanden, gemiddeld) | 34,4 kB (1,3–1,5 %) | 45,6 kB (1,7–1,9 %) | 9,8–13,5 kB |
| plus tabellenbestand, eenmalig | 30 kB | 30 kB | — |
| 4G na het manifest (60 ms RTT + grootste bestand op 9 Mbps) | ≈ 80 ms | ≈ 84 ms (p95 radar: 111 ms) | 70 ms |
| live op prod, nieuwste + 1 run | 13,0 MB (+12 %) | 16,4 MB (+15 %) | 5,8–6,6 MB |
| geschreven per dag (op schijf) | 270 MB (+63 %) | 569 MB (+132 %) | 274–350 MB |
| bestanden live | 1.184 + 2 | 1.184 + 2 | 888 |
| ingest-CPU per dag | ≈ 4,3 min (0,3 % van één vCPU) | ≈ 13 min (0,9 %) | ≈ 19 min |
| wandklok per publicatie (2 draden) | radar 0,36 s, harmonie 2,5 s | radar 1,34 s, harmonie 2,9 s | — |

Waarom meer bytes dan de MIP schatte (het prototype las alleen de eigen cel van een gekozen tijdlijn):

1. **Regenpatch en beweging.** Voor de tussenbalken leest het histogram regen als patch van 17 cellen rond de plek,
   met bewegingsvectoren. Dat maakt het regenvenster ≈ 3,3× zo groot. De HARMONIE-regen alleen is ≈ 9 kB per
   bestand (droog).
2. **Alle chunks.** Beide lead-chunks (l1-24, l25-48) en de historische run gaan mee, niet alleen de gekozen
   frames.
3. **ECMWF echt gemeten**: 8,9 kB per bestand, niet de ≤ 2 kB uit de schatting (17 chunks, 64 stappen en 9 dagen).

Per chunk los (droog, `--per-chunk`, gemeten toen de tabel nog in elk bestand stond, dus incl. ≈ 600 B per chunk):
radar 1,8–2,0 kB per chunk; harmonie-regen 9,8 kB; de andere HARMONIE-velden 0,6–2,3 kB; ECMWF 0,7–2,3 kB.

De publicatie van het manifest wacht op de radargroep: 0,4–1,3 s per 5 min op 2 vCPU.

## Uitvoer

~/data/motregen-u102/live-20261109: nu 2026-11-09T10:15:00Z, 60 chunks, 148 regio's met een bestand, zstd 19, 2 rayon-draden

| groep | chunks | bestanden | bytes per run | gem. / p95 per bestand | op schijf (4 KiB) | ongecomprimeerd | kop (los gecomprimeerd) | decode / knippen / zstd | wandklok | CPU (alle draden) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| radar | 3 | 148 | 236 kB | 1595 / 1850 B | 622 kB | 95485 kB | 438 B per bestand | 62 / 63 / 221 ms | 355 ms | 620 ms |
| harmonie | 31 | 148 | 3338 kB | 22559 / 25964 B | 3682 kB | 48485 kB | 973 B per bestand | 93 / 15 / 2396 ms | 2508 ms | 4890 ms |
| extra | 3 | 148 | 195 kB | 1322 / 1650 B | 606 kB | 1706 kB | 343 B per bestand | 16 / 1 / 205 ms | 222 ms | 410 ms |
| ecmwf | 17 | 148 | 1317 kB | 8900 / 11525 B | 1597 kB | 2446 kB | 693 B per bestand | 9 / 2 / 273 ms | 284 ms | 540 ms |

Per locatie (som van het gemiddelde bestand per groep): 34376 B
verify radar: 94639468 waarden en 317046 bewegingsblokken gelijk aan het raster
verify harmonie: 46972088 waarden en 140577 bewegingsblokken gelijk aan het raster
verify extra: 1592230 waarden en 0 bewegingsblokken gelijk aan het raster
verify ecmwf: 1825847 waarden en 0 bewegingsblokken gelijk aan het raster

~/data/motregen-devdata/data: nu 2026-09-30T07:10:00Z, 59 chunks, 148 regio's met een bestand, zstd 19, 2 rayon-draden

| groep | chunks | bestanden | bytes per run | gem. / p95 per bestand | op schijf (4 KiB) | ongecomprimeerd | kop (los gecomprimeerd) | decode / knippen / zstd | wandklok | CPU (alle draden) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| radar | 3 | 148 | 1279 kB | 8644 / 56825 B | 1642 kB | 95499 kB | 475 B per bestand | 71 / 55 / 1207 ms | 1344 ms | 2470 ms |
| harmonie | 31 | 148 | 4058 kB | 27425 / 30302 B | 4362 kB | 48490 kB | 990 B per bestand | 96 / 20 / 2804 ms | 2923 ms | 5530 ms |
| extra | 2 | 148 | 95 kB | 646 / 753 B | 606 kB | 1245 kB | 247 B per bestand | 1 / 0 / 142 ms | 144 ms | 270 ms |
| ecmwf | 17 | 148 | 1317 kB | 8900 / 11525 B | 1597 kB | 2446 kB | 693 B per bestand | 11 / 3 / 309 ms | 324 ms | 620 ms |

Per locatie (som van het gemiddelde bestand per groep): 45615 B
verify radar: 94639468 waarden en 317046 bewegingsblokken gelijk aan het raster
verify harmonie: 46972088 waarden en 140577 bewegingsblokken gelijk aan het raster
verify extra: 1169692 waarden en 0 bewegingsblokken gelijk aan het raster
verify ecmwf: 1825847 waarden en 0 bewegingsblokken gelijk aan het raster
