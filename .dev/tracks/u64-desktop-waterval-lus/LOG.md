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

## 2026-10-08 06:43 UTC — WIP met U57, kandidaatbuilds en minder meetwachters

- Op instructie orkestrator nu volledige WIP gecommit, inclusief lazy-bundelproef; main/U57 (`4b14eab7`, plus het hoofdlog) samengevoegd in `52c64b4`. Vite-conflict opgelost met behoud van sitemap/page-routes én kaartproef. Nieuwe captures rapporteren `/weer` (zelfde landelijk beginbeeld), reviews ook; oude querycompatibiliteit blijft getest. Desktop-Caddy heeft een eigen padfallback; de bestaande rig-Caddy en zijn baselinecontract zijn intact.
- Placeholder: twee afzonderlijke builds achter `VITE_MAP_START=svg|tegel` én `?dev&kaartstart=svg|tegel`, eigenaar U64, verval 2026-10-15. SVG 10.631 B / gzip 3.652 B, inline z4-tegels 32.169 B / gzip 24.368 B. Eerste SVG-review exit 0 in licht/donker, regen zichtbaar terwijl netwerkkaart bewust geblokkeerd is; geometrie vertoonde overlapartefacten, generator daarom per waterfeature gegroepeerd. Nieuwe screenshots en tegelreview wachten nog; geen screenshotgoedkeuring of productactivatie.
- Stijl/font/manifest-proef alleen met `VITE_START_ASSETS=inline`: beide stijlen inline, Latijnse glyph-preload, manifest vroeg vanuit HTML en éénmalig overgenomen door App. Geen tweede sessieverzoek; refresh blijft een verse fetch, still/Skywatch starten geen sessiebootstrap. Eerste regen-Range niet blind gepreload: URL en offset vereisen het actuele manifest en MRF-header; ongeconditioneerd preloaden zou hele chunks of dubbele Range-verzoeken kunnen veroorzaken. Bestaande vroege eerste-twee-regenframes blijven de verbruiker.
- Lazy-proef: ForecastTable, PerfHud, DevPanel (incl. wind-tuning-UI), AboutDialog en SkywatchRender worden losse chunks. Profielrecorder en Telegram-SDK waren al conditioneel; de Telegram-still gebruikt dezelfde noodzakelijke kaartlagen als de gewone kaart en blijft daarop gebouwd.

| kandidaatbuild (U57-basis) | ttfr / ttfp | hoofd-JS raw / gzip | HTML gzip | parse-ms / LoAF na ttfp / Lighthouse |
| --- | --- | ---: | ---: | --- |
| referentie | wacht op lock | 1434,9 / 419,2 kB | 1,0 kB | wacht op lock |
| stijl/font/manifest inline | wacht op lock | 1434,9 / 419,2 kB | 2,6 kB | wacht op lock |
| inline + lazy | wacht op lock | 1396,6 / 406,4 kB | 2,6 kB | wacht op lock |

- Receipts: U57-basisunit 72 bestanden/482 tests exit 0; inline/lazy typecheck en beide builds exit 0; laatste unitrun 73 bestanden/485 tests exit 0. Nieuwe inline-stijltest veroorzaakte eerst een protocol-mockconflict met de bestaande overdrachttest; die kiest nu de laatst geregistreerde callback, zoals een werkelijk overschreven protocol. Geen productiecorrectie daarvoor nodig.
- Gerichte desktop-e2e met inline/lazy gestart buiten de perf-lock op eigen tijdelijke poorten 4365/8365: eerste cachetest timeout bij host-loadavg 20–24, geen groene receipt. Run op verzoek gestopt; fout moet nog uit trace worden beoordeeld en gericht herhaald. De zes eerdere basiskaart/cachetests waren vóór deze productproeven groen.
- Zeven afzonderlijke eigen wachtende/test-shellgroepen beëindigd op verzoek orkestrator; U63-processen ongemoeid gelaten. Nieuwe metingen en gerichte herchecks worden één seriële runner. Alle perf blijft onder de gedeelde lock, builds en gewone e2e erbuiten; geen budgetgrens of loadgrens versoepeld.
- Correctie tijdkop vorige entry: die werd om ongeveer 06:25 UTC geschreven; de 06:27-kop liep twee minuten vooruit. Deze entry gebruikt gecontroleerde UTC-tijd.

## 2026-10-08 07:03 UTC — echte warm-reload, één seriële meetrunner

- WIP `c9de7a0` synchroon gecommit/push exit 0, remote SHA bevestigd; PR #91 bijgewerkt met pending perf/e2e. Zeven eigen shellgroepen elk beëindigd met geobserveerde exit 143; drie door Playwright los gestarte eigen servers vervolgens expliciet op PID/werkmap geïdentificeerd en gestopt. Nog één eigen seriële meetrunner actief.
- Cachetesttrace onderzocht: timeout zat bij `navigator.serviceWorker.controller`, niet bij regen/kaart. `page.goto(page.url())` navigeert sinds U57’s `#t=` binnen hetzelfde document; beide opwarmrondes gebruiken nu `page.reload()`. Uit de gestopte run waren vier basiskaarttests, devpaneel en drie presets groen; geen volledige receipt. Gerichte hercheck volgt na perf, zonder gedeelde meetlock.
- `scripts/desktop-loop.sh` voert de bevroren kandidaatbuilds sequentieel uit: referentie/inline/lazy koud ×3, referentie/lazy volledig SW-opgewarmd ×3, beide placeholders + vergelijkbare dev-referentie, screenshots, Lighthouse. Alle browsermetingen gaan via dezelfde hostlock; geen nieuwe builds in de lock. Repro: `cd web && bash scripts/desktop-loop.sh ../tmp/u64/locked ../tmp/u64/reference-u57-dist ../tmp/u64/inline-dist ../tmp/u64/lazy-dist ../tmp/u64/svg-fixed-dist ../tmp/u64/tegel-dist`.
- Warmcapture doet een echte gecontroleerde prime-reload en wacht op de PMTiles-rangecache. De gemeten warmstart zet HTTP-cache uit; app-shell/glyphs/kaart moeten aantoonbaar uit SW/CacheStorage komen. Contextverzoeken worden ook voor de SW bijgehouden, zodat een NetworkOnly-weerfetch via een SW niet met een cachehit wordt verward. Warm betekent volledig geprimede SW, niet de allereerste heropening vóór rangecaching.
- Lockwrapper herkent nu ook een werkelijk lockhoudende `flock` in de voorouderketen, zonder env-marker: het voorgeschreven handmatige `flock -w 7200 /home/mathijs/motregen-perf.lock <commando>` veroorzaakt dus geen geneste deadlock. Wachtende WRITE*-processen tellen niet als eigenaar. Bash-syntaxcontrole en nieuwe typecheck exit 0.
- Eerste gelockte referentie ×3 klaar: ttfr 950 / 733 / 570 ms; ttfp 617 / 364 / 352 ms; eerste regen 542 / 285 / 279 ms. LoAF na ttfp: eerste browserstart 9 frames, max 436 ms; runs 2/3 nul. Inline eerste twee runs: ttfr 1016 / 688 ms, ttfp 608 / 333 ms, eerste regen 536 / 264 ms; manifeststart 9,8 / 8,7 ms tegenover 76,7 / 75,0 ms. Derde run/mediane conclusie nog pending. Eerste browser/GPU-start blijft apart herkenbaar; geen lange-frame-nulclaim over alle runs.

## 2026-10-08 07:18 UTC — koude/warme reeksen binnen; parsemeting zonder dubbeltelling

| kandidaat, drie runs (mediaan) | ttfr regen + basiskaart | ttfp | eerste regen (`firstRainMs`) | LoAF na ttfp (aantal / max ms per run) |
| --- | ---: | ---: | ---: | --- |
| referentie koud | 733 ms | 364 ms | 285 ms | 9/436 · 0/0 · 0/0 |
| inline koud | 709 ms | 351 ms | 274 ms | 9/347 · 0/0 · 0/0 |
| inline + lazy koud | 747 ms | 339 ms | 269 ms | 8/339 · 1/52 · 0/0 |
| referentie warm | 654 ms | 324 ms | 275 ms | 0/0 · 0/0 · 0/0 |
| inline + lazy warm | 658 ms | 305 ms | 252 ms | 3/60 · 0/0 · 0/0 |

- Elke reeks onder de gedeelde meetlock, alle geregistreerde loadavg ≤8. ttfr inclusief volledige basiskaart varieert meer dan de eerste regentekenbeurt; daarom geen sterke claim op kaart-ttfr-winst voor lazy. Inline haalt het manifest 75 → 9 ms en het font 97 → 4 ms naar voren; het font wordt per run eenmaal gevraagd. Eerste regen-Range in de vergelijkbare tweede run 144 → 140 → 126 ms (referentie/inline/lazy).
- Warmsteekproeven bewijzen in alle zes captures nul interne SW-netwerkverzoeken voor app-shell/kaartassets en 70 verse weerverzoeken (1.058.723 B per run). Het HUD toont door SW-ResourceTiming nul bytes; dat betekent hier niet nul weernetwerk. Deze bestaande SW-opzet hoeft niet gewijzigd te worden.
- CPU-parser had bij één nieuwe V8-trace een genest parse-event dubbel geteld: 22,173 ms inclusief versus 14,800 ms genest. Summarizer telt nu alleen buitenste spans per thread; compile idem. Oude stap-0-CPU-waarden blijven gelijk. Correcte mediane hoofd-JS-parse: 23,3 / 23,4 / 22,8 ms voor referentie/inline/lazy, dus slechts ~0,5 ms parsewinst. Ruwe tracevensters en overdrachtsbytes zijn ongewijzigd.
- Placeholder- en dev-referentiemetingen lopen nog; screenshots en Lighthouse volgen. Reviewscript gebruikt nu dezelfde fixtureklok en klapt diagnosepanelen via de UI dicht, zodat de kaartvergelijking leesbaar is. Geen normale e2e of builds tegelijk met deze eigen perf-reeks gestart.

## 2026-10-08 07:42 UTC — volledige lus, observerfout hersteld vóór afronding

