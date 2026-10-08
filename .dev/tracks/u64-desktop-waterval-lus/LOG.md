# U64 — desktop waterval en laadtijd-lus

## 2026-10-08 — start

- Opdracht: stap 0 volledig meten vóór een productwijziging, daarna MIP-23 Track B. Werkboom `track/u64-desktop-waterval-lus`, rig 4394/8394, preview 4360.
- Omgeving actief: bash-runner, devenv/direnv met `DEVENV_ROOT` naar deze worktree; pnpm/node uit Nix. Werkboom aanvankelijk schoon.
- Dit LOG is op expliciet verzoek committed en append-only. Ruwe PO-profielen staan in de gitignored submap `macbook-firefox/` (ook de Chrome-opname); meetbuilds en ruwe rig-uitvoer in gitignored `tmp/u64/`.
- Volgende stap: desktop koud ×3 met netwerk-/CPU-waterval, MacBook-opnames analyseren, kritieke keten documenteren. Zichtbare placeholder pas activeren na screenshot en voorstel aan de orkestrator.

## 2026-10-08 05:52 UTC — meetbronnen en onderscheid

- PO-Firefox gereproduceerd met `cd web && pnpm prof:firefox ../.dev/tracks/u64-desktop-waterval-lus/macbook-firefox/*.json.gz` (alleen Firefox-bestanden): motregen manifest 396–581 ms; 39 headers 590–1512 ms / 171.521 B; regen-Ranges 734–1579 en 1580–1859 ms. De stijl kwam uit cache. Werkelijk ttfp en GPU-fasen ontbreken; dit is geen koude meting.
- PO-Chrome gelezen met `pnpm exec tsx scripts/devtools-trace.ts .../Trace-20261007T204942.json.gz --window=0,3000`; één taak van 71 ms tijdens initialisatie. Volgende stap: navigatierelatieve netwerk- en compiletijden uit de volledige trace.
- `perf:mobile --profile desktop --scenario koud-spelend --basemap own --repeat 3` gestart (4394/8394); bouw geslaagd, rig wacht op loadavg ≤8. Geen productcode aangepast.
- Eerlijkheidsgrens: de bestaande mobiele rig gebruikt ook onder `desktop` een Pixel-context met 4 cores/4 GB en coarse pointer (alleen viewport 1280×800 en CPU-rate 1). Aanvullende `scripts/desktop-start.ts` meet een Desktop-Chromecontext met 8 cores/8 GB, CPU-rate 1, SW geblokkeerd voor koud; V8-trace voegt meetoverhead toe. Dit aanvullende meetcontract vervangt de bestaande gate niet.

## 2026-10-08 05:56 UTC — voorlopige waterval, nog geen productwijziging

- `STAP-0.md` bevat de MacBook-tabel en expliciete gaten. Firefox is deels warm; Chrome is vrijwel volledig warm voor kaart/data. Chrome-entry 409 kB transfer / 1.407 kB uitgepakt; parse CPU 16,66 ms, compile CPU 1,13 ms. Het parsevenster van 162 ms bevat netwerk-wachten en mag geen CPU-tijd heten.
- Correctie op het eerdere logkopje “05:52 UTC”: dat kopje was een schatting tijdens schrijven, niet de werkelijke kloktijd (de betreffende stap was vóór 05:47 UTC). Vanaf hier tijd uit `date -u`.
- Rig koud-spelend: eerste twee runs beschikbaar (298 decodes elk; 1.680.992 / 1.686.015 B), derde wacht op rustige host. Ook de aanvullende Desktop-Chrome CPU-capture wacht daarop. Geen loadgrens aangepast.
- Checks van meetgereedschap: typecheck exit 0; unit-tests exit 0 (72 suites / 478 tests); gewone build loopt. Desktop-compare en gerichte e2e nog te doen. Geen productcode aangepast vóór de complete stap-0-tabel.

## 2026-10-08 05:57 UTC — eerste meetgereedschap-commit

