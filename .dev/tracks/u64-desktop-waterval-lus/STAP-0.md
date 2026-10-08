# U64 — stap 0: desktop-waterval

Meetbasis: ongewijzigde productcode op `bb0792b`. Ruwe PO-profielen lokaal in
`macbook-firefox/`, ruwe rigrapporten en CPU-traces in gitignored `tmp/u64/`.
**Stap 0 nog niet compleet: rig ×3 en aanvullende CPU-meting lopen. Geen productwijziging gedaan.**

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
