# U64 — stap 0: desktop-waterval

Meetbasis: ongewijzigde productcode op `bb0792b`. Ruwe PO-profielen lokaal in
`macbook-firefox/`, ruwe rigrapporten en CPU-traces in gitignored `tmp/u64/`.
**Stap 0 compleet vóór een productwijziging:** bestaande desktoprig ×3 en aanvullende
stock-build met Desktop-Chrome/V8-trace ×3, beide synchroon exit 0.

## MacBook van de PO

Tijden in ms vanaf navigatie. De Firefox-opnames zijn van 20:32 (Buienradar) en
20:33 (motregen); de Chrome-opname van 20:49 bevat laden én zoeken.
Deze ladingen hebben een onbekende cachetoestand en oudere builds met OpenFreeMap.
Een gecachte request is geen 0 kB asset. Ontbrekende fasen zijn geen nulduur.
Chrome-tijden gebruiken renderer-notificaties (`ResourceSendRequest` → `ResourceFinish`),
niet `finishTime` van de netwerkthread: die komt bij HTML vóór de START-notificatie binnen.

| schakel | Firefox motregen begin → eind | Chrome motregen begin → eind | waargenomen transfer / omvang |
| --- | ---: | ---: | --- |
| HTML | 4 → 101 | 52 → 90 | 1,28 kB / Chrome uitgepakt 3,08 kB |
| JS-entry | 89 → 342 | 54 → 256 | Firefox 411 kB; Chrome 409 kB / uitgepakt 1.407 kB |
| JS parse/compile | ontbreekt | parsevenster 93 → 255; compile 255 → 256 | Chrome parse CPU 16,66 ms; compile CPU 1,13 ms; parsevenster bevat netwerk-wachten |
| CSS | 89 → 180 | 54 → 124 | Firefox 26,65 kB; Chrome 26,89 kB / uitgepakt 148,24 kB |
| stijl-JSON | 692 → 702 | 564 → 566 | gecacht; Chrome uitgepakt 43,08 kB |
| glyphs | 803 → 817 | 685 → 688 | gecacht; Chrome twee fonts samen 156,49 kB uitgepakt |
| basemap-tegels | niet gezien | 653 → 660 | gecacht; vier vectortegels 1.213,47 kB uitgepakt (+ vier rastertegels) |
| manifest | 396 → 581 | 297 → 499 | ≈2,77 kB; Chrome uitgepakt 38,49 kB |
| header-Ranges | 590 → 1512 | 512 → 598 | 39 headers; Firefox 171,52 kB; Chrome grotendeels gecacht |
| eerste regen-Range | 734 → 1579 | 605 → 607 | Firefox 99,73 kB; Chrome gecacht, uitgepakt 104,64 kB |
| tweede regen-Range | 1580 → 1859 | 625 → 627 | Firefox 101,11 kB; Chrome gecacht |
| regendecode | ontbreekt | ontbreekt | geen app-fasen: geen `?perf` |
| regen-textuur | ontbreekt | ontbreekt | geen app-fasen; GPU-fence evenmin gemeten |
| eerste regen-tekenbeurt | ontbreekt | ontbreekt | geen app-fasen |
| ttfp | ≥1859 | ≥627 | alleen netwerkondergrens; niet "speelt" |
| FCP / LCP | 402 / 468 | 480 / 814 | splash/DOM-paint, geen bewijs van geladen kaart |

Firefox Buienradar: HTML 3–222 ms; eerste radarbeeld 697–795 ms; tweede
1704–1816 ms, dus netwerkreferentie ttfp-ref 1816 ms. De opname stopt kort daarna;
een lang doorlopende animatie is niet vastgelegd.

**Kritieke keten in Firefox:** HTML → JS (342 ms) → manifest (581 ms) → regenheader
→ eerste regen-Range (1579 ms) → decode/upload/draw (ontbreken) → tweede kaartframe.
De 39 headers overlappen de eerste regen-Range; die Range bezet 845 ms. Basemap was
grotendeels al gecacht. De Chrome-opname is warmer en bewijst geen koude versnelling.