- Seriële desktoplus synchroon exit 0: 24 captures, twee licht/donker-reviews en vijf Lighthouse-runs. Referentie/inline/lazy Lighthouse 65/63/65; SVG/tegel waren daar niet dev-geactiveerd (65/66), dus geen actieve-placeholder-score. Runner voortaan met matching dev-vlaggen en extra devreferentie; die drie scores worden nog apart aangevuld.
- Nieuw RESULTATEN.md met volledige medianen, bytes, CPU, warmnetwerk en reproduceerbare opdrachten. Beperking expliciet: entry −12,8 kB, maar alle vóór regen ontvangen JS slechts −2,8 kB doordat zichtbare tabel en perf-HUD direct hun lazy chunks laden. Geen grote claim uit ~0,5 ms parsewinst.
- Eerste finale defaultbuild/compare en 27 gerichte desktop-e2e synchroon exit 0: 25 geslaagd, twee uitsluitend mobiele tests overgeslagen. Cachetests 390/1280 nu groen met echte reload. Buildstandaard nu inline stijl/font/manifest; geen zichtbare kaartproef aangezet.
- Compare gaf 204 decodes / 1.451.824 B tegen baseline 298 / 1.680.992 B. Onderzocht en niet als winst geaccepteerd: lazy tabel mist App’s vroege tbody-observer op krappe apparaten, waardoor tabelvelden ontbreken. App koppelt zichtbaarheids- en preview-resize-observers nu reactief aan de gemounte tabel. Gerichte e2e toegevoegd die op 4 cores/4 GB zichtbaar temperatuur, windvlaag en weericoon eist. Typecheck/unit en tafel-e2e lopen; daarna nieuwe compare en finale kandidaatcapture. Native 8-core/8-GB-opnames gebruiken eager puntreeksen en zijn niet de 204-decodeproef.
- Frisse screenshotreview synchroon exit 0, UI-diagnosepanelen dicht en fixtureklok correct. Dark-context bleek door productdefault light dezelfde lichte stijl te tonen; review zet nu expliciet motregen-theme per variant. Nieuwe echte donkere screenshots volgen; eerdere dark-labels zijn geen donkere kaartreview.
- Kaartproef koud: devreferentie ttfr/ttfp 674/354 ms, SVG 694/368 ms, inline tegel 690/360 ms (medianen ×3). LoAF na ttfp max per reeks 520/631/563 ms. Voorstel zal geen standaardactivatie aanbevelen: geen bewezen startwinst en SVG-geometrie is grof. Screenshotpakket naar orkestrator na correcte themareview.
- Correctie vorige tijdkop: entry met 07:18 is daadwerkelijk rond 07:24 geschreven en toen in a1038af gecommit/push; remote SHA gecontroleerd. Huidige WIP neemt de observercorrectie mee; nog geen finale-groenclaim.

## 2026-10-08 07:44 UTC — observercorrectie groen, finale runner gestart

- WIP cc36c7f commit/push synchroon exit 0; remote SHA cc36c7fc8bb400981d991377eb6ad48f872cc0a5 bevestigd. PR #91 bijgewerkt met de meetresultaten en resterende verificatie.
- Na observercorrectie: `pnpm typecheck` en `pnpm test` exit 0 (73 bestanden / 485 tests); `MOTREGEN_E2E_PORT=4365 MOTREGEN_E2E_DATA_PORT=8365 pnpm e2e e2e/table.spec.ts --project desktop` exit 0, vier geslaagd en twee uitsluitend mobiele tests overgeslagen. Nieuwe krap-apparaat-test controleert echte temperatuur/vlaag/weericoon, geen implementatiemock.
- Eén finale seriële runner gestart (lokaal tmp/u64/finish-runs.sh): nieuwe native defaultbuild buiten lock, koud/warm ×3, gecorrigeerde light/dark-reviews, Lighthouse voor finale kandidaat + actieve SVG/tegel + devreferentie, daarna compare ×3 en geneste handmatige-lockcheck. Geen eigen gelijktijdige e2e/perf.

## 2026-10-08 08:01 UTC — screenshotpakket en finale koude herhaling

- Acht screenshots met expliciete producttheme in licht/donker, vóór en na netwerkkaart, opgenomen onder screenshots/. Fixtures bevatten geen PO-profieldata. Beide reviews eindigen zonder pageerrors; geen standaardactivatie. Screenshotvoorstel wordt na push aan de orkestrator geleverd.
- Finale koude native reeks ×3: ttfr 1313/556/638 ms, ttfp 735/359/345 ms, eerste regen 649/289/270 ms; medianen 638/359/289 ms. LoAF na ttfp 10/430, 1/60, 0/0. Finale Lighthouse 68 / TBT 728 ms. Herhaling toont variatie tegenover eerdere lazy-reeks 747/339/269 ms; RESULTATEN rapporteert beide, geen grote starttijdwinstclaim. Hoofd-JS-parse mediaan 23,2 ms.
- Warmcapture loadmeting verder aangescherpt: na SW-priming naar about:blank (cache behouden, prime-renderloop weg), dan opnieuw rustige host eisen en load direct vóór navigatie vastleggen. Lopende reeksen gestart met de eerdere capture blijven bewaard; een extra warme reeks op de aangescherpte methode volgt. Geen loadgrens versoepeld.
- Actieve-placeholder-Lighthouse en finale compare ×3 staan nog in dezelfde seriële runner; geen finale-groenclaim. Documentatie bevat koude/warme repro en de default inline-assets met opt-out referentiebuild.

## 2026-10-08 08:23 UTC — screenshotbesluit en Lighthouse-oorzaak, WIP

- Screenshotvoorstel via herdr aangeboden; orkestrator is daarna werkend gezien en heeft besloten: SVG wegens geometrieartefacten vervallen; z4-tegel visueel akkoord maar desktop standaard uit. U63 meet mobiele waarde. SVG-code/generator/asset verwijderd; historische screenshots/resultaten blijven bewijs. Alleen tegel-devvlag met verval 2026-10-15 blijft. Spec/dev-opties aangepast aan het expliciete besluit.
- Afrondende seriële runner synchroon exit 0: gecorrigeerde compare ×3 telkens 298 decodes / 1.685.183 B (+0,249% tegenover originele baseline), spreiding nul; geen ontbrekende tabelvelden meer. ttfr 1165/1067/803 ms, ttfp 615/325/450 ms in de oude Pixel-desktop-gate; native-desktopresultaten blijven apart. Geneste handmatige-lockcheck eveneens geslaagd.
- Actieve-placeholder-Lighthouse afgerond vóór het SVG-besluit: devreferentie 66, SVG 71, tegel 65. Geen verdere SVG-optimalisatie of activatie.
- Lighthouse finale build 68 komt uit subscores FCP/LCP/CLS ieder 100, TBT 13 (728 ms), Speed Index 37 (2655 ms). Zwaarste main-thread-taken 375/638 ms; 1,81 s script evaluation tegen 1,7 ms main-thread parse. Ongebruikte JS ~212 kB, waarvan ~179 kB MapLibre; CSS-audit berekent hier nul FCP/LCP-winst. Onderzoek vervolgt op uitvoer/shaders die ttfr/ttfp raken, niet op LCP-score die al maximaal is.
- Nieuwe Lighthouse-diagnose heeft CPU-/DevTools-assets geschreven; daaropvolgende runner eindigde exit 141. Waarschijnlijke oorzaak lockdetectie: awk verliet lslocks-pipe vroeg, SIGPIPE onder pipefail. Wrapper leest nu de volledige stroom zonder vroeg exit. Verificatie/herstart van warme capture en Telegram-e2e nog pending; geen nieuwe groene receipt geclaimd.

## 2026-10-08 08:40 UTC — WIP regenverzoeken vóór manifestreacties

- Kandidaat zet de eerste twee frameaanvragen vóór setManifest, zodat reactieve tabel-/puntreeksenverwerking die dispatch niet ophoudt. Native kandidaatbuild, typecheck en 73 bestanden / 485 unittests synchroon exit 0; timingwinst nog niet gemeten.
- Capture heeft een optionele --cpu-profile, uitsluitend voor aparte diagnose. Lighthouse-subscores vóór/na en de SVG-/tegelbeslissing verwerkt in RESULTATEN.md. Geen SVG-code teruggezet, tegel standaard uit.
- Eén eigen seriële runner wacht op de gedeelde perf-lock voor de aangescherpte warmcapture; CPU-/kandidaatmetingen starten erna. De leeftijd van U63’s eerdere e2e-lockproces bevatte wachttijd, geen bewijs voor een 19 minuten durende test. Huidige eigenaar doet U63’s placeholdermeting. Geen andere trackprocessen gestopt.
- WIP wordt nu gecommit/pushed ondanks de meetwachtrij; nieuwe perf/e2e-receipts blijven pending. Repro kandidaat: tmp/u64/rain-priority-runs.sh (lokale runner); permanente capture: cd web && bash scripts/desktop-rig.sh ../tmp/u64/cpu --repeat=1 --cpu-profile.

## 2026-10-08 08:56 UTC — meetwachtrij en rangschikking expliciet

- WIP 22728e2 commit/push en PR-update synchroon exit 0; remote 22728e2c3ee7f0f0ecc70c5cda8967540e600fa4 bevestigd. Nieuwe checkpoint volgt op de 15–20-minutencadans.
- RESULTATEN zet kandidaten op verwachte regenstartwinst en markeert de oude warm-loadmethode expliciet. Nieuwe capture schrijft cpuProfile in metadata; diagnostische profileringsopnames mogen geen gewone voor/na-reeks worden.
- Nog één eigen runner: warm-corrected staat achter U63’s placeholder-paar. Lockeigenaar wacht op rustige host voordat hij meet; huidige load schommelt ~10–16, grens blijft 8. Geen eigen browser of extra meting naast die wachtrij gestart. Onderzoeks-/kandidaatrunner ligt klaar voor daarna.
- PO-Chrome-profiel heeft één lange taak van 71 ms tegenover honderden ms in lokale SwiftShader-Lighthouse; geen claim dat de lokale TBT gelijk is aan MacBook-gedrag. Aanvullende 103 staat lager dan regen-dispatch/shaderdiagnose: de HTML-aanpak start font/manifest lokaal al op ~4/~9 ms. Externe CSP-worker statisch afgewezen wegens extra totale JS-overdracht; geen ongeteste implementatie daarvan toegevoegd.

## 2026-10-08 09:00 UTC — functionele gate op regenprioriteit groen

- WIP ce9c365 push synchroon exit 0, remote ce9c365803645ca7a17eb34edebbc98274153f96 bevestigd.
- Gewone gerichte e2e buiten de perf-lock, synchroon exit 0: cd web && MOTREGEN_E2E_PORT=4365 MOTREGEN_E2E_DATA_PORT=8365 pnpm e2e e2e/basemap.spec.ts e2e/presets.spec.ts e2e/telegram.spec.ts e2e/table.spec.ts --project desktop. 22 geslaagd, twee uitsluitend mobiele tests overgeslagen. Regenprioriteit behoudt kaart, URL-presets, temperatuur/vlaag/weericoon en Telegram/still-klok. Die stap uit de nog niet gestarte vervolgmetingenrunner gehaald; geen extra herhaling nodig.
- Eerste warme runner blijft achter U63’s meetlock; er is geen eigen gewone e2e meer actief. Nieuwe timing-/CPU-receipts blijven pending.

## 2026-10-08 09:11 UTC — U62/U66 samengevoegd, nieuwe referentie gebouwd