- Reprochecks:  exit 0; Generated 849 frames in 44 chunks

 RUN  v3.2.7 /home/mathijs/worktrees/motregen/track-u64-desktop-waterval-lus/web

 ✓ scripts/basemap-range-cache.test.ts (4 tests) 8ms
 ✓ src/core/solar.test.ts (4 tests) 4ms
 ✓ src/core/stable.test.ts (2 tests) 3ms
 ✓ src/core/isoline-spline.test.ts (4 tests) 4ms
 ✓ src/core/temperature-palette.test.ts (14 tests) 58ms
 ✓ src/core/presets.test.ts (8 tests) 6ms
 ✓ src/core/telegram-presets.test.ts (3 tests) 4ms
 ✓ src/core/temperature.test.ts (22 tests) 65ms
 ✓ src/core/wind-water-geometry.test.ts (2 tests) 5ms
 ✓ src/core/isolines.test.ts (21 tests) 71ms
 ✓ src/core/frame-cache.test.ts (3 tests) 3ms
 ✓ src/core/usage.test.ts (7 tests) 11ms
 ✓ src/core/location-memory.test.ts (6 tests) 6ms
 ✓ src/core/map-constraint.test.ts (9 tests) 6ms
 ✓ src/core/geocoder.test.ts (6 tests) 13ms
 ✓ src/core/fetch-planner.test.ts (7 tests) 29ms
 ✓ src/core/uv.test.ts (14 tests) 6ms
 ✓ src/core/wind-water-layer.test.ts (3 tests) 24ms
 ✓ scripts/mobile-report.test.ts (10 tests) 9ms
 ✓ src/core/basemap.test.ts (6 tests) 25ms
 ✓ src/core/pred.test.ts (3 tests) 162ms
 ✓ src/core/isoline-contours.test.ts (9 tests) 61ms
 ✓ src/core/rain-layer.test.ts (5 tests) 5ms
 ✓ src/core/focus-mode.test.ts (13 tests) 29ms
 ✓ src/core/dev-settings.test.ts (3 tests) 12ms
 ✓ src/core/wind.test.ts (2 tests) 24ms
 ✓ src/core/wind-layer.test.ts (26 tests) 146ms
 ✓ src/core/places.test.ts (2 tests) 10ms
 ✓ src/core/perf.test.ts (10 tests) 9ms
 ✓ src/core/weather.test.ts (5 tests) 6ms
 ✓ src/core/time-model.test.ts (11 tests) 17ms
 ✓ src/core/sun.test.ts (3 tests) 5ms
 ✓ src/core/forecast.test.ts (4 tests) 7ms
 ✓ src/core/window-ready.test.ts (3 tests) 7ms
 ✓ src/core/manifest-refresh.test.ts (4 tests) 8ms
 ✓ src/core/playback.test.ts (2 tests) 4ms
 ✓ scripts/prof-source-map.test.ts (6 tests) 15ms
 ✓ src/core/map-frame.test.ts (2 tests) 4ms
 ✓ src/core/decode-budget.test.ts (4 tests) 4ms
 ✓ src/core/isoline-layer.test.ts (7 tests) 5ms
 ✓ src/core/rain-chart.test.ts (4 tests) 7ms
 ✓ src/core/pdok.test.ts (2 tests) 7ms
 ✓ src/core/motion-selection.test.ts (3 tests) 12ms
 ✓ src/core/screen-truth.test.ts (3 tests) 3ms
 ✓ src/core/wind-water-mask.test.ts (6 tests) 12ms
 ✓ src/core/saved-places.test.ts (1 test) 3ms
 ✓ src/core/activity.test.ts (2 tests) 7ms
 ✓ src/core/clock-timeline.test.ts (8 tests) 8ms
 ✓ src/core/freshness.test.ts (7 tests) 4ms
 ✓ src/core/moon.test.ts (4 tests) 7ms
 ✓ src/core/decode-queue.test.ts (6 tests) 7ms
 ✓ src/core/frame-batcher.test.ts (2 tests) 11ms
 ✓ src/core/profile-recorder.test.ts (2 tests) 14ms
 ✓ src/core/intent.test.ts (8 tests) 3ms
 ✓ scripts/prof-check.test.ts (2 tests) 3ms
 ✓ src/core/playback-gate.test.ts (9 tests) 7ms
 ✓ scripts/mobile-fidelity.test.ts (2 tests) 9ms
 ✓ src/core/day-night-layer.test.ts (2 tests) 2ms
 ✓ src/core/pin-navigation.test.ts (5 tests) 14ms
 ✓ src/core/expressive.test.ts (3 tests) 4ms
 ✓ scripts/prof-top.test.ts (2 tests) 10ms
 ✓ src/core/isoline-field.test.ts (3 tests) 8ms
 ✓ src/core/cloud-section.test.ts (15 tests) 957ms
   ✓ cloudSpanInSlot > covers the fraction on average and always leaves air on both sides of a loose cloud  911ms
 ✓ src/components/UvBar.test.tsx (2 tests) 25ms
 ✓ src/core/isoline-labels.test.ts (2 tests) 159ms
 ✓ src/components/HistogramScrubber.test.tsx (15 tests) 287ms
 ✓ src/components/Freshness.test.tsx (8 tests) 285ms
 ✓ src/core/wind-layer-viewport.test.ts (10 tests) 2416ms
   ✓ wind across map movement (U12) > never lets a visible head vanish from one frame to the next, also where the wind jumps or has gaps (U24)  1077ms
 ✓ src/core/mrf.test.ts (26 tests) 2327ms
   ✓ mrf v0 > serves predictive feels_like_c frames byte-identical to the bitmap for every point (tabel en kaart)  2124ms
 ✓ src/components/About.test.tsx (6 tests) 455ms
 ✓ src/components/LocationSearch.test.tsx (9 tests) 674ms
   ✓ location search > shows a Flemish municipality as "· BE" and selects it without a PDOK lookup  331ms
 ✓ src/components/ForecastTable.test.tsx (20 tests) 1874ms
   ✓ forecast table headings > uses the first heading as a regular table mode on portrait mobile  373ms

 Test Files  72 passed (72)
      Tests  478 passed (478)
   Start at  07:57:17
   Duration  4.61s (transform 9.62s, setup 0ms, collect 21.08s, tests 10.52s, environment 2.49s, prepare 6.06s) exit 0 (72/478); vite v7.3.6 building client environment for production...