Repro: `cd web && pnpm prof:firefox ../.dev/tracks/u64-desktop-waterval-lus/macbook-firefox/Firefox*.json.gz`;
`pnpm exec tsx scripts/devtools-trace.ts ../.dev/tracks/u64-desktop-waterval-lus/macbook-firefox/Trace*.json.gz --window=0,3000`.

## Rig

De bestaande `perf:mobile --profile desktop` houdt een Pixel-context, 4 cores/4 GB,
coarse pointer en het krappe decodebudget, met viewport 1280×800 en CPU 1×. Hij blijft
de bestaande regressiegate. `scripts/desktop-start.ts` vult hem aan met een Desktop-Chromecontext,
8 cores/8 GB en het ruime budget. De V8-trace heeft meetoverhead; SwiftShader is geen MacBook-GPU.

### Bestaande regressierig: koud-spelend, eigen kaart ×3

| schakel | run 1 begin → eind | run 2 begin → eind | run 3 begin → eind | kB per run |
| --- | ---: | ---: | ---: | ---: |
| HTML | 3.4 → 8.2 | 1.5 → 4.3 | 1.8 → 4.9 | 1.0 / 1.0 / 1.0 |
| JS-entry | 14.0 → 24.0 | 10.8 → 19.6 | 11.6 → 21.0 | 417.9 / 417.9 / 417.9 |
| CSS | 14.1 → 21.4 | 10.8 → 17.1 | 11.6 → 18.3 | 26.4 / 26.4 / 26.4 |
| stijl-JSON | 85.8 → 90.7 | 83.9 → 88.4 | 82.9 → 87.7 | 5.8 / 5.8 / 5.8 |
| glyphs | 105.7 → 109.9 | 102.6 → 106.1 | 104.7 → 109.3 | 76.6 / 76.6 / 76.6 |
| basemap-Ranges | 448.9 → 551.4 | 187.2 → 272.7 | 192.2 → 274.4 | 186.9 / 186.9 / 186.9 |
| manifest | 87.6 → 95.7 | 85.4 → 92.6 | 84.6 → 92.4 | 36.5 / 36.5 / 36.5 |
| header-Ranges | 117.1 → 484.6 | 115.5 → 235.4 | 117.1 → 237.3 | 123.9 / 123.9 / 123.9 |
| eerste regen-Range | 448.1 → 502.3 | 159.6 → 235.6 | 138.2 → 237.8 | 4.5 / 4.5 / 4.5 |
| eerste regendecode | 506.6 → 507.5 | 239.6 → 241.6 | 243.6 → 244.5 | — |
| eerste textuur | 542.1 → 542.3 | 265.0 → 265.3 | 264.9 → 265.1 | — |
| firstRainMs | 561.5 | 280.8 | 287 | — |
| basemapReadyMs | 1123 | 553.4 | 556.4 | — |
| ttfrMs | 1123 | 553.4 | 556.4 | — |
| ttfpMs | 621.3 | 348 | 349.5 | — |
| ttfhMs | 722 | 484 | 500 | — |

Wire 1.680.992 / 1.686.015 / 1.680.992 B; 298 decodes elk. Loadavg 7,07 / 6,61 / 7,34. Deze rig bevat geen native V8-events; parse/compile hieronder komen uit de aanvullende stock-build.

### Aanvullende stock-build: echte desktopcontext ×3

Koud = verse browsercontext, HTTP-cache uit, SW geblokkeerd; browserproces/SwiftShader worden tussen herhalingen gedeeld. Eerste run bevat extra GPU-initialisatie. Geen MacBook-emulatie. Stijl-JSON is hier ongecomprimeerd 15,9 kB, in de mobiele rig 5,8 kB geminificeerd. Eerste textuur is de CPU-aanroep, eerste tekenbeurt is firstRainMs; geen GPU-fence.