- Op instructie orkestrator main 43b92d6 samengevoegd, inclusief U62 8d75754f (Kaderhemel vast aan, scrubberhemel, tabeltween/chrome) en U66 bot-loops. Twee conflicten opgelost: App observeert nog reactief de lazy tabel, mét U62’s nieuwe reposition/tween; ForecastTable gebruikt U62’s tableElement/hemelkop en meldt die bestaande ref aan onMountTable. Geen U62-functionaliteit teruggedraaid.
- Merge-typecheck en 74 bestanden / 497 unittests geslaagd. Native build geslaagd; losse gzip-stap eerst exit 1 doordat een CLI-argument werd gebruikt terwijl mobile-assets de dist via MOTREGEN_RIG_DIST leest. Correcte naverpakking synchroon exit 0. Code/build geen fout; geen finale perf-claim.
- Gerichte merge-e2e buiten lock synchroon exit 0: cd web && MOTREGEN_E2E_PORT=4365 MOTREGEN_E2E_DATA_PORT=8365 pnpm e2e e2e/table.spec.ts e2e/sky-window.spec.ts e2e/dev-panel.spec.ts e2e/presets.spec.ts e2e/telegram.spec.ts --project desktop. 23 geslaagd, twee uitsluitend mobiele tests overgeslagen.
- Ongewijzigde productreferentie in detached worktree /home/mathijs/worktrees/motregen/u64-u62-reference op 43b92d6. Alleen capture-/lock-/CLI-tools overgenomen, geen U64-productcode; native referentiebuild+gzip synchroon exit 0. Eerste dependency-sharing-proef veilig geweigerd door pnpm; symlinks verwijderd en 505 dependencies offline uit de store geïnstalleerd, exit 0. Onze eigen modules zijn niet verwijderd.
- Bevroren pre-U62-captures blijven historisch vergelijkbaar; nieuwe reeks vergelijkt main mét Kaderhemel tegen U64 mét dezelfde startsituatie. Vervolg-baseline desktop-koud-spelend-own-u62.json wordt pas uit drie geldige main-referentieruns geschreven, met U62/Kaderhemel als reden; originele baseline blijft bewaard. Meetwachtrij nog achter U63’s lock, geen budget verruimd.

## 2026-10-08 09:19 UTC — shaderbatch-proef, oude warmwachtrij vervangen

- Merge aac30f4 commit/push synchroon exit 0; remote aac30f455a5a9d19a2997f960a7459ed3b2adc22 bevestigd.
- Nieuwe onzichtbare kandidaat: eigen regen-/windshaders compileren/linken zonder tussentijdse COMPILE_STATUS-queries; alle vier windprogramma’s starten vóór de eerste LINK_STATUS-query. Shaderbronnen, lagenvolgorde en simulatietijden gelijk. Bron: https://registry.khronos.org/webgl/extensions/KHR_parallel_shader_compile/ (§best practice). Geen KHR-extensie vereist; linkfouten behouden programmashaderlogs en ruimen aangemaakte programma’s op. Geldige shaders worden na statuscontrole vrijgegeven.
- Eerste kandidaat-typecheck, 497 units en build geslaagd; echte WebGL-e2e nog lopend. Shader-lifecycle daarna aangescherpt om logs vóór shaderdeletie te lezen; finale native build en gerichte kaart/windzoom-verificatie volgen op die wijziging. Geen timingwinst geclaimd.
- Oude warme runner had na ~53 minuten nog geen meetbrowser gestart en gebruikte de pre-U62-build. Alleen de geverifieerde eigen procesgroep 145158 (wachtende flock 186090) beëindigd, om de aangescherpte warmmeting naar dezelfde U62-startsituatie te verplaatsen en de overbodige oude vervolgchecks te vermijden. Lockeigenaar U63 onaangeraakt. Nieuwe seriële runner bevat referentie/kandidaat koud én warm, CPU-diagnose en LH-subscores; builds/e2e blijven buiten lock. Hostload inmiddels >50, grens niet aangepast.

## 2026-10-08 09:22 UTC — shader-e2e groen, finale runner klaar voor meetlock

- Oude pre-U62-warmrunner na beëindigen synchroon exit 143 waargenomen; geen captures geschreven, geen meetresultaten verzonnen.
- Shaderkandidaat vóór laatste resource-lifecycle-aanpassing: typecheck/unit/build en gerichte WebGL-e2e synchroon exit 0: cd web && MOTREGEN_E2E_PORT=4365 MOTREGEN_E2E_DATA_PORT=8365 pnpm e2e e2e/basemap.spec.ts e2e/focus.spec.ts e2e/wind-zoom.spec.ts e2e/telegram.spec.ts --project desktop. 20 geslaagd; twee uitsluitend touch-tests en bekende continue-zoom-fixme overgeslagen. Shaderbron/lagen/simulatie gelijk.
- Finale runner tmp/u64/u62-finish.sh gestart: typecheck/units/build/gzip en kaart/windzoom-e2e buiten lock; daarna uitsluitend native koud/warm/CPU/LH binnen één lock. Referentie-baseline en kandidaatcompare bouwen daarna via hun CLI buiten lock en nemen eigen meetlock. Dit is de enige eigen lange runner. Pre-U62-gate-raw gekopieerd naar tmp/u64/pre-u62-gate voordat nieuwe compare die bestandsnamen vervangt.
- U62-native hoofd-JS gzip: ongewijzigde main 422.475 B; U64 vóór shaderbatch 409.063 B. Nieuwe tijden en shaderbatch-bytes volgen pas uit de finale bevroren build. Vervolgdocumentatie onderscheidt expliciet de oudere U57-resultaten en nieuwe U62-startsituatie.

## 2026-10-08 09:26 UTC — finale shaderstand wacht op metingen, WIP

- Finale prefixrunner heeft typecheck, 497 unit-tests, build/gzip en kaart/windzoom-e2e doorlopen en staat nu in flock (PID 348468, wachtend). E2e-rapport: vijf geslaagd, bekende continue-zoom-fixme overgeslagen. Hele runner heeft nog geen synchrone eindreceipt; nieuwe native tijden, warme cachecontrole, LH-subscores en U62-baseline/compare blijven pending.
- Laatste helperstand bewaart shaderobjecten tot linkcontrole/loglezing en verwijdert ze in finally; bij linkfout worden alle klaargezette programma’s verwijderd. Shaderbronnen/simulatie/lagenvolgorde blijven gelijk. Kernwinsthypothese: tien tussentijdse compile-statusvragen weg (acht wind, twee regen), en vier windlinks beschikbaar vóór de eerste blokkerende linkstatusvraag.
- Eén eigen lange runner, geen eigen browser actief tijdens deze wachttijd. Opdracht: bash tmp/u64/u62-finish.sh; alleen native-meetblok staat onder de gedeelde lock. U62-main-baseline wordt apart met CLI gebouwd/gemeten; oorspronkelijke pre-U62-baseline en rawfiles blijven bewaard. Shader-WIP wordt nu gecommit/pushed op cadans; geen ongefundeerde prestatieclaim.

## 2026-10-08 09:50 UTC — buitenste batchlock gestopt op nieuwe instructie

- Eigen runner 339182 met wachtende flock 348468 gecontroleerd en uitsluitend die procesgroep beëindigd; sessie synchroon exit 143. Nog geen nieuwe captures. De formulering 'native-meetblok binnen één lock' bij 09:22/09:26 wordt hiermee vervangen: de lock mag uitsluitend één run omvatten, geen batch en geen loadwachttijd.
- Refactor gestart: rustig-host-wachten vóór flock, hercontrole na verkrijging zonder binnen de lock te slapen, elke native/rig-herhaling apart. Ook warm-priming mag binnen een run werken maar daarna nooit op load wachten met de lock vast. Builds en gewone e2e blijven buiten de lock; loadgrens 8 blijft gelijk.
- WIP-checkpoint nu ondanks ontbrekende perf-receipts. Laatste native build/typecheck/497 units/kaart-wind-e2e bereikten de wachtrij; finale prestatievalidatie blijft pending. Geen andere trackprocessen gestopt.

## 2026-10-08 09:55 UTC — lock per run geïmplementeerd; U65 volgt in dit checkpoint

- Wrapper wacht op rustige load vóór flock; hercontrole bij lockverkrijging, code 76 geeft de lock direct vrij en probeert buiten de lock opnieuw. E2e-slots worden niet-blokkerend geprobeerd; geen slotwachttijd onder de perf-lock. Iedere desktopcapture en iedere profiel/scenario/rig-herhaling krijgt een eigen lockperiode en browserproces. Warmcapture weigert drukte na priming en ruimt op, zonder binnen de lock op load te slapen.
- Rigtests wachten niet meer zelf. CLI kiest via --grep één exacte run per Playwright-aanroep. --list voor desktop/koud-spelend/run 2 meldt exact één test. Builds/e2e blijven buiten de perf-lock, grens blijft 8. Native rawcapture weigert --repeat>1; desktop-rig regelt de herhalingen.
- Finale typecheck synchroon exit 0; 74 bestanden / 497 units synchroon exit 0. Bash syntax/diffcheck groen. Geïsoleerde wrapperchecks op lokale testlock (geen benchmark, alleen test-loadmock) synchroon exit 0: commandofout 9 doorgeven, drukte weigeren vóór lock, drukte binnen handmatige lock -> 76, lock daarna vrij, handmatige nesting zonder deadlock. Eerste syntaxcheck gebruikte abusievelijk web/-paden vanuit web/; correct herhaald, geen codefout.
- Eén nieuwe runner wachtte aantoonbaar als node perf-quiet zonder lockhouder. Nieuwe U65-instructie ontvangen vóór enig meetresultaat: uitsluitend eigen groep 450523 gestopt, synchroon exit 143. Main ec3ca02 met U65 0fb247ec wordt nu samengevoegd; nieuwe bevroren referentie/kandidaat zullen beide U65 bevatten. Extra plaatsen-*.json moet ná ttfp blijven en wordt expliciet gerapporteerd.

## 2026-10-08 10:00 UTC — U65-merge en nieuwe capture-afspraak

- Main ec3ca02 inclusief U65 0fb247ec samengevoegd. App/vite integreerden automatisch; conflicten in perf-docs/rig/CLI opgelost door beide functies te behouden: per-run lockdiscipline en U65's --request-order. Volgordecaptures nemen ook de hostlock, mogen zoals U65 specificeert onder load draaien, zijn gemarkeerd en kunnen geen baseline zetten/vergelijken. Echte timingruns blijven load ≤8 eisen.
- Native capture controleert aanwezigheid van de plaatsen-asset en start strikt ná ttfp; start-waterfall toont de aanvraag. Iedere nieuwe native run krijgt browserPerRun=true in metadata. U65-productlogica behouden, geen vervroegde catalogusfetch toegevoegd.
- Merge-typecheck synchroon exit 0. Unitrapport 76 bestanden / 509 geslaagd; gerichte desktop-e2e basemap-cache/location/seo/table nog lopend, dus hele runnerreceipt pending. Ongewijzigde nieuwe main-referentiebuild/gzip op ec3ca02 synchroon exit 0; alleen meetinstrumentatie overgenomen in de detached referentieworktree.
- Nieuwe baseline zal desktop-koud-spelend-own-u65.json heten. Reden: U62/Kaderhemel plus U65's plaatsenlijst na ttfp, en herhalingen nu elk in een eigen browserproces. De nooit gemeten U62-vervolgbaseline wordt niet aangemaakt; oorspronkelijke pre-U62-baseline blijft bewaard. Nieuwe referentie/kandidaatbuilds volgen, shaderwinst blijft hypothese.

