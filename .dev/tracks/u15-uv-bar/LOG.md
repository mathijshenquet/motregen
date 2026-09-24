# U15 — UV-bar met/zonder wolken — LOG

Append-only, nieuwste onderaan.

## 2026-09-24 08:20 — start, data-onderzoek
- Branch `track/u15-uv-bar` ff naar main (90ba86e, spec gecommit).
- KNMI-NetCDF `uviec_bx_hr_YYYYMMDD.nc` bevat naast `uvi_cloudy` ook `uvi_clear`
  ("Erythemal UV index cloud-free"; cloudy = "uvi_clear times cloud modification factor").
  Cruciaal: `uvi_clear` is gevuld voor ÁLLE tijden met zon op (04:00–19:00 UTC op 23 sep),
  ook waar `status` = 0 — dus KNMI-heldere-hemel-UV voor de rest van vandaag, met de ozon van vandaag.
- Besluit: ingest publiceert `uv_clear` (source `uv`, zelfde quant) voor elk tijdstip met data.

## 08:35 — kalibratie heldere hemel (26 dagen, elke 7e dag 1 apr – 23 sep, KNMI-archief)
`uv run --with h5py --with numpy --with scipy python .dev/tracks/u15-uv-bar/clearfit.py <dir met uviec_bx_hr_*.nc>`
(n = 472k cel-kwartieren NL-box). Resultaat:
| model | RMSE | bias | UV≥3 RMSE | UV≥3 bias |
| Madronich 12,5·μ^2,42 | 1,408 | +1,023 | 2,189 | +2,072 |
| U4: ×0,84 | 0,768 | +0,513 | 1,173 | +1,012 |
| a·μ^b (8,72; 2,514) | 0,347 | −0,019 | 0,551 | −0,040 |
| **+ ozonseizoen (9,20; 2,584; −0,127; dag 102)** | **0,277** | **−0,023** | **0,445** | **−0,015** |
- U4-schatting overschat dus in de zomer ~+1 UV bij hoge zon (was gekalibreerd op één septemberdag).
- Dag-op-dag ozon: KNMI-clear De Bilt 12 u in juni–juli 5,1…7,7; model 6,3. Onvermijdelijk zonder ozonverwachting.
- In analyses is cloudy ≤ clear + 0,1 in 100 % van de cellen → CMF ≤ 1; schatting geclampt op ≤ clear.

## 08:45 — kalibratie wolkenfactor
`uv run --with numpy --with zstandard --with h5py python .dev/tracks/u15-uv-bar/cmffit.py <datadir> <uviec nc>`
(prod-datadir 23 sep, HARMONIE 06Z/10Z-straling, n ≈ 66k cel-uren):
| model | RMSE | bias |
| U4 0,84·Madronich·CMF^0,35 | 0,376 | +0,041 |
| KNMI-clear·CMF^0,30 | 0,363 | +0,022 |
| seizoensfit-clear·CMF^0,30 | 0,409 | −0,142 (clear-fit −0,185 die dag) |
- Besluit: bewolkt vooruit = clear × CMF^0,30 (k = 1), met clear = KNMI `uv_clear` waar
  aanwezig (vandaag), anders de seizoensfit. Op de septemberdag gelijkwaardig aan U4; in de zomer
  zonder de +1-bias van de oude clear-basis.

## 08:50 — ingest
- `knmi-hdf5`: `UvProduct.clear_frames` (alle tijden met eindige `uvi_clear`).
- `pipeline::build_uv_chunks` → `uv` + `uv_clear`-chunk (bestandsnaam `uv_clear-<run>-g…`), daemon houdt Vec.
- Bytes (23 sep 13:43-file): uv 30 frames 107 380 B; **uv_clear 61 frames 42 145 B** (glad veld).
- `cargo clippy --workspace -- -D warnings` → CLIPPY-EXIT: 0.

## 08:55 — frontend
- `core/uv.ts`: WHO-klassen (`uvLevel`), nieuw `clearSkyUv(mu, epoch)`, `estimateUv(..., clearUv)`,
  `uvReading()` per rij. `uvAdvice`-sterktes nu WHO-namen (matig/hoog/zeer hoog/extreem).
- `UvBar`: schaal 0–12 met WHO-kleurband, bewolkt = gevulde bar, onbewolkt = omlijnde ghost
  (`double`) of stip (`dot`, `?uvbalk=stip`); getal + klassewoord vanaf 3; nacht = lege gedempte bar.
- `uv_clear` laadt via eigen effect (zoals straling): alleen rij-uren, alles bij complete puntreeks.
- `pnpm typecheck` → 0; `pnpm test` → TEST-EXIT: 0 (198 tests).