transforming...
✓ 120 modules transformed.
rendering chunks...
computing gzip size...
tmp/u64-step0-build/manifest.webmanifest                            0.50 kB
tmp/u64-step0-build/index.html                                      3.08 kB │ gzip:   0.97 kB
tmp/u64-step0-build/assets/isolines.worker-BH9AylyU.js              4.27 kB
tmp/u64-step0-build/assets/isoline-tracer.worker-hq6kdAIg.js        8.91 kB
tmp/u64-step0-build/assets/zstd.worker-DyQKI1dV.js                  9.24 kB
tmp/u64-step0-build/assets/wind-water-mask.worker-CF9kMZb7.js      16.30 kB
tmp/u64-step0-build/assets/index-BejfGPON.css                     147.61 kB │ gzip:  26.42 kB
tmp/u64-step0-build/assets/profile-recorder-c58MnRDY.js             3.09 kB │ gzip:   1.44 kB │ map:    12.14 kB
tmp/u64-step0-build/assets/workbox-window.prod.es5-BBnX5xw4.js      5.81 kB │ gzip:   2.40 kB │ map:    13.57 kB
tmp/u64-step0-build/assets/index-Bjpg2SSN.js                    1,431.78 kB │ gzip: 417.87 kB │ map: 3,854.04 kB
✓ built in 5.20s

PWA v2.0.0
mode      generateSW
precache  25 entries (2326.43 KiB)
files generated
  tmp/u64-step0-build/sw.js.map
  tmp/u64-step0-build/sw.js
  tmp/u64-step0-build/workbox-ffe34739.js.map
  tmp/u64-step0-build/workbox-ffe34739.js exit 0. De compile-samenvatting telt CPU-tijd van parse-kinderen en compile-events apart, zonder het wachtvenster mee te tellen.
- Eerste commit/draft-PR bevat alleen meetgereedschap en de voorlopige tabel. Desktop-compare en e2e zijn nog pending; de derde stap-0-run wacht op hostload, geen productcandidate actief. PR-status zal dat expliciet zeggen.