## 2026-10-08 10:03 UTC — U65-builds en functionele gates groen; timing wacht buiten lock

- Merge 86b9753 push synchroon exit 0; remote 86b9753766b8b73a749e365a85ca9209f14f84f5 bevestigd. PR 91 bijgewerkt met U65, lockprotocol, actuele verificatie en pending timing.
- U65-merge runner synchroon exit 0: 509 unit-tests en cd web && MOTREGEN_E2E_PORT=4365 MOTREGEN_E2E_DATA_PORT=8365 pnpm e2e e2e/basemap-cache.spec.ts e2e/location.spec.ts e2e/seo.spec.ts e2e/table.spec.ts --project desktop. 21 geslaagd, twee mobiel-only overgeslagen; geprikte plaats/padherladen, warme kaart en lazy tabel behouden.
- Drie bevroren U65-native builds/gzip synchroon exit 0: main ec3ca02 424.978 B gzip entry; U64 vóór shaderbatch 411.280 B; U64 met shaderbatch 411.362 B. Voor de middelste build alleen de twee shaderimplementaties tijdelijk door main-versies vervangen; daarna eigen bronbestanden hersteld en git diff --exit-code daarvoor exit 0. Geen andere productvariatie tussen de twee kandidaten.
- Tweede geïsoleerde lockcheck synchroon exit 0: tijdens daadwerkelijk loadwachten in de wrapper kon een andere aanroep dezelfde lokale testlock niet-blokkerend nemen; testproces daarna met receipt 143 opgeruimd. Geen hostmeting of perf-resultaat; test gebruikt een eigen tijdelijke lock en loadmock.
- Enige lange eigen runner: bash tmp/u64/u65-measurements.sh. Eerst CPU-diagnose, dan native koud ×3 per variant, warm ×3 referentie/kandidaat, LH per build, main-gate-baseline en compare. Geen buitenste batchlock. Huidige hostload ~20–28; eerste node perf-quiet wacht zonder perf-lock. Geen loadgrens veranderd, nog geen nieuwe timing geclaimd.

## 2026-10-08 10:07 UTC — Early Hints-meetcontract onderzocht

