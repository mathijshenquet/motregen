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

## 2026-10-08 05:59 UTC — zichtbaarheid en warme-meetvoorbereiding

- Meetcommit  gepusht; remote-tip gecontroleerd met 45b3e56d533c8117df4e74b4aa9d119f8769212f	HEAD
45b3e56d533c8117df4e74b4aa9d119f8769212f	refs/heads/main
eedf0e6f095150c963a484b901d598387e37d664	refs/heads/track/t1-arome-spike
3881aeb2c51778687e8adc59fb435b32e878c05a	refs/heads/track/t2-ingest
33828174415e91d3bce219e0a91e7c5a6e866acd	refs/heads/track/t2a-mrf-core
6125beff2626e43aa7833bc2d7d3127341ab224a	refs/heads/track/t2b-fields
a49f60d0219ce38375c454d6cdca140c31ba6666	refs/heads/track/t2c-grid-en-velden
f4ee77dc0e13b2d2074623bdf3be7ae4acde1b6c	refs/heads/track/t2d-motion
5b4442141a26e55fb40ded586811189e2650994f	refs/heads/track/t2e-seamless
e5ef4b5d61d97b1a117cd9cee4868e2a35a6f376	refs/heads/track/t2f-wind-prior
e24fe5463ef97827c361f82a141415d4d31b84c4	refs/heads/track/t2g-data-dieet
52abdbc238873076968a0b4ed4fee8c6075bcf10	refs/heads/track/t2h-verse-publicatie
23d0d10ca92373ab27458a71b3977c58f567ef7e	refs/heads/track/t3-frontend-shell
733279324fd13b2bc2362350bfb033dcf8cae899	refs/heads/track/t3b-ux-round1
68f917769487d82d0895b24b748059e00c7dd962	refs/heads/track/t3c-kaartlagen
e1c404a55ccd985705e5425d5c5ede6c6c2279a8	refs/heads/track/t3d-zon-en-nacht
443735fb3367b42c901284b125c70ef865112162	refs/heads/track/t3e-nitpicks
b58c615329b0569e6b9c26e031a7c79d211f14fe	refs/heads/track/t3f-flow-tween
406b79ee3d60c470b9c925a026aa3665816f0b10	refs/heads/track/t3g-po-iteratie
5b253ad6c0040c96a32f6ca1c92bac5e4913b4d0	refs/heads/track/t3h-progressief-laden
31622545995c4f67dbd0f7eef2c85d69165797d3	refs/heads/track/t3h2-skeleton-streaming
1606cb4aaa03a637f2d209f05ff3cff59a619d2a	refs/heads/track/t3i-trail-ghosts
d3d8f96b7938c955e9f9ba0db3433404cb55b65e	refs/heads/track/t3j-temp-dodge
b8da5b4e829c5ce0761a947d5264f9d0fbd625a6	refs/heads/track/t3k-horizon-3u
8c15817e6e3a51c20c124824fd2534ec3a033959	refs/heads/track/t3l-auto-refresh
af2566ac24f77b563767314bd20bdb697e4486c6	refs/heads/track/t4-deploy
7781a8a55f2a5ba83354f9663659bb89bcafad69	refs/heads/track/t4b-stable
90ce235834ef394431c3e110cf2f15dbd773f76a	refs/heads/track/t5-e2e-perf
52003b466bfe73dddbba68285448401975b5369c	refs/heads/track/t5b-mobiel-profiel
ae47e98f88aac0bce2d9a2f6ed21f3ca9c0d8028	refs/heads/track/t5c-buienradar-benchmark
207e6b39115cdc6119bef093d95d7abee7e0e78e	refs/heads/track/u1-laadprofiel
6855ca5dcbd700cfb16123efb2ac15b94ac01891	refs/heads/track/u10-versheid
5ff7324893a8ad5e49bd65056c91967e669ea3d0	refs/heads/track/u11-lucide-icons
ac743abb72934269abf53a300feea865d0345650	refs/heads/track/u12-wind-zoom
d69cb15b17150cf6e9b33d91689f9e47b893c946	refs/heads/track/u13-isolijnen-analytisch
dcd3c263a1eef7fde3e203b5a745cf48b02d0f85	refs/heads/track/u14-mobiel-layout
2418b2a4813db10a8ad5f4a738b90179669c2222	refs/heads/track/u15-uv-bar
71893fff7e986a94da8c01593383d3f7e1136948	refs/heads/track/u16-isolijnen-polish
b5f5d3e765cb01c3a18e3e79b93ebb22fb9cf34c	refs/heads/track/u17-ui-polish
f830a5db2760702b96dc4116ca390377d6470262	refs/heads/track/u18-dct-veld
009bb2439b9216fef852e04695f33552c7a6f491	refs/heads/track/u18b-veld-compressie
34c7d17f7f7d71660ad6ffb66685480a0544971e	refs/heads/track/u19-focus-triggers
6317c4d0ee6b0b758a897a31381afd8c13c584d1	refs/heads/track/u2-kaart-locatie
f29a0251b70f7c3259442775a1b91c4fd19e7d60	refs/heads/track/u20-wind-regressie
5fff3b2c5260182035cc9a355040b989582f3ea8	refs/heads/track/u21-klok-midden-boven
1feb08500a149e918002ae1c2064820732506971	refs/heads/track/u22-bovenrand-en-shell
be8f657afc83d33d99a2c0d1d1376e0b80ea1360	refs/heads/track/u22b-klok-kaal
27fefbc8de2bd1920c6578348820e41b953babc6	refs/heads/track/u23-tabelkoppen-als-modeknoppen
4013a521ee9b7bb823618ee4d1e50ee8ac5f7b9d	refs/heads/track/u24-slot-log
f04535e439615eade08ce13986eff7a460b4b790	refs/heads/track/u24-wind-kwaliteit
b0f8a9a0df084c0592bff9489a6130af9d5c53ab	refs/heads/track/u24b-randspawn
fdfbed174aa1e4aa35535ec0f13f47906c80a8ed	refs/heads/track/u25-temperatuurkaart-kleur
4e113da1c88788e7505d84cd7a02c897785f5720	refs/heads/track/u25b-palet-lokaal
f9ea3195f916e8d55463c813f4d59067ffb92044	refs/heads/track/u26-pin-navigatie
11248b61ba9865a9ac006973b10052c9693cefbb	refs/heads/track/u27-vlaanderen
33775c28a67675ba74167bf6c62dfaea9a8d6db9	refs/heads/track/u3-wind-trails
4303ef6b1af5c966ce96f49658e286bdc3eacdc1	refs/heads/track/u30-dev-opties-snoeien
d9ef78ba2cc55e504fe9b3e1a4ca356bc3c5f26d	refs/heads/track/u31-gebruiksbaken
4b6cb0e9734118ae6749d6baf79ea8f3b7650052	refs/heads/track/u32-gebruiksmeting-deploy
6c1aaf5308a724e0e19b9a33545cc72fa94c59fe	refs/heads/track/u33-vindbaarheid
079f1f94cb28125ff220385dbef793deceb07447	refs/heads/track/u34-wind-live
bf2b47010a4c74daab18d97d52fd589633abfe82	refs/heads/track/u35-isobaren
b55762525337239e9de2979d6aea35aae3576e84	refs/heads/track/u36-windstoten-eenheid
b4ac4d0d89bc7e9d0d2a8ca85b2dbee3a9d53bdc	refs/heads/track/u37-wolkendoorsnede
7d85d7a699e883368d98e758fc4f22a869cbe485	refs/heads/track/u39-pollen-ingest
49293bc4e953348274f843af8f1f9818d2786cc4	refs/heads/track/u3b-wind-middenweg
d5fd6c9ec86b30759e2114f0b3c891605f91d572	refs/heads/track/u4-urenoverzicht
4f6834a4f29933eba949694de15e9abd471da7cf	refs/heads/track/u41-stil-in-rust
97f6fcb992dd950400be8ab0ed6ae5c6652e11a6	refs/heads/track/u42-tabel-modi-live
ce5fd22e86f835bc93d422b84955bcbd5879e9d3	refs/heads/track/u43-profielmodus
2a357eab2ffbd6da99f3e1372cf4f9c12e14e0e2	refs/heads/track/u44-presets-pwa
e9672eda551e87ae623d0081887b9de7e7db5a56	refs/heads/track/u45-telegram
83abf7b03755f6d2a12104e1a389b961ef043494	refs/heads/track/u46-wolken-webcam-poller
ac0242b09d4913e616f7e765e917cb1f642b608d	refs/heads/track/u47-wolken-tekening-live
64f3b1d65e37d7df4e33b082078f6dd8aef903ab	refs/heads/track/u48-watermasker-perf
5d394be0efb5f3eb24ab131d1b9a515881c2d01b	refs/heads/track/u49-decode-budget-mobiel
630e8d43b258bc7e4451ec3e6c1aa9a5746fe7cb	refs/heads/track/u5-gevoelstemperatuur
3c9ec783ee80dccbfb7f58eda8672d18e01e64e1	refs/heads/track/u50-zstd-content-size
da1d8d282b93015faec27558f9ba7ecb829099d8	refs/heads/track/u51-perf-journey-e2e
319d557c56ed0109ea32b7ad694233c54dc94ed6	refs/heads/track/u52-tijd-majeur-decoderen
ffc3f99ad41c582ac14ba55a0dc8a5008f73c744	refs/heads/track/u53-mobiele-laadrig
f9d805d3b218c476f562466ec538fd8029fde653	refs/heads/track/u54-laadchoreografie-live
57257c399b7ce5f1aa68a22c23f420e905cb554d	refs/heads/track/u55-telegram-snel-en-kaal
348f92a8aea16fb3e2780ef656bc4fa097f2b9de	refs/heads/track/u55-telegram-zonder-lucht
dc060482d08f752e58b42dd82e4e5fb3a3a10bdf	refs/heads/track/u56-klokpil-tijdlijn
09caedcd84a9369e7a8b338a8321189979a9a2b1	refs/heads/track/u58-finishing-touches-live
03c14ee36abef3372b38ea4434edba9429bd7409	refs/heads/track/u59-eigen-basiskaart
73fd830018e9280a448bc337b00dd2752b942f75	refs/heads/track/u6-kaart-zoom
416644ee450a24a612eb562d5a4fc82c12bd9b8c	refs/heads/track/u60-basiskaart-afwerking
6922ed9478cb7122fecfc67c0486ecfe9796e4ae	refs/heads/track/u61-nachtelijke-e2e-triage
dc5e3c7830217d66034cc64715339da10ce61ea3	refs/heads/track/u62-mobiele-hemel-venster
98fa722d244327f4dabcff7e72e300b6319402ba	refs/heads/track/u63-mobiel-ttfp-lus
b1a706752174bbd7f1cb2453ce3a740929d73775	refs/heads/track/u64-desktop-waterval-lus
28825410ac09574d9c6e3891800122d9b2cc72ed	refs/heads/track/u7-ontwerp-verfijning
c4548d6a50d6fb7f0678dde32d7dba9edcb92693	refs/heads/track/u8-temperatuur-isolijnen
985042119e45f47152480dcdedef076a2e94ec8a	refs/heads/track/u8b-isolijnen-vloeiend
5db020e1ac7ddd18555be46f6ef19aeca54cae98	refs/heads/track/u8c-isolijnen-stilstand
0ec3e0803f1daefebe1c4b0cc098e6102d0573f8	refs/heads/track/u9-histogram-polish
23d0d10ca92373ab27458a71b3977c58f567ef7e	refs/pull/1/head
443735fb3367b42c901284b125c70ef865112162	refs/pull/10/head
f4ee77dc0e13b2d2074623bdf3be7ae4acde1b6c	refs/pull/11/head
b58c615329b0569e6b9c26e031a7c79d211f14fe	refs/pull/12/head
5b4442141a26e55fb40ded586811189e2650994f	refs/pull/13/head
e5ef4b5d61d97b1a117cd9cee4868e2a35a6f376	refs/pull/14/head
15216721506f1b6400d97b82cf0993b6dfd4026e	refs/pull/15/head
90ce235834ef394431c3e110cf2f15dbd773f76a	refs/pull/16/head
33a47e7953ab974b135c697056e5bf021bea19c2	refs/pull/17/head
e24fe5463ef97827c361f82a141415d4d31b84c4	refs/pull/18/head
52003b466bfe73dddbba68285448401975b5369c	refs/pull/19/head
ef7fceab51465a6a1cedff07abd4f187eb6e4b76	refs/pull/2/head
ae47e98f88aac0bce2d9a2f6ed21f3ca9c0d8028	refs/pull/20/head
7781a8a55f2a5ba83354f9663659bb89bcafad69	refs/pull/21/head
5b253ad6c0040c96a32f6ca1c92bac5e4913b4d0	refs/pull/22/head
31622545995c4f67dbd0f7eef2c85d69165797d3	refs/pull/23/head
8c15817e6e3a51c20c124824fd2534ec3a033959	refs/pull/24/head
52abdbc238873076968a0b4ed4fee8c6075bcf10	refs/pull/25/head
d5fd6c9ec86b30759e2114f0b3c891605f91d572	refs/pull/26/head
6317c4d0ee6b0b758a897a31381afd8c13c584d1	refs/pull/27/head
630e8d43b258bc7e4451ec3e6c1aa9a5746fe7cb	refs/pull/28/head
207e6b39115cdc6119bef093d95d7abee7e0e78e	refs/pull/29/head
33828174415e91d3bce219e0a91e7c5a6e866acd	refs/pull/3/head
73fd830018e9280a448bc337b00dd2752b942f75	refs/pull/30/head
33775c28a67675ba74167bf6c62dfaea9a8d6db9	refs/pull/31/head
28825410ac09574d9c6e3891800122d9b2cc72ed	refs/pull/32/head
c4548d6a50d6fb7f0678dde32d7dba9edcb92693	refs/pull/33/head
49293bc4e953348274f843af8f1f9818d2786cc4	refs/pull/34/head
6855ca5dcbd700cfb16123efb2ac15b94ac01891	refs/pull/35/head
985042119e45f47152480dcdedef076a2e94ec8a	refs/pull/36/head
0ec3e0803f1daefebe1c4b0cc098e6102d0573f8	refs/pull/37/head
ff2e31bc0e614cc6b92246a3878b4d71bcaaddb1	refs/pull/38/head
5db020e1ac7ddd18555be46f6ef19aeca54cae98	refs/pull/39/head
733279324fd13b2bc2362350bfb033dcf8cae899	refs/pull/4/head
d69cb15b17150cf6e9b33d91689f9e47b893c946	refs/pull/40/head
260c0aacd08ffa22a2526c16ee40694a06abb88f	refs/pull/40/merge
dcd3c263a1eef7fde3e203b5a745cf48b02d0f85	refs/pull/41/head
ac743abb72934269abf53a300feea865d0345650	refs/pull/42/head
2418b2a4813db10a8ad5f4a738b90179669c2222	refs/pull/43/head
71893fff7e986a94da8c01593383d3f7e1136948	refs/pull/44/head
b5f5d3e765cb01c3a18e3e79b93ebb22fb9cf34c	refs/pull/45/head
f830a5db2760702b96dc4116ca390377d6470262	refs/pull/46/head
34c7d17f7f7d71660ad6ffb66685480a0544971e	refs/pull/47/head
009bb2439b9216fef852e04695f33552c7a6f491	refs/pull/48/head
8f4aa38ea0d7d301c7b562c580348ee02c8db86c	refs/pull/48/merge
f29a0251b70f7c3259442775a1b91c4fd19e7d60	refs/pull/49/head
3881aeb2c51778687e8adc59fb435b32e878c05a	refs/pull/5/head
5fff3b2c5260182035cc9a355040b989582f3ea8	refs/pull/50/head
f04535e439615eade08ce13986eff7a460b4b790	refs/pull/51/head
1feb08500a149e918002ae1c2064820732506971	refs/pull/52/head
fdfbed174aa1e4aa35535ec0f13f47906c80a8ed	refs/pull/53/head
27fefbc8de2bd1920c6578348820e41b953babc6	refs/pull/54/head
11248b61ba9865a9ac006973b10052c9693cefbb	refs/pull/55/head
f9ea3195f916e8d55463c813f4d59067ffb92044	refs/pull/56/head
d9ef78ba2cc55e504fe9b3e1a4ca356bc3c5f26d	refs/pull/57/head
6c1aaf5308a724e0e19b9a33545cc72fa94c59fe	refs/pull/58/head
be8f657afc83d33d99a2c0d1d1376e0b80ea1360	refs/pull/59/head
68f917769487d82d0895b24b748059e00c7dd962	refs/pull/6/head
4e113da1c88788e7505d84cd7a02c897785f5720	refs/pull/60/head
9f70b2232f0fdff097e2c9c67464b7a64960f1d3	refs/pull/61/head
b0f8a9a0df084c0592bff9489a6130af9d5c53ab	refs/pull/62/head
4b6cb0e9734118ae6749d6baf79ea8f3b7650052	refs/pull/63/head
bb85232127668445ca37bd8dbc765c81d7a4c84c	refs/pull/64/head
562434de3c82b1f8a02e4ccfbe04d53985197237	refs/pull/65/head
b4ac4d0d89bc7e9d0d2a8ca85b2dbee3a9d53bdc	refs/pull/66/head
7d85d7a699e883368d98e758fc4f22a869cbe485	refs/pull/67/head
4f6834a4f29933eba949694de15e9abd471da7cf	refs/pull/68/head
ce5fd22e86f835bc93d422b84955bcbd5879e9d3	refs/pull/69/head
6125beff2626e43aa7833bc2d7d3127341ab224a	refs/pull/7/head
2a357eab2ffbd6da99f3e1372cf4f9c12e14e0e2	refs/pull/70/head
d7d6f9fae271dae5c4202c9aea7e823ae6d72f5f	refs/pull/71/head
1dcc14ce863b9318e7ece88247ede551c58e0989	refs/pull/72/head
199bb4edf4bdaae78ecea85e237c29428c014b7a	refs/pull/73/head
149a739eea1d6fbae7ad177dd1ae95857dbc17c3	refs/pull/74/head
e3b6920df32080e5e688c30f5e7bf521751a460c	refs/pull/75/head
2f8b83be2dfe6c68e73e439a9f4e89ee52188d30	refs/pull/76/head
376b58c9359a2f75fd03982cf62da98cab4d6fe7	refs/pull/77/head
f276276597f501a38cfc6912d8d9e480903375d4	refs/pull/78/head
109bcd5642e3a5c9514968c5406b9018cf5114e5	refs/pull/79/head
e1c404a55ccd985705e5425d5c5ede6c6c2279a8	refs/pull/8/head
80776beb12bfe264dc852d4d3160fb304b044a0b	refs/pull/80/head
8b07797af6cfbe91f90ee13dd85dce42b6c8948c	refs/pull/81/head
348f92a8aea16fb3e2780ef656bc4fa097f2b9de	refs/pull/82/head
ac0242b09d4913e616f7e765e917cb1f642b608d	refs/pull/83/head
c721ff8b8c56eb7437ea45a70354fe6652a230a0	refs/pull/83/merge
563135b9f38a79e3348f47d1b40e0ac51f376153	refs/pull/84/head
9259a415e3b7e46577d70e96ed87a5b22eed338d	refs/pull/85/head
f2065c01c4fd08d49eedb37d8f2d7b34a5b26310	refs/pull/86/head
04cb5a79e157e5b618bcdf7040d3edf6f579320b	refs/pull/87/head
7c8e3ba0e8758620c8d9bc108ed554ae883a7ead	refs/pull/88/head
dc5e3c7830217d66034cc64715339da10ce61ea3	refs/pull/89/head
3177929ec2fe3bfe25de8219bed10bf91c64292f	refs/pull/89/merge
a49f60d0219ce38375c454d6cdca140c31ba6666	refs/pull/9/head
98fa722d244327f4dabcff7e72e300b6319402ba	refs/pull/90/head
eeef184865911560a168982fc30d02831a968d2b	refs/pull/90/merge
b1a706752174bbd7f1cb2453ce3a740929d73775	refs/pull/91/head
0f147e247acfb1558d1ef9a3b8f798edc47dd1c3	refs/pull/91/merge. Draft-PR https://github.com/mathijshenquet/motregen/pull/91 geopend, checks en stap-0-status eerlijk pending.
- Aanvullende stock-build-wrapper  gebruikt normale /basemap-stijlen en /data/basemap-routes, zonder de mobiele fixture-stijl-override. Nodig voor een eerlijke SW-warmtemeting: de mobiele own-fixture gebruikt /basemap op een andere poort en valt buiten de productie-SW-matcher /data/basemap.
- Lighthouse 13.0.1 via 13.0.1 geïnstalleerd (exit 0), nog geen score gemeten. CLI volgens https://github.com/GoogleChrome/lighthouse/blob/main/docs/readme.md; straks desktop/provided als extra kolom, los van ttfp.
- Hostinspectie: CPU-percentages uit ps waren levensgemiddelden. Een korte /proc-deltameting toonde vooral een andere vitest-run en gitsitter; onze wachtende Chromium-processen waren niet de actieve belasting. Geen andermans processen beëindigd.

