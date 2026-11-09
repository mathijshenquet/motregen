# U109 — algemene optimalisatiepass (2026-11-09)

Basis: int `a87a1fd` (= `origin/int/eval-2026-10-17`). Data: productie via `MOTREGEN_DATA_ORIGIN=https://motregen.nl/data`.
De host was de hele middag gedeeld (loadavg 18–28 door Chromium-rigs van andere tracks). **Bytes en aantallen zijn
betrouwbaar; tijden zijn indicatief** en staan steeds met hun loadavg. Headless Chromium tekent met SwiftShader
(CPU), dus GPU-kosten (shadercompilatie, compositing) zijn daar opgeblazen ten opzichte van een telefoon.

## Meetgereedschap

| commando | wat |
| --- | --- |
| `scripts/u109-ab.sh <dist-A> <dist-B> <uit> [n] [profielen] [modi]` | gepaarde A/B van twee vaste builds met de U102-suite (`perf:modes`), om en om, koud+warm met trace |
| `pnpm exec tsx scripts/u109-report.ts <uit>` | tabel per profiel/variant: ttfp, eerste kaart, histogram, bytes per soort, LoAF, V8-compile per draad |
| `pnpm exec tsx scripts/u109-phase-costs.ts <rapport.json> <dist>` | CPU-zelftijd per fase (laden/scrubben/afspelen/wisselen/rust) en per bronbestand, ms per seconde |
| `pnpm exec tsx scripts/u109-sw-install.ts <origin>…` | wat de serviceworker bij een eerste bezoek ophaalt (de rigs zien SW-verkeer niet) |
| `perf.layers` in `window.__motregenPerf.snapshot()` | per kaartlaag de eerste tekenbeurt sinds timeOrigin en sinds de laatste moduskeuze |

Rig-uitbreidingen (U102-suite, additief): `milestones.ttfpMs`, `layers`, `modeSwitches` (per wissel wachten tot de
lagen van de doelmodus getekend zijn, minstens 2 s, hooguit 12 s), `phaseWindows`, een rustfase van 6 s
(gepauzeerd), `MOTREGEN_PERF_MODES_TRACE_COLD=1`, `MOTREGEN_PERF_MODES_TRACE_ALL=1` en
`MOTREGEN_PERF_MODES_CPU_PROFILE=1`.

## Inventaris (bytes, deterministisch)