# step0-stock-cold-run1.json

Loadavg 7.96; desktop 1280×800, 8 cores/8 GB, CPU 1×, SwiftShader. Trace-overhead aanwezig. Decodetijd is workerduur teruggeteld vanaf het antwoord op de hoofddraad; exacte start in de worker ontbreekt. Textuurduur meet CPU-aanroep, geen GPU-fence.

| schakel | begin → eind (ms) | encoded kB / decoded kB |
| --- | ---: | ---: |
| HTML | 0.0 → 2.0 | 1.0 / 3.1 |
| JS-entry | 3.9 → 8.9 | 417.9 / 1431.8 |
| JS-modules | 75.1 → 785.7 | 25.2 / 59.1 |
| CSS | 4.0 → 6.3 | 26.4 / 147.6 |
| stijl-JSON | 72.8 → 74.0 | 15.9 / 15.9 |
| glyphs | 97.6 → 98.7 | 76.6 / 76.6 |
| basemap-Ranges | 449.3 → 571.2 | 186.9 / 186.9 |
| manifest | 73.1 → 76.7 | 36.5 / 36.5 |
| header-Ranges (41) | 114.6 → 143.5 | 123.9 / — |
| eerste regen-Range (1) | 143.0 → 145.6 | 4.5 / — |
| eerste regendecode | 506.2 → 508.5 | — |
| eerste textuur | 518.4 → 518.7 | — |
| ttfrMs | 1038.5 | — |
| firstRainMs | 534.5 | — |
| basemapReadyMs | 1038.5 | — |
| ttfhMs | 707.5 | — |
| ttfpMs | 606.1 | — |
| firstContentfulPaint | 254.4 | — |
| largestContentfulPaint::Candidate | 254.4 | — |

| JS-bestand | parse CPU / compile CPU (ms) | parse/compile venster (ms) |
| --- | ---: | ---: |
| index-Bjpg2SSN.js | 23.4 / 1.2 | 5.3 → 31.6 |
| workbox-window.prod.es5-BBnX5xw4.js | 0.4 / 0.0 | 77.4 → 93.4 |
| zstd.worker-DyQKI1dV.js | 0.0 / 1.5 | 96.3 → 97.6 |
| wind-water-mask.worker-CF9kMZb7.js | 0.0 / 0.5 | 787.5 → 788.1 |

# step0-stock-cold-run2.json

Loadavg 5.88; desktop 1280×800, 8 cores/8 GB, CPU 1×, SwiftShader. Trace-overhead aanwezig. Decodetijd is workerduur teruggeteld vanaf het antwoord op de hoofddraad; exacte start in de worker ontbreekt. Textuurduur meet CPU-aanroep, geen GPU-fence.

| schakel | begin → eind (ms) | encoded kB / decoded kB |
| --- | ---: | ---: |
| HTML | 0.0 → 1.8 | 1.0 / 3.1 |
| JS-entry | 3.5 → 8.1 | 417.9 / 1431.8 |
| JS-modules | 77.6 → 79.0 | 20.2 / 42.8 |
| CSS | 3.6 → 5.7 | 26.4 / 147.6 |
| stijl-JSON | 75.4 → 76.9 | 15.9 / 15.9 |
| glyphs | 97.2 → 98.4 | 76.6 / 76.6 |
| basemap-Ranges | 191.0 → 251.0 | 186.9 / 186.9 |
| manifest | 75.6 → 76.9 | 36.5 / 36.5 |
| header-Ranges (41) | 111.9 → 143.2 | 123.9 / — |
| eerste regen-Range (1) | 142.4 → 144.3 | 4.5 / — |
| eerste regendecode | 237.4 → 240.4 | — |
| eerste textuur | 253.6 → 253.8 | — |
| ttfrMs | 531.4 | — |
| firstRainMs | 272 | — |
| basemapReadyMs | 531.4 | — |
| ttfhMs | 548.9 | — |
| ttfpMs | 340.8 | — |
| firstContentfulPaint | 100.6 | — |
| largestContentfulPaint::Candidate | 100.6 | — |