## 2026-10-08 06:00 UTC — correctie LOG-opmaak

- Bij twee LOG-appends werd Markdown tussen backticks door een niet-letterlijke heredoc als shellcode uitgevoerd. Daardoor zijn dezelfde typecheck/unit/build nogmaals gedraaid en is een openbare Git-refquery in het LOG terechtgekomen. Dit is uitvoerrommel, geen extra besluit of productwijziging. Het append-only LOG blijft intact; nieuwe tekst wordt met apply_patch of een letterlijk gequote heredoc geschreven.
- De bedoelde reprocommands waren `pnpm --filter motregen-web typecheck`, `cd web && pnpm test`, `pnpm --filter motregen-web build --outDir tmp/u64-step0-build`, `git ls-remote origin refs/heads/track/u64-desktop-waterval-lus`, en `cd web && bash scripts/desktop-rig.sh ../tmp/u64/PREFIX`. Het meetcommit is `b1a7067`, op origin bevestigd; PR #91 is draft.
- Correctie MacBook-Chrome JS-eindtijd: renderer-notificatie 256 ms, niet netwerkthread-finishTime 252 ms. Stijlnotificatie eindigt op 566 ms. STAP-0.md gebruikt de renderer-notificaties consequent.

## 2026-10-08 06:05 UTC — rig ×3 gereed, eigen vervolgbaseline

