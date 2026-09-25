# U35 isobaren — worker LOG (claude opus 5.5)

## 2026-09-25 — start
- Branch `track/u35-isobaren` gereset op main 60ae569 (was spec-commit 71805a2, zelfde inhoud).
- `data/` in de worktree = symlink naar /home/mthq/motregen/data (niet committen).
- grib_ls op HA43_N20_202608281200_00100_GB: parameter 1 komt twee keer voor —
  `indicatorOfTypeOfLevel` "103" niveau 0 (MSLP, 996,9–1014,6 hPa) en "sfc" niveau 0
  (oppervlaktedruk, 906–1011 hPa). Selector moet dus op "103", niet op sfc.
- **Spec-afwijking (kwantisatie)**: 0,1 hPa over 940–1060 = 1201 niveaus; mrf-cellen zijn u8
  (255 waarden + no-data), dat past niet. Gekozen: 0,5 hPa, index 0 = 940 hPa, index 254 =
  1067 hPa. Isobaarstap 4 hPa = 8 kwantisatiestappen (temp: 1 °C / 0,3 = 3,3), en de
  isolijnlaag blurt + B-splinet, dus terrassen vallen weg. Records NL ~954–1049 hPa.

## 2026-09-25 — ingest klaar
- knmi-grib: selectie matcht nu op (niveautype, parameter, niveau); MSLP = ("103", 1, 0), tri 0.
  Test `tests/arome_fields.rs` op het echte lid: min/max 99 689,8 / 101 456 Pa (= grib_ls), grid = temp-grid.
- ingest: `pressure_hpa` (Pa/100, 3×3-integratie naar 6 km zoals temp_c, pred-codec), tabel 940 + 0,5·i.
  Unit: tabelwaarden + quantize 1012,1→144, 930→0, 1100→254, NaN→255; chunk-split-test 16 chunks.
- `cargo test --workspace` CARGO-TEST-EXIT 0.
- Live `--once` (release, scratch data-dir, 13:56Z): DAEMON-EXIT 0 na 97 s; `spec/validate_manifest.py`
  VALIDATE-EXIT 0 (30 chunks, veld pressure_hpa aanwezig). Run 11Z: frame 0 = 1016–1023 hPa.
- **Bytes live (run 11Z + hist 06Z)**: pressure_hpa l1-24 31 242 B, l25-48 31 624 B, hist5 7 912 B =
  70 778 B voor de volledige sessie (vóór: 0; ter vergelijking feels_like_c pred 534 284 B, temp_c 769 299 B).
  Passief (zonder windfocus) +0 B frames — zie client.
- Oude clients: `buildTimeline` selecteert op `field`, onbekend veld wordt overgeslagen; `validateHeader`
  accepteert elk veld met 256-tabel + pred v1. Wel: App prefetcht bij start de header van ÁLLE chunks
  (high priority) → client sluit pressure_hpa daar uit (lazy); oude clients halen 3 extra headers (~3 KB).