| JS-bestand | parse CPU / compile CPU (ms) | parse/compile venster (ms) |
| --- | ---: | ---: |
| index-Bjpg2SSN.js | 24.5 / 1.2 | 4.9 → 32.5 |
| workbox-window.prod.es5-BBnX5xw4.js | 0.4 / 0.0 | 79.0 → 93.0 |
| zstd.worker-DyQKI1dV.js | 0.0 / 1.6 | 96.1 → 97.1 |

# step0-stock-cold-run3.json

Loadavg 6.99; desktop 1280×800, 8 cores/8 GB, CPU 1×, SwiftShader. Trace-overhead aanwezig. Decodetijd is workerduur teruggeteld vanaf het antwoord op de hoofddraad; exacte start in de worker ontbreekt. Textuurduur meet CPU-aanroep, geen GPU-fence.

| schakel | begin → eind (ms) | encoded kB / decoded kB |
| --- | ---: | ---: |
| HTML | 0.0 → 1.7 | 1.0 / 3.1 |
| JS-entry | 3.6 → 8.2 | 417.9 / 1431.8 |
| JS-modules | 75.1 → 500.4 | 25.2 / 59.1 |
| CSS | 3.8 → 5.8 | 26.4 / 147.6 |
| stijl-JSON | 72.9 → 74.0 | 15.9 / 15.9 |
| glyphs | 94.4 → 95.7 | 76.6 / 76.6 |
| basemap-Ranges | 187.5 → 248.5 | 186.9 / 186.9 |
| manifest | 73.1 → 75.1 | 36.5 / 36.5 |
| header-Ranges (41) | 110.3 → 139.4 | 123.9 / — |
| eerste regen-Range (1) | 140.2 → 141.2 | 4.5 / — |
| eerste regendecode | 231.2 → 232.8 | — |
| eerste textuur | 246.1 → 246.2 | — |
| ttfrMs | 587.5 | — |
| firstRainMs | 272.8 | — |
| basemapReadyMs | 587.5 | — |
| ttfhMs | 534.6 | — |
| ttfpMs | 350.8 | — |
| firstContentfulPaint | 97.5 | — |
| largestContentfulPaint::Candidate | 97.5 | — |

| JS-bestand | parse CPU / compile CPU (ms) | parse/compile venster (ms) |
| --- | ---: | ---: |
| index-Bjpg2SSN.js | 22.4 / 1.2 | 5.0 → 30.3 |
| workbox-window.prod.es5-BBnX5xw4.js | 0.3 / 0.0 | 76.4 → 90.3 |
| zstd.worker-DyQKI1dV.js | 0.0 / 1.4 | 93.3 → 96.1 |
| wind-water-mask.worker-CF9kMZb7.js | 0.0 / 0.5 | 503.0 → 503.8 |


**Kritieke keten:** JS-evaluatie → manifest → regenheader → regen-Range → behandeling op de hoofddraad/kaartcontext → worker-decode → textuur → eerste draw → volgende draw (ttfp). Stijl en fonts lopen parallel. In de stock-run zijn regenbytes al op 141–146 ms binnen, maar decode wordt pas op 231–508 ms waargenomen; de kaartcontext en hoofddraad staan tussen de bytes en tekenen. Basemap-Ranges beginnen op 188–449 ms, basemap gereed op 531–1039 ms. Het kale kaartinterval tot die tegels is de placeholder-kandidaat; ttfp is niet LCP.

Repro: `cd web && bash scripts/desktop-rig.sh ../tmp/u64/step0-stock --repeat=3`; daarna `pnpm exec tsx scripts/start-waterfall.ts ../tmp/u64/step0-stock-cold-run*.json`. Ruwe netwerk- en CPU-traces blijven lokaal; deze tabel bevat alleen eigen-app-metingen.