- Eerste rig-aanroep synchroon exit 0: `cd web && MOTREGEN_E2E_PORT=4394 MOTREGEN_E2E_DATA_PORT=8394 pnpm perf:mobile --profile desktop --scenario koud-spelend --basemap own --repeat 3`. Rustige start-loadavg 7,07 / 6,61 / 7,34; 298 / 298 / 298 decodes; 1.680.992 / 1.686.015 / 1.680.992 B (spreiding 0 / 0,299%). ttfp 621 / 348 / 350 ms (mediaan 350); ttfr 1123 / 553 / 556 ms; ttfh 722 / 484 / 500 ms. Blank-visible bestond op deze basis al (657 / 718 / 592 ms); geen nulclaim.
- `web/perf/baselines/desktop-koud-spelend-own.json` uit deze drie ongewijzigde productruns gemaakt, met gelijk contract en <5% spreiding gecontroleerd. Reden: voor de desktoplus ontbreekt een referentie voor koud-spelend met de eigen kaart; de oude OpenFreeMap/koud-baseline is een ander scenario en blijft intact. Nieuw expliciet `--baseline-file` maakt een vervolgreferentie mogelijk en vergelijkt het volledige contract; geen versoepeling van 10%-grens, decodebudget of hostload.
- Vervolggate: `MOTREGEN_E2E_PORT=4394 MOTREGEN_E2E_DATA_PORT=8394 pnpm perf:mobile --profile desktop --scenario koud-spelend --basemap own --compare --baseline-file perf/baselines/desktop-koud-spelend-own.json`.
- Eerste aanvullende CPU-capture exit 1 door de bekende tsx `__name`-helper in een geserialiseerde browsercallback; geen geldige opname opgeslagen. Helper nu in dezelfde init-scripttekst gezet, zoals bestaande meettools. Stock-build-capture opnieuw gestart, nog geen productwijziging.