- Officiële bronnen geraadpleegd: Caddy respond ondersteunt 103 met voortzetting van de handlerketen (https://caddyserver.com/docs/caddyfile/directives/respond); Chromium negeert 103 via HTTP/1.1 (https://chromium.googlesource.com/chromium/src/+/master/docs/early-hints.md); Chrome beschrijft vertrouwd HTTPS en ingeschakelde HTTP-cache voor preload (https://developer.chrome.com/docs/web-platform/early-hints). Huidige rig: HTTP/1.1 in native Resource Timing, cache expliciet uit. Een Caddy-header toevoegen aan deze rig zou geen valide 103-benchmark opleveren.
- Productieconfig toont no-store voor /data/manifest.json?s=1. 103-preload gebruikt cache en kan bij no-store dubbel ophalen: ook dubbele sessietelling. Geen manifest-103 toegevoegd. Huidige HTML-fetch deelt exact één response, glyphpreload blijft aan. Aanvullende font/asset-103 blijft als HTTPS/HTTP2-proef op de lijst; geen gemeten winst gefabriceerd of productieconfig aangepast.
- Eerste U65-capture blijft buiten de lock op load wachten; geen eigen Chromium gestart. Nieuwe ttfr/ttfp en LH-subscores pending.

## 2026-10-08 10:09:36 UTC — aanvullende lockcheck en rapportvolgorde

- Geïsoleerde child-codecheck synchroon exit 0: busy-code 76 van een reeds begonnen capture keert meteen terug; geen tweede poging onder dezelfde held-lock. Slot-bezet-code 75 blijft daarvan onderscheiden. Overige geïsoleerde lockchecks op de bijgewerkte wrapper opnieuw synchroon exit 0, inclusief echte loadwachttijd zonder lock en opruimreceipt 143.
- CLI-samenvatting toont nu ttfr en ttfp als eerste metrieken, conform PO-prioriteit; geen schema/gate/budgetwijziging. Native rawcapture-gebruikhulp verwijst voor herhalingen naar desktop-rig.sh. U65-referentie-CLI krijgt dezelfde rapportvolgorde.
- Koppen bij 10:00/10:03/10:07 waren handmatig afgerond (acties respectievelijk ~09:59/~10:02/~10:06); nieuwe koppen gebruiken rechtstreeks UTC-clock. Geen historische entries gewijzigd.

## 2026-10-08 10:14:19 UTC — WIP-checkpoint op cadans, metingen nog pending

- Laatste rapportwijziging typecheck synchroon exit 0. CLI zet ttfr/ttfp vooraan; native capture-/gatecontracten en drempels gelijk. U65-builds en 509 units / 21 desktop-e2e zijn reeds groen; geen onnodige volledige suite herhaald.
- Nieuwe tijden/LH/U65-baseline nog pending. Eén eigen runner 554213, node perf-quiet wacht vóór flock. Hostload varieert ~11–45. Zware Chrome-processen 245236/245255 hebben cwd /home/mathijs/motregen, niet deze worktree; geen andermans processen beëindigd. Lockdiscipline geverifieerd, geen eigen browser actief of lock gehouden tijdens loadwachten.
- WIP nu commit/push, ook zonder timingreceipt. Volgende stap blijft CPU-diagnose plus referentie/kandidaat koud/warm zodra load ≤8, vervolgens Lighthouse en geldige main-baseline/compare. Shaderproef blijft ongemeten hypothese.

## 2026-10-08 10:19:01 UTC — U65 aanvraagvolgorde functioneel bewezen onder load

- Volgordecapture + controle synchroon exit 0: cd web && MOTREGEN_E2E_PORT=4394 MOTREGEN_E2E_DATA_PORT=8394 pnpm perf:mobile --profile desktop --scenario koud-spelend --basemap own --request-order; daarna pnpm exec tsx scripts/place-waterfall.ts ../tmp/u64/u65-request-order/desktop-koud-spelend-run1.raw.json. Eén gerichte run, 34,7 s suite; lock na run vrij. Build buiten lock, capture onder één lock. Geen andere perfmeting tegelijk.
- Plaatsencatalogus native start +1448,7 ms ná milestone:ttfp, 60.946 bodybytes. Native manifest/stijl en eerste regen-/frame-Range aanwezig; geen netwerkbevindingen of paginafouten. Capture/report requestOrderOnly=true; uitsluitend volgorde bewezen, geen ttfr/ttfp-winst, decode-/bytebaseline of LoAF-gate uit deze drukke run afgeleid.
- Alle raw/report/trace/plaatsen-JSON/SVG lokaal gekopieerd naar tmp/u64/u65-request-order vóór een toekomstige echte baseline/compare de generieke bestandsnamen vervangt. Timingrunner blijft apart buiten de lock op load ≤8 wachten.

## 2026-10-08 10:21:10 UTC — rustige-host-timeout, wachttijd verlengd buiten lock

- Seriële timingrunner 75441 synchroon exit 1: eerste loadwacht na twintig minuten verlopen, met expliciete 'Host blijft te druk; geen meting'. Geen CPU-/native-/warme/LH-capture gestart, geen baseline geschreven. Alle eigen request-order-/bouw-/checkterminals reeds met eindreceipt gesloten; geen restbrowser.
- Alleen maximale wachttijd vóór flock verhoogd naar 120 minuten voor deze lokale runner; loadgrens 8 en perf-budgetten gelijk. Geen lock vast tijdens die wachttijd. Zelfde drie bevroren U65-builds, geen nieuwe productmutatie of baselineverschuiving. Herstart volgt nu; volgende reguliere WIP-commit/push blijft op cadans.

## 2026-10-08 10:28:13 UTC — bestaande volgordecapture als functiediagnose

- Geen nieuwe browsermeting: offline analyse van de reeds onder lock opgenomen U65-volgordecapture. Officiële prof:top --dist stopte terecht exit 1 op unmappable module-startpositie index-C3hKyTWq.js:1:1. Geen productparser of mapvalidatie versoepeld. Lokale diagnostische helper bewaart onbekende frames en meldt ze apart; eerste helperaanroep had een cwd-padfout, gecorrigeerde aanroepen synchroon exit 0.
- Tweede sourcemaplaag gebruikt de geïnstalleerde MapLibre 5.24.0-map. 141 self-samples wijzen naar src/webgl/program.ts constructor: 34 vóór eerste regendraw, 107 ná ttfp maar vóór kaart-ttfr, nul later. Vier drukke samples blijven onopgelost. Geen CPU-ms of snelheidsclaim: profiel liep onder load 41,34 en grote samplegaten laten gewogen tijdsattributie onbetrouwbaar lijken.
- Bibliotheekbron bevestigt twee COMPILE_STATUS-vragen vóór link per programma. Dat wijst naast de eigen shaderbatch op een vervolgkandidaat in MapLibre; nog geen dependency patch toegepast en geen win geclaimd. De rustige native CPU-diagnose moet dit bevestigen. Load ondertussen opnieuw dalend, maar nog >8; runner wacht buiten lock.

## 2026-10-08 10:30:15 UTC — WIP-checkpoint met volgordebewijs, timings pending

- Commit/push op 15–20-minutencadans. Nieuwe inhoud uitsluitend verslag/LOG: geslaagde expliciet gemarkeerde U65-aanvraagvolgorde, rustige-host-timeout/herstart, offline functiediagnose met onbekende samples behouden. Geen productmutatie of aangepaste gates sinds de groene U65-checks; geen onnodige unit/e2e-herhaling.
- Timingrunner nog buiten de lock, actuele load ~14–16. Geen native/LH/U65-baseline-receipt. Eerst schone CPU-diagnose, daarna koude/warme referentie+kandidaten, LH-subscores en main-gate/compare; shaderkandidaat kan pas daarna behouden/verworpen worden. PR blijft draft/WIP.

## 2026-10-08 10:41:03 UTC — rustig-host-poll responsiever, grens gelijk

- Eerste capture bleef ongestart terwijl de host telkens richting 8 daalde en weer steeg. Pollperiode van de loadwachter 20 -> 5 seconden; geen verandering aan loadgrens, hercontrole na lockverkrijging, tijdvensters of meetbudgetten. Referentie krijgt dezelfde helper. Dit helpt een beschikbaar rustig venster eerder te zien; het is geen TTFR-optimalisatie.
- Gecontroleerde eigen runnergroep 668336 gestopt om uitsluitend de nieuwe wachtpoll te laden; sessie synchroon exit 143. Geen capture kwijt of oudere/andermans browser gesloten. Zelfde bevroren builds en 120-minuten maximale loadwachttijd worden opnieuw gestart buiten flock.

## 2026-10-08 10:49:32 UTC — eerste schone CPU-diagnose en één koude referentie

- Pollwijziging typecheck synchroon exit 0. Na vijfsecondenpoll daadwerkelijk eerste schone CPU-capture gestart: load 7,89, plaatsenlijst 877,2 ms na ttfp 786,3 ms; ttfr 1185,4 ms. cpuProfile=true: diagnostisch, niet opnemen in gewone benchmarkmedianen. Capture afgerond en lock daarna vrij; seriële runner nog actief.
- Offline merge CDP-profiel/trace, devtools-trace en watervaltabel synchroon exit 0. Vier RunTasks ≥50 ms, samen 423 ms. Grootste 236 ms vanaf ~173 ms, ~225 ms samples in MapLibre _setupPainter vóór eerste regen. Volledige LoAF na ttfp 12 frames / max419 ms; GPU-/schedulergaten zijn geen gelijk aantal lange hoofddraadtaken. Dit zijn één diagnostische opname en lokale SwiftShader, geen MacBook-winst.
- Eerste gewone koude main-referentie met eigen browser binnen; run 2 wacht buiten de lock. Geen mediaan/vergelijking uit één run geclaimd. Bestaande bestanden blijven bewaard; nieuwe kandidaat voorbereiden op basis van de CPU-diagnose: WebGL vroeg in OffscreenCanvas-worker, standaard uit tot gemeten, mogelijk overlap van driverinitialisatie en manifest/JS/data. Officiële contextconformantie: https://registry.khronos.org/webgl/sdk/tests/conformance2/offscreencanvas/context-creation-worker.html. Nog geen implementatie of winst van deze proef in dit checkpoint.
- WIP-checkpoint nu op cadans; warme reeks, LH-subscores en U65-main-baseline/compare blijven pending. Geen load- of perf-budget versoepeld.

## 2026-10-08 11:00:09 UTC — worker-WebGL-proef gebouwd, bestaande captures behouden

- Eigen wachtende groep 720543 gecontroleerd (geen lockhouder, run 2 wachtte) en gesloten; sessie synchroon exit 143. Reeds geldige CPU-opname én main-referentie run1 behouden. Referentie run1: ttfr 1617,3 ms, ttfp 775,1 ms, eerste regen 686,8 ms, startload 7,98. Eén van drie; geen gemiddelde/winstclaim.
- Nieuwe standaard-uit-proef VITE_WEBGL_PREWARM=worker: vroege HTML start voor desktop ≥900 px / ≥8 cores een OffscreenCanvas-WebGL2-worker met dezelfde belangrijke contextattributen als MapLibre. Werk overlapt mogelijk netwerk/JS; worker/context/BlobURL worden na antwoord, fout of 2 s timeout opgeruimd. Still/Skywatch en smalle/krappe apparaten slaan de proef over. Geen visuele wijziging of standaardactivatie.
- Typecheck, 509 units, proefbuild+gzip en gerichte echte WebGL-e2e synchroon exit 0: cd web && VITE_WEBGL_PREWARM=worker MOTREGEN_E2E_PORT=4365 MOTREGEN_E2E_DATA_PORT=8365 pnpm e2e e2e/basemap.spec.ts e2e/focus.spec.ts e2e/wind-zoom.spec.ts --project desktop. 13 geslaagd; twee touch-only en bekende continue-zoom-fixme overgeslagen. HTML gzip 2571 ->3143 B; JS exact dezelfde index-Dmop2tgE.js, 411.362 B gzip als shaderbatch-kandidaat.
- Native capture registreert webglPrewarm en --expect-webgl-prewarm weigert een inactieve proef. Wrapper --run ondersteunt herstart op de juiste bestandsindex. Lokale hervathelper valideert load/ttfr/ttfp, context/warm/profiler/query en entryhash vóór bestaand bestand te behouden; validatie van CPU- en referentie1 synchroon exit 0. Geen bestaande normale referentierun overschreven of diagnostische CPU-run als benchmark hergebruikt.
- Nieuwe enige seriële meetrunner gestart met 120-minuten buiten-lock-wacht en 5 s poll. Bestaande CPU/ref1 worden overgeslagen; overige referentie/kandidaten koud/warm en LH volgen per run onder lock, dan main-baseline/compare. Geen build/e2e tegelijk met eigen captures. Nieuwe winst/LH/U65-gate blijft pending.

## 2026-10-08 11:06:19 UTC — WIP workerproef en hervatcontrole

- Runbereikguard (run10 met repeat3 -> exit2 vóór browser/lock) en hervatvalidator met verkeerde entryhash (-> exit1, bestand niet als geldig hergebruikt) synchroon geverifieerd, overkoepelende check exit0. Bestaande correcte CPU/ref1 blijven behouden. Geen vergelijkingsbudget of metadata-loadgrens aangepast.
- WIP nu commit/push incl. standaard-uit-WebGL-workerproef, captureregistratie en --run-ondersteuning. Typecheck/509 units/proefbuild+gzip/13 desktop-WebGL-e2e reeds synchroon groen; native prototypewinst en finale U65-gate pending. Eén seriële runner, huidige load ~14, rustig-host-wacht buiten lock.

## 2026-10-08 11:11:07 UTC — koude rondevolgorde aangepast, referentie 1/2 behouden

- WIP e74d3c5 push synchroon exit0; remote e74d3c5a760ade3f048f40d11993143a3aa226f1 bevestigd. PR91 met standaard-uit-workerproef en pending vergelijking bijgewerkt, exit0.
- Inmiddels referentie run2 binnen; run3 stond buiten de lock te wachten. Eigen groep 753836 gecontroleerd en beëindigd, sessie exit143. Twee geldige referenties en CPU-diagnose blijven ongewijzigd bewaard.
- Lokale koude campagne nu per ronde referentie -> WebGL-worker -> shaderbatch -> vóór shaderbatch. Dit spreidt varianten over de meetperiode en levert eerder bewijs voor de nieuwe kandidaat. Het is een volgordewijziging, geen andere browser/fixture/clock/load- of gatevoorwaarden. Hervatvalidator slaat bestaande geldige referenties over; drie gewone runs per variant blijven vereist. Warm en LH daarna; één lock per run, wachten buiten lock.

## 2026-10-08 11:30:09 UTC — context-only-proef onderscheiden, GPU-werk toegevoegd

- Eerste context-only-workeropname geldig: ttfr1530,5/ttfp803,9 ms bij load8,00; prewarm-marker 17,2->25,0 ms. Er is een GL-context gemaakt, maar geen GPU-werk ingediend; main RunTask blijft ~241 ms. Post-ttfp LoAF 10/max435,6 ms. Shaderbatch run1 ook binnen: ttfr1135,2/ttfp783,2 ms. Eén per variant, nog geen winstclaim.
- Correctie van de proef: vóór ready-message daadwerkelijk clear + finish in de worker. Dat wacht alleen op de worker op GPU-completion; hoofdthread blijft asynchroon. Standaard uit. Oude context-only-HTML/build/opname blijven als aparte historische variant; nieuwe gpu-worker gebruikt andere dist/prefix zodat één oude opname niet in een nieuwe mediaan belandt.
- Native metadata krijgt HTML-SHA naast JS-entrycontrole: beide workerproeven delen dezelfde JS en verschillen juist in HTML. Hiermee kan hervatten die bronvariatie onderscheiden. Reeds geldige oudere captures blijven apart behouden via bekende frozen bron en navigation-size, niet herschreven.
- Alleen de gecontroleerde eigen loadwachtgroep779533 beëindigd vóór nieuwe build; sessie exit143. CPU, twee referenties, context-only-worker1 en shaderbatch1 bewaard. Nieuwe typecheck/build/gerichte WebGL-e2e volgen; WIP nu commit/push op cadans, nieuwe proefmetingen/gates pending.

## 2026-10-08 11:39:29 UTC — warm opnieuw gedefinieerd volgens PO, manifestproef standaard uit

- fda2d6e push synchroon exit0, remote fda2d6ec480e645fa458c973a2c9e7832816bb52 bevestigd. GPU-finish-proef: typecheck/build/gzip en basemap/wind-zoom desktop synchroon exit0, 5 geslaagd + bekende continue-zoom-fixme. HTMLgzip3195 B, ongewijzigde shaderbatch-JS. Hervatvalidator onderscheidt nu HTML-SHA; oude koude samples via matching frozen HTML-lengte + entry/fixture/mode. Vier bestaande CPU/ref1/ref2/batch1 gevalideerd; context-only tegen GPU-finish weigert exit1. Een lokale sed-aanroep had eerst verkeerde cwd, daarna correct uitgevoerd; runnerflag blijft --expect-webgl-prewarm.
- Nieuw PO-bericht: warm volwaardig, prioriteit direct na shaders; koud/warm samen rapporteren. Oude warme rig had cacheDisabled=true, hergebruikte dezelfde pagina en frontendno-store. Nieuwe warm: tijdelijk persistent profiel vullen (SW + PMTiles-ranges), gehele browser sluiten, nieuw browser/context/pagina op hetzelfde profiel, HTTPcache aan. Geen appgeheugen; metadata warmMethod/httpCacheEnabled/warmCaches/SWcontroller/responsecacheherkomst/finalUrl. Warmstart zonder SWcontroller is ongeldig. Referentie warm×3 voor conclusies. Nieuwe rigcacheheaders zijn voor alle frozen varianten gelijk; koude HTTPcache blijft uit.
- App-shell/stijlen/glyphs al in SW-precache, PMTiles exacte ranges in SW. Regen-Ranges NetworkOnly: nog uit te zoeken of HTTPpartial-cache ze bedient, of GLSwiftShader/contextwerk warm begrenst. Plaatsenlijst blijft na ttfp en buiten precache. Geen oude warmtijden als nieuwe baseline.
- Afzonderlijke VITE_WARM_CACHE=manifest-proef, standaard uit: alleen sessionmanifest?s=1, SWR met harde 15s bruikbaarheid, no-cache/reload/no-store gaan naar netwerk, geen foutresponses. Gerichte 6 cache-units, typecheck, kandidaatbuild/gzip en basemap-cache desktop synchroon exit0 (2 geslaagd, offline Range/style/catalogue bevestigd). Volledige units/laatste capturertypecheck volgen; er zijn nog geen koude/warme winstclaims. Native campagne krijgt warm in iedere ronde, met referentie×3 en manifestkandidaat koud/warm.

## 2026-10-08 11:40:14 UTC — nieuwe warme meetronde hervat, checks groen

- Laatste typecheck + Caddyvalidate + volledige pnpm test synchroon exit0: 77 bestanden, 511 units. Caddyheaders syntactisch geldig. GPU-finish-e2e vijf geslaagd/één bekende fixme, manifest-e2e twee geslaagd. Geen nieuwe productstandaard aangezet.
- Nieuwe enige seriële runner gestart: MOTREGEN_PERF_LOAD_WAIT_MINUTES=120 bash tmp/u64/u65-measurements.sh. Alle captures één run per lock; loadpoll buiten lock. Koude bestaande geldige referenties/CPU/shaderbatch blijven behouden, nieuwe warmmethode vereist metadata en wordt niet uit historische warmbestanden hergebruikt. Gefixeerde builds krijgen dezelfde Caddyheaders; detached main-referentie heeft identieke capturetools, productbron ongewijzigd ec3ca02.
- Koud shaderbatch1 ttfr1135,2/ttfp783,2 ms bij load7,92; volledige LoAF na ttfp15/max403,8 ms. Referentie koud1/2 ttfr1617,3/1669,1 en ttfp775,1/842,6. Warm nieuw pending; geen gepaarde winst/retentieclaim uit deze onvolledige reeksen. WIP-checkpoint/PR volgt op cadans.

## 2026-10-08 11:42:28 UTC — cacheheaders afgestemd op prod, warme loadguard werkt

- Prodcontrole nix/modules/motregen.nix + gegenereerde routes.caddy: frontend gebruikt geen jaar-cacheheader; alleen SW/manifest.webmanifest no-cache. Rig daarom beperkt tot hetzelfde gedrag, globale no-store verwijderd zonder nieuwe immutable-belofte voor onversieerde stijlen/fonts. Geen warme capture geschreven onder de tussentijdse headers; eerste warmseed brak na browserherstart bij load8,88 af met exit76 en liet de lock vrij. Daarna opnieuw buiten-lock-wacht. Deze guard werkt, maar een rustige host moet het volledige seed/startvenster dragen.
- Captures krijgen ook SW-SHA: manifestproef heeft dezelfde HTML én entry-JS als de shaderbuild maar een andere SW. Hervatvalidator controleert SW-SHA bij warm. Vier bestaande koude frozen captures blijven geldig; geen warme sample uit een andere SW hergebruiken. Laatste metadata-aanpassing is TypeScript-only; nieuwe typecheck pending, PR91 bijgewerkt en synchroon exit0.

## 2026-10-08 11:44:29 UTC — warmseed krijgt strengere startgrens buiten lock, WIP

- Eerste warmseeds startten rond load7,9 en verhoogden door eigen voorbereiding de load telkens naar8,9; elk werd afgebroken zonder capture en met lockvrijgave. Eigen groep821767 gecontroleerd/gestopt, sessie synchroon exit143. Geen warme timing weggezet of budget versoepeld.
- Warm wacht nu buiten flock op load≤6,5 voor seedruimte; echte capturegrens blijft8 na browserherstart en voor alle koude/warme varianten. waitForQuietHost accepteert alleen een extra strengere startgrens (boven8 weigert). --check in de lock gebruikt8, zonder enige slaap. Default voor gewone koude rig/andere tools blijft8. Alle varianten krijgen dezelfde warmmethode en marge; rustige buiten-lock-wacht vervuilt geen ander meetvenster.
- Metadata-typecheck en bash-syntax groen; negatieve grens9 verwerpt vóór meting (verwachte exit1), omvattende check exit0. Caddyvalidate na prod-afstemming exit0; vooraf één verkeerd cwd-pad naar perf/Desktop.Caddyfile, direct herhaald vanuit web. PR91 WIP/status bijgewerkt, exit0. Volledige511 units en relevante functionele e2e groen; warmbrowserherstart/cold-warm medianen, LH en U65-baseline/compare pending. WIP commit/push nu op cadans.

## 2026-10-08 11:49:59 UTC — manifestcache daadwerkelijk in SW getest, warme byte-attributie hersteld

- 9e2df7b push synchroon exit0; remote9e2df7b9577aa46b69d2b6c69d9348f18e149d33 bevestigd. Nu gerichte VITE_WARM_CACHE=manifest MOTREGEN_E2E_PORT=4365 MOTREGEN_E2E_DATA_PORT=8365 pnpm e2e e2e/manifest-cache.spec.ts --project desktop synchroon exit0, één geslaagd (33,3 s suite). Browser-HTTPcache gewist, recente sessionmanifestrespons offline uit SW; no-cache offline faalt; na15s faalt gewone offlinefetch; online expliciet verversen werkt. Dit toetst hookserialisatie en de versheidsgrens in de echte SW, zonder timingclaim.
- Start-waterfall corrigeert een historische warme meetfout: context-events zagen zowel paginaverzoek als SW-upstream, daardoor headercount82 in plaats van41. Range-rijen tellen nu alleen paginaverzoeken. Negatieve PlaywrightresponseBodySize bij SW/cache wordt als onbekend weergegeven, niet opgeteld tot negatieve kB en ook niet als bewezen nul-wirebytes geïnterpreteerd. Resource-bodybytes zijn geleverde bytes. Offline heranalyse warmref1 en nieuwe koude ref1 synchroon exit0; oude rawbestanden blijven ongewijzigd, gegenereerde Markdown bijgewerkt.
- Warme methodemetadata in watervaltabel, aan/uit-cache/SWcontroller expliciet. Oude warme tabel heet historische methode; nieuwe warmbrowserherstart blijft pending. Externe hostload momenteel>18, eigen perf-runner buiten lock. Functionele tests draaiden zonder perflock zoals afgesproken; eigen capture niet tegelijk actief. Volgende stap: eerste drie nieuwe warmreferenties en gepaarde koud/warmkandidaten, daarna LH/gate. Geen brede perf.spec/dagelijkse suite gestart.

## 2026-10-08 11:54:46 UTC — warme seed blijft over herpoging bewaard; marge vervangen

- Eigen wachtgroep825320 gestopt vóór runnerwijziging, sessie synchroon exit143; geen capture actief. Strengere6,5-start was een tijdelijke aanpak voor seedruimte maar kan rustige koude/warme vensters ongebruikt laten. Vervangen door profielbehoud over exit76: outer desktop-rig maakt per warmherhaling een tijdelijk Chromeprofiel, seed vult het onder lock en sluit de browser. Bij drukte blijven uitsluitend schijfcaches bewaard; lock vrij, buiten-lock-wacht≤8; nieuwe context heropent die cache zonder opnieuw te primen. Alle echte captures blijven load≤8. De extra headroom-env/helperparameter is verwijderd.
- Seedcache-inventaris en seededAt worden opgeslagen; geen browser/appstaat leeft tijdens de loadwachtrij. Manifestcache kan daarbij verlopen zoals bij een echt later bezoek; geen herpriming om kunstmatig binnen de15s-ttl te blijven. Profiel wordt na deze ene meting of fout door outertrap opgeruimd; iedere volgende run krijgt een andere tijdelijke map. Hoofdcriterium nog ongewijzigd: nieuwe pagina met HTTP/SW-schijfcaches en geen in-memory appstaat.
- Laatste typecheck + bash-syntax synchroon exit0; watervaltabeltypecheck eveneens0. Enige seriële runner hervat met120min buiten-lock-wacht. Functionele manifestfreshness-e2e bewijst echteSW-hooks; timingbrowserherstart en volledige koud/warmreeksen nog pending.

## 2026-10-08 11:57:59 UTC — rustig venster gevraagd, één runner blijft wachten

- Hostload daalde kort richting10 maar piekte opnieuw26–27; runner wacht buiten lock, geen warme baseline of nieuwe capture. De orkestrator via de beschikbare async-tekstvraag om een rustig meetvenster≤8 van20–30min gevraagd; ik sluit geen main/andermans browsers of botprocessen om de host te forceren. Geen antwoord nodig voor reeds geautoriseerde metingen; deze gaan door zodra eigen loadguard een geldig venster ziet.
- Spec aangevuld met nieuwe PO-prioriteit, koude/warme gepaarde rapportage en profielbehoud, eigenaar/vervaldatum voor onzichtbare standaard-uit-proeven. Productbesluiten blijven in proposals; dit beschrijft de ontvangen uitvoeringsinstructie. PR91 draft bevestigd op9e2df7b, statusCheckRollup leeg: geen CI-groenclaim, lokale synchroon geobserveerde checks staan in LOG.

## 2026-10-08 12:01:35 UTC — orkestrator autoriseert load≤12 uitsluitend voor gepaarde verschillen

- Antwoord op venstervraag: drukte komt van hydra/rustc van andere projecten; geen gegarandeerd rustig venster. Nieuwe expliciete instructie A B A B A B in hetzelfde loadvenster, load per run, verschil binnen paren; gepaard start≤12 toegestaan, absolute docs/perf-baselines≤8 blijven. Geen externe processen gesloten. Eigen enige wachtgroep841346 gesloten, sessie synchroon exit143, om de campagne te vervangen; geen meetbrowser actief.
- MAX_LOAD_AVERAGE blijft8; afzonderlijke MAX_PAIRED_LOAD_AVERAGE=12 alleen met expliciete desktop --paired + wrapper-env, verplichte --pair en --role A/B. Capturemetadata pairedRun/pair/pairRole/absoluteBaselineEligible voorkomt dat zulke runs een absolute baseline suggereren. Quietguard en hercontrole na warmseed gebruiken hetzelfde aangevraagde meettype; wachten en browser-opruimen blijven buiten/na één lockrun. Typecheck synchroon exit0; gepaarde campagne wordt nu klaargezet. Oude losse referenties/kandidaten niet achteraf als een paar geclaimd.
- WIP checkpoint op cadans incl. echte manifestfreshness-e2e, correcte warme Range-attributie, bewaarde diskseed bij herpoging en nieuwe paarmeting-instrumentatie. Absolute U65-baseline/compare nog pending≤8; gepaarde verschillen gaan nu vóór. Koud/warm beide per kandidaat, ttfr/ttfp bovenaan en LoAF na ttfp als bewaker.

## 2026-10-08 12:05:49 UTC — gepaarde campagne gestart, eerste A binnen

- d582827 push synchroon exit0, remoted58282739530396322ac9a2cbd364a229df1e664 bevestigd. Positieve/negatieve lokale guardchecks exit0: absolute default8, explicietpaired12, reset8; eerdere losse referentie wordt niet als gepaard bestand hergebruikt. Shellsyntax van de lokale runner groen.
- Enige runner: MOTREGEN_PERF_LOAD_WAIT_MINUTES=120 bash tmp/u64/u65-paired-runs.sh >tmp/u64/u65-paired.txt. Shaderisolatie eerst: U64 vóór shaderbatch A, U64 met batch B, A B A B A B koud en warm. Daarna GPU-worker, manifest-SWR, en samengevoegde U64 tegenover main, steeds beide scenario's. Per A/B nieuwe browser/eigen profiel; bevroren builds en fixtures gelijk. Losse oudere ≤8-captures blijven als absolute gegevens bewaard, niet opgenomen in gepaarde verschilmedianen.
- Aanvullende lokale paarvalidatie: tijd tussen A/B-start≤300s en abs(loadverschil)≤2, beide≤12; anders raw behouden als afgewezen en nieuw heel paar. Dit is een extra strengere venstercontrole om een hydrapiek tussen A/B niet als winst te claimen. Rapport toont load/tijdgap en ttfr-/ttfp-verschil per paar, dan medianen van drie verschillen. Geen wijziging aan docs/perf absolutegrens of byte/decodebudget.
- Eerste koude shader-A binnen (nog géén compleet paar; warm pending), B wacht door nieuwe hostpiek>20 buiten lock. Paarmetadata en absoluteBaselineEligible=false aanwezig. Eén waterval-labelpatch had verkeerd speccontextanker, apply_patch weigerde; juiste patch daarna toegepast. Volgende stap: volledige paren, koude/warme delta samen en LoAF na ttfp, LH-subscores en absolute U65-gate daarna.

## 2026-10-08 12:13:33 UTC — eerste volledig koud shaderpaar, warm nog pending

- Koud paar1 (vóór shaderbatch A -> batch B): ttfr1335,3 ->1162,5 ms (−172,8 ms/−12,94%); ttfp933,7 ->796,8 ms (−136,9 ms/−14,66%). Warm pending. Eén van drie; geen retentie- of winstclaim. Load10,07/11,95, tijdgap270,9s binnen afgesproken extra venstercontrole. Volledige post-ttfp LoAF A14/max495,5ms, B13/max402,5ms; primaire delta eerst, guard afzonderlijk. Watervallen van beide synchroon gegenereerd, exit0.
- Nieuwe native captures nemen load tijdens de opname elke seconde op (naast startload) en registreren custom cachedManifestAt-header om SWR-hit van SW-NetwerkOnly te onderscheiden. Eerste paar heeft nog geen loadserie, volgende wel; raw nooit herschreven. Paarassessor rapporteert gemiddelde/max als beschikbaar. Dit is metadata, geen verdere productwijziging of hostdrukte als absolute winstclaim. Typecheck na laatste metadata pending; meetrunner leest volgende captureproducer-versie, geen browser of warmcache leeft tijdens zijn wacht.
- PR91 bijgewerkt met expliciete≤12-relatieve/≤8-absolute splitsing, synchroon exit0. Nieuwe absolute baseline en LH nog pending. Volgende koude A reeds verzameld; B/warme paren volgen per lockrun, eigen browsers telkens gesloten.

## 2026-10-08 12:20:01 UTC — koude shaderparen compleet, eerste warmpaar; checkpoint

- Drie koude shaderparen compleet. Gepaard ttfr-delta −172,8/+80,3/+97,2ms: mediaan +80,3ms/+7,17% (regressie), ttfp −136,9/−242,9/−19,1ms: mediaan −136,9ms/−14,66%. Warm paar1 ttfr1114,9->1228,2ms (+113,3/+10,16%), ttfp771,0->770,7ms (−0,3ms); twee warme paren pending. Dit ondersteunt nog geen behoud: PO weegt ttfr zwaarder, kandidaatbesluit pas na volledige koude/warme reeks. Mogelijke shaderparalleliteit concurreert met MapLibre; dat is hypothese, geen vastgestelde oorzaak.
- Load/startgap koud1 10,07/11,95/270,9s; koud2 11,90/11,75/235,9s; koud3 11,66/11,97/175,8s; warm1 11,37/11,85/56,4s. Post-ttfp LoAF-max A/B koud495,5/402,5;528/384,3;426,9/391,1; warm448,2/410,6ms. SwiftShader heeft ook in warm nog grote GPU-/schedulergaten; geen nulclaim of MacBook-winst.
- Loadseries vanaf koudeB2, beide koud3/warm1: warmgemiddelden12,31/12,78 en maxima13,31/13,56; startgrens12 is behouden, latere load transparant. Nieuwe frontend-Caddyaccesslog per run gaat echte upstream/bodybytes toetsen, omdat fromServiceWorker bij NetworkOnly geen cachehit bewijst en Pagebytes negatieve/ontbrekende cachegroottes bevatten. Geen data-origin/manifests/productcache gewijzigd; logs blijven ignoredtmp. Logger/typecheckcontrole volgt nu; bestaande paren blijven gemarkeerd zonder deze extra log.
- WIP commit/push op cadans; PR draft, koude/warme restkandidaten, LH en absolute≤8-baseline/gate pending. Eén eigen runner, Chromiums alleen tijdens seed/capture en daarna dicht.

## 2026-10-08 12:29:41 UTC — windbatch teruggedraaid, regencandidate geïsoleerd

- Drie koude shaderparen geven ttfr mediaan+7,17%; twee warme ttfr-paren+10,16/+1,98%, dus zelfs derde negatieve warmdelta kan warme mediaan niet onder+1,98% brengen. Volledige windbatch voldoet niet aan primaire TTFR-prioriteit. Wind-layer exact terug naar main ec3ca02; shaderstrings/simulatie onveranderd. Alleen regen laat beide shaders vóór de linkvraag compileren, zonder tussentijdse compile-statusvragen. Helper vereenvoudigd tot één programma, foutlogs/resourcecleanup behouden. Dit is een nieuwe kandidaat, geen herlabeling van oude fullbatch-runs.
- Eigen groep851680 was buiten-lock-loadwacht, gecontroleerd/gestopt; sessie exit143. Coldfullbatch3 en warmfullbatch2 blijven onveranderd; derde warmfullbatch kan met frozen oude build afgemaakt worden voor volledige rapportage. Nieuwe regen-only-default, GPU-worker en manifestproef krijgen andere frozen dists en eigen paarprefixes. Beide warmproeven blijven standaard uit.
- Eerst verkeerd gegiste wind-gl.ts-pad: git show faalde128 en maakte leeg eigen bestand, verwijderd; correct wind-layer.ts uit ec3ca02 hersteld. Root-pnpm typecheck ging synchroon groen voor bot/web, maar build-logredirect had verkeerde cwd en faalde1 vóór build. Daarna juiste web-commando's gestart: typecheck,511units,3frozen-builds/gzip,gerichte basemap/wind-zoom desktop; receipts pending. Geen meting tegelijk met deze eigen builds/e2e.
- Next: fullbatchwarm3 afmaken, regen-only A/B koud/warm×3 direct na shaders, dan GPU/manifestproeven herbaseerd op regen-only en totaleU64tegenmain; absolute≤8-gate/LH daarna. Cadanscheckpoint c99da28 push synchroon0, remotec99da28992c06e62f4327b5134cb8842de39ab1a bevestigd.

## 2026-10-08 12:43:45 UTC — gepaard≤16 toegestaan, regen-only checks groen, WIP

- Aanvulling orkestrator: host32 kernen, load15–20 ongeveer halve bezetting; botsnice15, hydra-soak ander project. Uitsluitend expliciet gepaarde runs mogen vanaf nu starten≤16 (was12), absolute baseline≤8 blijft. Eigen wachtgroep908877 gesloten, sessie synchroon exit143, geen meetbrowser actief. Loadwacht buiten flock, één run per lock. Metadata bewaart loadLimit; historische captures zonder veld blijven in hun watervallabel≤12.
- pnpm typecheck en guardcheck synchroon exit0: default8, paired16, reset8. Shellsyntax exit0. Identieke tooling/Caddy naar detached ec3ca02-referentie gekopieerd; productbron daar ongewijzigd. Regen-only frozen builds normaal/GPU/manifest: 411429B gzipentry; HTML2573/3197/2573B. Voorafgaande juiste web-chain synchroon exit0: typecheck,511units,3builds/gzip,basemap/windzoom-e2e5pass/1bekendefixme. Geen productproef standaard geactiveerd.
- Frontend-Caddy sessionmanifest ?s=1 krijgt nu defer no-store, conform productie; validatie synchroon exit0. Historische warmfullshader2B-serverlog had alleen twee304revalidaties (manifest/SW), nul bodybytes en geen Range/tegel/font/JS/plaatsen-upstream. Nieuwe paren gebruiken dezelfde gecorrigeerde headers aan beide kanten. Serverlog dient echte netwerk-attributie; SW-fromServiceWorker is geen cachebewijs op zichzelf.
- RESULTATEN bijgewerkt: coldfullshader mediaan ttfr+7,17%,ttfp−14,66%; warm2paren ttfr+10,16/+1,98%, derde pending. Windbatch terug naar main; regen-only timing pending. WIP commit/push nu; één seriële gepaarde runner volgt, koud/warm samen, LH en absolute≤8-gate daarna.

## 2026-10-08 12:50:17 UTC — shaderreeks compleet; shellwijziging tijdens run gecorrigeerd

- Volledige shaderbatch warm3 geldig: ttfr1343,5->1120,5ms (−223ms/−16,60%),ttfp784,7->785,2ms (+0,5ms),startload15,60/15,17,gap65,0s. Eerste poging warm3 was gap804s en afgewezen, raw behouden. Mediaan van drie warmverschillen ttfr+21,8ms/+1,98%,ttfp+0,5ms/+0,064%; koud+7,17%ttfr/−14,66%ttfp. Windbatch blijft afgewezen. Eerste twee warmpaarheaders revalideren, derde paar nieuwe prod-no-storeheaders: beide kanten per paar gelijk; geen absolute poolingbaseline.
- Fout: desktop-rig.sh aangepast terwijl regen-B nog draaide (Lighthouse-doorvoerflags); Bash las later gewijzigde offset en gaf unexpected EOF, runner synchroon exit2. CaptureJSON/trace waren volledig; daarna shellsyntax exit0, beide HTML/entry/methode/paar/loadvalidators exit0 en paarassessor uitgevoerd. Productbron en raw niet herschreven. Vanaf nu shellrunnerwijzigingen alleen als eigen runner gesloten is; hier gesloten vóór hervatting. Caddytraps hebben servers gesloten.
- Nieuwe offline start-upstream.ts analyseert alleen Caddylogevents in navigatie..+12s, telt responsbodybytes zonder TCP/headersclaim. Oudewarm2B:2requests,0bodybytes (304manifest/SW). Nieuwno-storewarm3B:2requests,36513Bmanifest200 en SW304, geen kaart/fonts/app/weer-Ranges-netwerk. CLI synchroon exit0; typecheck na analyzer/LHmetadata exit0.
- Lighthouseproducer voegt paar-ID/rol, startload/grens en loadseries aan sidecarmetadata toe; zelfde pinned13.0.1/config. Drie A/B-paren main->regen-only voorbereid, nog niet gestart; native koud/warm eerst. PR91 bijgewerkt synchroon exit0. Checkpoint4b4aca4 gepusht/remoteconfirmed.

## 2026-10-08 12:59:39 UTC — regen koud×3, warm bijna compleet, Lighthousemetadata gereed

- Regen-only koud3paren: ttfr+115,9/−531,0/−101,0ms (mediaan−101,0ms/−7,95%);ttfp+129,9/−240,7/+7,3ms (mediaan+7,3ms/+0,935%). Warm1 ttfr−3,2ms/−0,287%,ttfp−40,1ms/−5,09%; warm2 ttfr+168,5ms/+12,81%,ttfp+176,7ms/+23,81%; derde loopt. Geen behoudsbesluit vóór warm3/totale-mainvergelijking. Coldpaar2 opnameload15,85/13,62 geeft onzekerheid over grote−531ms. Post-ttfpLoAF warm2B max768,4ms, dus bewaker nog onvoldoende.
- Paaroverzicht opnieuw offline uit raw: loadseries uitsluitend navigatie..+12s, dump-/naberekeningssamples niet mee. Historische raw en acceptedmarkers ongewijzigd. Bashfout-gevolg nogmaals geverifieerd met set-e: beide regenpaar1-capturevalidators exit0; geen gedeeltelijke raw geaccepteerd.
- Typecheck na laatste Lighthouseguard synchroon exit0. Negatieve producerchecks exit0: ontbrekende paar-ID en directe CLI zonder hostlock weigeren vóór browserstart. LH13.0.1/config ongewijzigd; producer sidecar heeft realetime load/perpaar/HTMLhash. Native parser/serverlogCLI groen; daadwerkelijke nieuwe LHrun pending. Scripts alleen bij gesloten runner gewijzigd na eerder beschreven EOF. Enige native runner loopt nu met vaste shellbestanden; gewoon typecheck/metadatawerk onder geen perflock.
- origin/main opgehaald:1c3ef81 met warm-MIP23/docjournal/Nix-SSH/samples; git diff ec3ca02 origin/main -- web leeg. Main bij dit checkpoint samenvoegen; frontendfrozen refs ec3 blijven identiek en geldig, geen nieuwe baselineverschuiving. WIP commit/push op15–20min-cadans; absolute≤8baseline/gate nog pending.

## 2026-10-08 13:05:22 UTC — regenvariant afgewezen; warme main-referentie voorop

- Regen-only warm×3 compleet: ttfr−3,2/+168,5/+347,8ms,mediaan+168,5ms/+12,81%;ttfp−40,1/+176,7/+224,1ms,mediaan+176,7ms/+23,81%. Cold mediaan−7,95%ttfr/+0,935%ttfp weegt niet op tegen warmregressie. Rain-layer exact terug naar ec3ca02/main, gl-programhelper verwijderd. Beide shaderkandidaten afgewezen, geen statusvraagwijziging in product over.
- Eigen enige runnergroep945255 gecontroleerd/gesloten, sessie synchroon exit143. Eén rain-GPU-coldpaar volledig behouden: ttfr−46,3/ttfp+50,3ms, geen retentieclaim; volgende run nog zonder meet-Chromium, geen complete sample. Deze prefixes blijven historisch. Nieuwe GPU/SWR-builds en base-prefixes mengen niet met afgewezen regenbasis. Shellbestanden aangepast pas nadat runner gesloten was.
- Correct web-chain synchroon exit0: pnpm typecheck; pnpm test (77bestanden/511units); defaultcontrol-,GPU-,manifestbuilds en gzip. Defaultcontrol JS/HTML/SW bytegelijk aan u65-before-shaders-dist. Entryindex-DsGkk-QI.js gzip411280B voor alle drie, HTMLgzip2573/3197/2573B. Log:tmp/u64/u65-base-unit.txt en u65-base-*-build.txt. Geen gewone e2e/bouw onder lock.
- Enige seriële nieuwe campagne warm mainA->U64zonderShadersB×3 eerst, dan koud×3, daarna GPU en manifest elk koud/warm×3. Referentiewarm krijgt zo prioriteit vóór probes; geen absolutebaseline uit paired≤16. Absolute≤8docs/gate blijven pending. LH-paarcampagne omgezet naar dezelfde shaderloze basis, nog pending. RESULTATEN bijgewerkt met beide shaderafwijzingen en guard768ms.
- Cadanscheckpoint dc3f089+mainmerge1d5cdd7 gepusht, synchroon exit0 en remote1d5cdd764a01471391ca89e036fdcaf4f4175ca4 bevestigd. origin/main schoof tijdens merge door totfcc4249 (alleen journal); frontendbasis ec3 onveranderd.

## 2026-10-08 13:15:58 UTC — warm main/U64×3 compleet, checkpoint

- Warm paired mainA->shaderloosU64B3paren: ttfr1253,6->1240,4;1499,6->1242,3;1790,6->1091,6ms, deltas−13,2/−257,3/−699,0ms,mediaan−257,3ms/−17,16%. Ttfp737,4->808,9;786,4->772,6;926,3->746,1ms, deltas+71,5/−13,8/−180,2ms,mediaan−13,8ms/−1,75%. Koud pending; geen absolute baseline of definitief koud/warmbehoud uit alleenwarm.
- Startloads14,58/14,77;15,56/14,57;13,04/14,91. Alle≥8 captures explicietpaired en absoluteBaselineEligiblefalse. LoAF na ttfpmaxA/B431,9/368,1;514,3/435,9;526,0/440,2ms, bewaker nog grote frames. Referentiewarm×3 nu volgens nieuwe diskcache/browserherstartmethode; absolute≤8-referentie/gate nog afzonderlijkpending.
- Warm pair1 upstreamCLI + watervalgenerator synchroon exit0. Aan beide kanten exactmanifest20036513bodybytes + SW3040body; geen tegels/fonts/JS/plaatsen/weerRange-upstream. Resource-bodybytes tonen leveringenuitcache; geen networkByteclaim uit negatieve Pagegroottes. U64font8,4msvsmain136,6 en manifest12,2vsmain89,6ms; eerste regen725,2vsmain651,3 laat zien dat vroege aanvragen niet automatisch eersteRainwinst zijn. Decodeantwoord opmain is geen workerstart; GPU-/uploadvenster apart.
- OrigineleGLshadercode hersteld/defaultcontrolbytegelijk,511units/typecheck/3builds eerderexit0. WIP nu commit/push opcadans met RESULTATEN; originmain6eb2c57 heeft alleenNixbotbudget/MIP25/journal en geenwebdifftegenec3, dus geen baselineverschuiving bij merge. Eén runner, koudmain×3 daarna GPU en manifest elk koud/warm×3. LH13-pairs/absolutegate pending.

## 2026-10-08 13:33:27 UTC — koud en warm main/U64 compleet, primaire winst, WIP

- Cold main->U64 zondershaders3paren: ttfr1420,1->1173,4;1436,4->1163,8;1213,8->1134,6ms (deltas−246,7/−272,6/−79,2,mediaan−246,7ms/−17,37%). Ttfp766,5->791,3;771,8->793,4;763,4->788,3ms (deltas+24,8/+21,6/+24,9,mediaan+24,8ms/+3,24%). Warm eerder3paren ttfr−257,3ms/−17,16%,ttfp−13,8ms/−1,75%. Alle6paren primairettfrbeter. HTMLstijl/font/manifest+lazy blijven; koude25msttfpregressie transparant, shaderproevenafgewezen.
- Coldstartloads15,51/14,91;15,77/14,98;14,91/15,60;gaps157,9/115,6/85,7s. Eerste pogingcold1 afgewezen bijload10,63/13,95 (Δ3,32), gunstigttfr−260,8ms nietmeegeteld. ColdLoAFmax542,9/475,8;484/394,8;407,4/394,9ms; groteframesaanwezig. Geen claimdatguardopgelostofabsolute≤8baselinebehaald.
- docs/perf.md warmmethode hersteld: oudeHTTPcache-uitbeschrijving verwijderd; nuHTTP/SW-diskcaches+browserherstart, profielopruimen/seedbehoud, explicietpaired≤16versusabsolute≤8, LHsidecar enserverlog-bodybewijsscope. Geen nieuwe≥8absolutegetallenindocs gezet. Eersteapplypatchcontext miste zin over/weer; weigerdezonderwijziging, daarna juistecontext. Diffcheckexit0.
- GPU/manifestcoldwarm×3 looptserieel opfrozen shaderlozeindexDsGkk (geenlivecodewijziging); LHpairedcampaign klaar, daarnastarten. Absolute≤8baseline/gate nogpending. PR91wipbijgewerktsynchroonexit0; checkpoint89d5f40push/remoteexit0bevestigd. NieuwWIPcommit/push opcadans met koud+warmsamen; éénrunner, geenonmeet-Chromiums.

## 2026-10-08 13:51:37 UTC — LH-paarreeks gestart; GPU warm nog pending, checkpoint

- Nieuwe LH13.0.1 A/B-reeks mainfrozen->U64zonderShaders, dezelfde fixture/server/instellingen. Tweede noodzakelijke runner gestart naast native; beide éénrunper dezelfdeflock en loadwacht buitenlock≤16, nooit twee meetbrowsers tegelijk. Command:MOTREGEN_PERF_LOAD_WAIT_MINUTES=120 bash tmp/u64/u65-lighthouse-pairs.sh >>tmp/u64/u65-lighthouse-paired.txt. Nativecampaign blijft tmp/u64/u65-paired-runs.sh. EersteLH-Areport geproduceerd; B/3paren pending, geen pairedLHdelta/scorewinstclaim. Eén sourcemapwaarschuwingmappinglastcolumnoutofbounds opmainentry; echteLHexit/meta nog controleren, geen paginaruntimefout daaruit afleiden.
- GPUcold1A/Bttfr1130,7->1222,3ms (+91,6/+8,10%),ttfp776,1->799,7ms(+23,6/+3,04%). Cold2ttfr1238,6->866,8ms(−371,8/−30,02%),ttfp766,1->867,8ms(+101,7/+13,28%). Tweeparen,warmpending, geenretentie. Ready-markers13,5/8,8ms, beideGLclear/finish-proef actief. Derdeattempt1timegap323,3s afgewezen ondanksload15,16/13,18; raw behouden, nieuwpaar volgt. Nativebar≤300s/Δload≤2 voorafvastgelegd; geen posthocgunstigeselectie.
- Lokale samenvatter berekent nu de gewone mediaan ook bij evenaantallen (gemiddelde middentwee); voltooidverslagblijft alleen×3reeksen. Historische3paren/deltas onveranderd. Host piekte25–26load, runners wachttenbuitenlock; grens16/absolute8ongewijzigd. Warmcache/GPU blijven standaarduit.
- Checkpoint9ce4a17pushsynchroonexit0, remote9ce4a1705c4b444011d54a69928e78c1a13f7035 bevestigd. Docsmetwarmmethode/gepaarde16grenscommitted, geen nieuweabsolute≥8cijfers. VolgendeWIP alleenLOGopcadans; LH/GPU/manifestenabsolute≤8gatepending.
