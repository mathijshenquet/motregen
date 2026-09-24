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

## 09:00–09:25 — schetsen en layout
- Screenshots: preview (`vite preview`) tegen prod-data (motregen.nl) + lokale `uv_clear`-chunk van vandaag via caddy,
  en tegen synth-data. Scripts: `shot.mjs` (tabel), `swatch.mjs` (staalkaart met dezelfde CSS/DOM, 7 gevallen × 2 varianten).
- Eerste versie liet de tabel overlopen (490 px in 421 px zijbalk): UV-cel nu gestapeld (bar boven, getal + klasse
  eronder, ~74 px), klassewoord zakt bij "≈8,4 zeer hoog" naar een eigen regel i.p.v. afkappen. Tabel = 421 px (gemeten).
- Ghost eerst onzichtbaar tegen de kleurband: band 16 %, ghost gearceerd + omlijnd in de klassekleur van onbewolkt.
- Chip-bar was onzichtbaar (inline span in blockcontext) → track `display: block`.
- Vandaag (24 sep) op prod: bewolkt ≈ onbewolkt (0,8 vs 0,85; HARMONIE-CMF ~0,8 → ^0,3 ≈ 0,94) — geen bug, gewoon helder.
- **Keuze: variant A (dubbele vulling)**, default; B via `?uvbalk=stip`. Motivatie: A leest als één glyph
  "zoveel nu, tot hier zonder wolken" en de ghost-tint verraadt de klasse die je zónder wolken haalt (dik bewolkt:
  groene vulling, oranje ghost). De stip botst bij kleine verschillen met het vullingseinde (drempel 0,3 nodig)
  en is in de 46 px-chip bijna een losse knikker. PO beslist op zicht: `staalkaart-licht.png`, `staalkaart-donker.png`,
  `synth-tabel-{dubbel,stip}.png`, `prod-tabel-dubbel.png`.

## 09:25 — PO-queue: host-overbelasting
- Preview-servers (4315/4316) en beide caddy's gestopt; geen Chromium meer buiten `flock /tmp/motregen-e2e.lock`.
- main gemerged (20b24f2: flock in pnpm e2e-scripts).

## 09:30 — gates (synchroon)
- `cargo fmt --all --check` 0; `cargo test --workspace` 0 (54 passed); `cargo clippy --workspace -- -D warnings` 0;
  Cargo.lock ongewijzigd t.o.v. main (0).
- web: `pnpm typecheck` 0; `pnpm test` 0 (198); `pnpm build` 0.
- e2e: wacht op load < 16 (was 21,08 om 09:30), dan `MOTREGEN_E2E_PORT=4333 MOTREGEN_E2E_DATA_PORT=8333 pnpm e2e` (flock).

## 09:07–09:47 — e2e rood → twee oorzaken gevonden (allemaal onder flock, load < 16 gepolld)
- Run 1 (start 09:07:28, load 12,29): E2E-EXIT 1 — poort 4333 bezet door U13's `vite preview` (spec-poortbotsing);
  niets getest. Verder op eigen poorten 4335/8335.
- Run 2 (start 09:12:33, load 9,86): E2E-EXIT 1 — perf.spec:129 op alle 3 profielen (tweede locatieklik
  `{reset:true, stage:"window"}`); orchestrator zag hetzelfde op main+U14+U15.
  Oorzaak: mijn uv_clear-effect laadde bij `complete` álle 65 kwartierframes → gedeelde `LruCache(512)`
  van gedecodeerde frames liep over → `readCachedPointSeries` niet meer compleet → terug naar initial/window.
  Fix (7eed9cc): alleen uurframes van tabelrijen (zoals straling); chip pakt onbewolkt van de dichtstbijzijnde rij.
- Run 3 (start 09:22:44, load 14,71): E2E-EXIT 1 — :129 nu groen op alle profielen; nieuw: desktop warm
  reload 1678 B chunkbytes (budget 0), mobiel binnen budget maar dezelfde 1678 B.
- main (U14) gemerged (f8501ef); typecheck 0, test 0 (199), build 0.
- perf.spec los (start 09:37:20, load 14,88): PERF-EXIT 1, deterministisch 1678 B = uv_clear-header-rest (818 B)
  + frame (260 B). Trace: koud vuurt de uv_clear-frame-Range 7 ms na het einde van de header-Range op dezelfde
  URL — Chromium schrijft die cache-entry dan nog (zie commentaar `fetchRangeChunks`): header afgekapt op 4096,
  frame niet gecachet. Andere velden vragen frames pas in de direct-fase (≥ 450 ms later).
  Fix: uv_clear-effect wacht tot `pointLoadStage` ≠ `initial`.
- Volledige e2e (start 09:48:25, load 13,82): E2E-EXIT 1 — alleen desktop warm 1678 B; de stage-gate hielp niet
  (trace: frame-Range nu 485 ms na de header, nog steeds niet gecachet). Hypothese "race" verworpen.
  Wel consistent: bij alle andere chunks wordt de payload uiteindelijk aaneengesloten opgehaald; bij
  uv_clear bleef één losse frame-Range met een gat na de header — die bytes cachet Chromium niet blijvend.
- Fix: `MrfClient.fetchPayload(chunk)` haalt de hele (kleine) uv_clear-payload als één Range zonder te decoderen;
  de rij-frames lezen daaruit (decodeerdruk blijft uurframes). Kosten: prod ~40 KB eenmalig i.p.v. ~10 KB.
- perf.spec los (start 09:58:44, load 3,29): PERF-EXIT 0; warm chunk transfer 0 B desktop/4G/3G; passive 762 274 B.
- **Volledige e2e (start 10:01:04, load 9,97; `MOTREGEN_E2E_PORT=4335 MOTREGEN_E2E_DATA_PORT=8335 pnpm e2e`): E2E-EXIT 0**
  (20 passed, 13 skipped — zelfde skips als eerdere runs). Tree = main (incl. U14) + U15.
- Slotgates na merge main: cargo test --workspace 0; clippy -D warnings 0; Cargo.lock = main (0); typecheck 0; pnpm test 0 (199); pnpm build 0.