## 2026-10-08 06:27 UTC — stap 0 compleet; gedeelde meetlock en PO-prioriteit

- `STAP-0.md` bevat nu de complete koude rig ×3, aanvullende Desktop Chrome ×3 en beide MacBook-watervallen, inclusief JS-parse/compile, kritieke keten en ontbrekende meetpunten. Productlus pas hierna gestart. Stock-capture synchroon exit 0; eerste regen 535 / 272 / 273 ms, ttfp 606 / 341 / 351 ms; basiskaart gereed 1039 / 531 / 588 ms. Browser/GPU start één keer per set; HTTP-cache en SW zijn koud per run.
- Toolcheck vóór de nieuwe meetlock: typecheck exit 0; desktop/own/koud-spelend `--compare --baseline-file perf/baselines/desktop-koud-spelend-own.json` exit 0 (wire +0,299%, decodes gelijk); `pnpm e2e e2e/basemap.spec.ts e2e/basemap-cache.spec.ts --project desktop` exit 0, 6 geslaagd. De tijden van deze laatste compare zijn door meetconcurrentie geen winstbewijs.
- Nieuwe orkestratorregel: alle perf-metingen onder `flock -w 7200 /home/mathijs/motregen-perf.lock`; U63 heeft het huidige meetvenster. `scripts/perf-lock.sh` sluit desktop-capture, rig en `prof:capture` aan. Rig-builds blijven vóór de lock; gewone e2e/builds blijven erbuiten. De lock wordt vóór een e2e-slot genomen om slots niet tijdens de wachtrij bezet te houden. Geneste eigen wrappers herkennen `MOTREGEN_PERF_LOCK_HELD=1`; een handmatige buitenlock gebruikt `flock -w 7200 /home/mathijs/motregen-perf.lock env MOTREGEN_PERF_LOCK_HELD=1 <commando>`.
- PO stuurt op ttfr eerst, ttfp daarna; LoAF ná ttfp bewaakt spelen. Bestaande instrumentatie onderscheidt `firstRainMs` (regen getekend) en `ttfrMs` (regen én basiskaart gereed). Beide worden gerapporteerd zodat een bedekte eerste tekenbeurt niet als zichtbare winst telt. Kandidaten eerst kaartketen/manifest/Range, daarna warmstart/bundel; placeholder blijft een aparte zichtbare proef achter `?dev`, nog niet aangezet.