| onderdeel | int (A) | U109 | toelichting |
| --- | ---: | ---: | --- |
| hoofdbundel JS (raw / gzip) | 1.464 kB / 432 kB in één bestand | `index` 401 kB / 145 kB + `maplibre` 1.053 kB / 283 kB | MapLibre (72 % van de bundel) is een eigen chunk; zijn hash blijft gelijk bij appwijzigingen (gecontroleerd), dus na een uitrol blijven 283 kB gz plus V8-codecache staan |
| render-blokkerende CSS (raw / gzip) | 164 kB / 29,5 kB | 97 kB / 20,3 kB | MapLibre-CSS van controls/popups (51 kB SVG-data-URI's) eruit; kaart-, container- en markerregels blijven |
| SW-installatie eerste bezoek (lokaal, gzip) | 41 requests / 648 kB | 39 / 62 kB | `og-image.png` (491 kB) niet meer in de precache; glyphs (204 kB ongecomprimeerd) via runtime-CacheFirst. Start ~180 ms na navigatie, dus midden in het laden van de radar |
| precache totaal | 2.532 KiB | 1.778 KiB | |

## Voorstel prod-config (niet uitgerold): voorgecomprimeerde assets

Productie zit achter Cloudflare. Die levert JS/CSS als **zstd niveau 3** (gemeten: prod-bundel 435.115 B; lokaal
`zstd -3` 435.197 B), groter dan gzip. De glyph-pbf komt **ongecomprimeerd** en zonder `Cache-Control`.

| bestand (U109-build) | raw | CF zstd-3 (nu) | brotli-11 vooraf | gzip-9 |
| --- | ---: | ---: | ---: | ---: |
| `maplibre-*.js` | 1.053.055 | 291.305 | 232.494 | 282.268 |
| `index-*.js` | 401.367 | 148.220 | 124.548 | 145.115 |
| `index-*.css` | 97.142 | 22.167 | 17.479 | 20.200 |
| `startup-*.js` | 50.419 | 18.942 | 16.417 | 18.069 |
| glyphs `0-255.pbf` | 76.580 | 76.580 (ongecomprimeerd) | 31.817 | 41.804 |
| glyphs `256-511.pbf` | 127.219 | 127.219 (ongecomprimeerd) | 38.019 | 52.570 |

Kritiek pad koud (JS+CSS+glyphs 0-255): **≈ 557 kB → ≈ 423 kB (−134 kB, −24 %)**, op 4G (9 Mbit/s) ≈ 120 ms.

Voorstel, in twee stappen:
1. Build: `.br` en `.gz` naast `assets/*.{js,css}`, `index.html`, `sw.js` en `basemap/fonts/**/*.pbf`
   (brotli-11, ~3 s extra buildtijd); `routes.caddy` (`web/scripts/page-routes.ts`) `precompressed gzip` →
   `precompressed br gzip`; `Cache-Control: public, max-age=86400` op `/basemap/fonts/*`.
2. Cloudflare: controleren dat een origin-`Content-Encoding: br` doorgegeven wordt in plaats van opnieuw als zstd-3
   gecodeerd (Compression Rules: voor `/assets/*` en `/basemap/*` "origin-compressie behouden"/Brotli). Verifiëren
   na uitrol met `curl -H 'Accept-Encoding: zstd, br, gzip' -D - -o /dev/null https://motregen.nl/assets/<index>.js`
   (verwacht `content-encoding: br`, body ≈ 124,5 kB).

## Tekencode-audit (PO-aanvulling 2026-11-09)

Per laag: hoe hij tekent, wat er per frame en in rust gebeurt, en wat er veranderd is. "Doorgevoerd" = onzichtbaar
(zelfde pixels), met de geraakte e2e-specs groen (windzak, focus, wind-zoom, rain-playback, cloud-section,
telegram: 23 groen, 3 bestaande skips) en `basemap-cache`.

| laag | tekent via | per frame | in rust | bevinding | status |
| --- | --- | --- | --- | --- | --- |
| alle overlays | eigen WebGL2-canvas per laag (`LayerOverlay`), volle schermresolutie × DPR | — | — | isolijnsets (temperatuur, wolken, Bft) blijven na een wissel als **lege schermvullende canvassen** in de compositor | doorgevoerd: `visibility: hidden` zolang de laag niets tekent (`contentDrawn`) |
| regen | `RainLayer` in overlay | ~20× `getUniformLocation`/`getAttribLocation` (nieuw object per aanroep) + 3 arrays voor contour-uniforms | geen tekenbeurten als niets verandert | allocaties per frame | doorgevoerd: locaties per programma gecachet (`gl-locations.ts`), contour-uniforms per `setOutlines` |
| temperatuur-/wolken-/Bft-vlakken | `IsolineLayer` (GPU-sneden + composiet) | ~10 uniform-lookups in composiet en passes | e2e bevestigt: geen contour- of workerwerk in rust | idem | doorgevoerd: locatiecache |
| deeltjes (wind) | `WindLayer`, CPU-advectie in typed arrays, GPU-trails | advectie van alle deeltjes op de hoofddraad, allocatievrij | **loopt in elke modus door** (achtergrondwind, 30 fps bij idle) | ontwerpkeuze, zichtbaar | voorstel (zie onder) |
| windzakken | 2D-canvas, Path2D per zak, flutter 30 fps | per zak 1 omtrek + banden als **SVG-padstring** opgebouwd en geparsed; `clientWidth/Height` per frame (kan layout afdwingen) | flutter blijft 30 fps hertekenen in Wind | bench (25 zakken × 5 paden, host onder load): opbouw 1,10 → 0,18 ms/frame | doorgevoerd: paden direct (`moveTo/lineTo`), containermaat gecachet op `resize`, geen cameracheck als onzichtbaar |
| temperatuurgetallen | MapLibre-`Marker`s (DOM) | alleen bij een nieuwe snede | geen | — | — |
| basiskaart | MapLibre | — | — | koude start desktop (SwiftShader): 737 ms shadercompilatie, waarvan 572 ms symboollaag | SwiftShader-artefact; op een echte GPU veel kleiner, niet aangepakt |

## Bevinding buiten scope: tabeldata op de telefoon pas na ~60 s

Telefoon 4G koud, Weer, int `a87a1fd` (A, loadavg 17): eerste kaart 2,7 s, histogram 9,7 s, **tabel compleet 68,8 s**;
de U109-build geeft hetzelfde beeld (74,9 s, loadavg 15). De HARMONIE-chunks voor temperatuur, wind, windstoten en
gevoel worden pas rond 60 s aangevraagd; tot de laadfase stil is gaat er 9,4 MB over de lijn. De U102-nulmeting van
vanochtend (eigen basis) gaf 5,8–11 s. Puntreeksen en tabeldata zijn U102-terrein; deze track verandert daar niets
aan. Repro: `MOTREGEN_PERF_MODES_OPTIONS='{"origin":"<int-preview>","modes":["weer"],"profiles":["telefoon"],"repeat":1,"outputDirectory":"…","interactions":false,"trace":false}' scripts/e2e-slot.sh pnpm exec playwright test --config playwright.perf-modes.config.ts --project perf`.

## Tijd tot eerste tekening per laag (PO-aanvulling), nulmeting op de U109-build

Bron: `tmp/u109/q1/matrix` (`scripts/u109-queue.sh`, stap 1), U109-build `dist-D` (= int + de bovenstaande
wijzigingen, die geen laadvolgorde veranderen). Eén run per cel; de loadavg staat per rij. **Telefoonrijen hebben
load 14–45 gehad: tijden indicatief.** "·" = laag hoort niet bij die modus, "—" = niet getekend in de laadfase
(zon: na zonsondergang; deeltjes: de achtergrondwind start bewust pas bij idle). De temperatuurgetallen in Gevoel
stonden in deze run nog niet gemeten (haak in `IsolineLabels` daarna toegevoegd, 59bc268). Legenda's zijn op de
telefoon in deze rig niet zichtbaar (smalle viewport).

| profiel | modus | load | basiskaart | regen | wolken | zon | temperatuurvlakken | temperatuurgetallen | bft-vlakken | windzakken | deeltjes | legenda | histogram | tabel |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| desktop koud | gevoel | 38.14 | 1,37 s | — | · | · | 2,91 s | — | · | · | · | 0,67 s | 2,60 s | 3,77 s |
| desktop koud | lucht | 31.89 | 1,36 s | — | 4,50 s | — | · | · | · | · | · | — | — | 4,99 s |
| desktop koud | weer | 31.27 | 1,04 s | 2,02 s | · | · | · | · | · | · | 8,48 s | 0,47 s | 3,43 s | 5,30 s |
| desktop koud | wind | 31.1 | 1,10 s | · | · | · | · | · | 2,75 s | 2,59 s | — | 0,53 s | 2,33 s | 3,66 s |
| desktop warm | gevoel | 41.69 | 0,67 s | — | · | · | 1,90 s | — | · | · | · | 0,26 s | 2,50 s | 3,03 s |
| desktop warm | lucht | 38.66 | 1,30 s | — | 4,75 s | — | · | · | · | · | · | — | — | 4,97 s |
| desktop warm | weer | 30.74 | 0,73 s | 0,56 s | · | · | · | · | · | · | 6,11 s | 0,25 s | 2,00 s | 3,83 s |
| desktop warm | wind | 34.33 | 0,83 s | · | · | · | · | · | 2,51 s | 2,38 s | 7,00 s | 0,29 s | 3,49 s | 3,98 s |
| telefoon 4G koud | gevoel | 16.2 | 4,23 s | — | · | · | 7,36 s | — | · | · | · | — | 8,71 s | 70,79 s |
| telefoon 4G koud | lucht | 13.83 | 4,34 s | — | 9,38 s | — | · | · | · | · | · | — | — | 62,37 s |
| telefoon 4G koud | weer | 15.3 | 8,08 s | 3,49 s | · | · | · | · | · | · | 16,86 s | — | 15,99 s | 74,86 s |
| telefoon 4G koud | wind | 44.72 | 3,15 s | · | · | · | · | · | 9,81 s | 8,77 s | 12,98 s | — | 11,72 s | 31,78 s |
| telefoon 4G warm | gevoel | 25.33 | 3,89 s | — | · | · | 12,60 s | — | · | · | · | — | 22,66 s | 84,60 s |
| telefoon 4G warm | lucht | 19.87 | 3,27 s | — | 10,48 s | — | · | · | · | · | · | — | — | 63,74 s |
| telefoon 4G warm | weer | 20.36 | 4,10 s | 2,68 s | · | · | · | · | · | · | 10,28 s | — | 9,63 s | 68,18 s |
| telefoon 4G warm | wind | 35.17 | 4,79 s | · | · | · | · | · | 7,99 s | 7,34 s | — | — | 7,89 s | 7,25 s |


**Na een moduswissel** (ms vanaf de klik tot de eerste tekening van elke laag van de doelmodus; per profiel alle
wissels uit de vier startmodi, min–max):

| profiel | → Lucht: wolken | → Gevoel: temperatuurvlakken | → Wind: Bft-vlakken | → Wind: windzakken | → Wind: deeltjes | → Weer: regen staat al |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| desktop koud | 764–1.018 ms | 151–573 ms | 373–1.566 ms | 32–60 ms | 8–376 ms | ja |
| desktop warm | 239–1.041 ms | 404–470 ms | 173–1.526 ms | 30–218 ms | 4–551 ms | ja |
| telefoon 4G koud | 760–3.089 ms | 99–1.585 ms | 269–1.025 ms | 35–125 ms | 5–501 ms | ja |
| telefoon 4G warm | 432–1.852 ms | 281–1.445 ms | 270–809 ms | 25–140 ms | 15–420 ms | ja |

Volledige tabel per wissel: `tmp/u109/q1/layers.md` (te regenereren met `pnpm exec tsx scripts/u109-report.ts --layers <map>`).

Lezing:
1. Lucht is de traagste modus: wolken pas na 4,5–4,8 s op desktop en 9–10 s op de telefoon bij een koude start, en
   0,4–3,1 s na een wissel. Het Lucht-histogram werd in geen enkele run binnen de tijd compleet (U102-terrein).
2. Een wissel naar Wind zet windzakken binnen 25–220 ms neer; de Bft-vlakken volgen pas na 0,2–1,6 s (velden laden
   en een GPU-snede). Naar Gevoel: vlakken na 0,1–1,6 s.
3. Basiskaart op de telefoon 3,2–8,1 s, regen 2,7–3,5 s: de regen staat er dus vaak vóór de basiskaart.
