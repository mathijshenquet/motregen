# MIP-26 — Bot-loops zonder browser: basiskaart één keer, lagen als eigen compositor

Status: draft · 2026-10-09 · auteur: orkestrator · aanleiding: PO ("kunnen wij dat renderen 10–100× sneller
maken? 1× de kaart renderen en de lagen die we toch al los renderen er in een los proces bovenop, dan
hannes je niet meer met Playwright")

## Hoe het nu gaat
De renderer (U67, op ageq-dev2) laadt per generatie de echte app in Playwright-Chromium en maakt per loop
169 screenshots (één per 5 minuten), ffmpeg maakt er mp4 van: ≈ 50 s per loop, 173 media in ≈ 55 s render +
≈ 120 s prime, op 13 kernen. Op de VM (2 kernen) was dat 705 s per loop (MIP-25). Alles wat de browser doet
per frame — stijl, tegels, WebGL, layout — is voor het filmpje verspilling: de kaart verandert niet, alleen
de weerlaag.

## Voorstel
1. **Basiskaart één keer.** Per (zoom/uitsnede, thema dag/nacht, grootte) één keer de basiskaart + labels als
   PNG renderen (MapLibre in Playwright, of `maplibre-gl-native`/`maplibre-native` headless); cachen op
   stijl-hash. Dat is de enige plek waar nog een browser of GL-context nodig is, en die draait zelden.
2. **Weerlagen native.** De regenlaag is een palettafbeelding van een gedecodeerd raster (`web/src/core/mrf.ts`,
   `rain`-palet, `frameBlend`): dat is per frame enkele milliseconden in Node (of Rust in `ingest/`), geen
   WebGL nodig. Temperatuur: `isoline-field`/`isoline-contours`/`isoline-labels` zijn al pure TypeScript
   (workers), dus herbruikbaar; de vulling is dezelfde palettafbeelding. Wind: de deeltjessimulatie is een
   eigen shader; voor het filmpje kan een deterministische CPU-variant (zelfde zaad, zelfde stap) of een
   streamlijn-render; dit is de enige laag met echt rekenwerk.
3. **Compositor + encoder.** Per frame: basiskaart-PNG → weerlaag (RGBA, zelfde blending als in de app:
   multiply/alfa per modus, MIP-24) → klokpil/labels als vaste overlay → rauw RGB naar ffmpeg (stdin, één
   proces per loop). Stills zijn hetzelfde pad met één frame.
4. **Pariteit.** Dezelfde paletten en blending als de app (`core/*` wordt gedeeld code, geen kopie); een
   pariteitstest vergelijkt per modus één native frame met een app-screenshot (ΔE-drempel), zodat het
   filmpje niet van de site gaat afwijken.

## Verwachte winst (te meten in de track)
| | nu (ageq-dev2) | verwacht native |
| --- | ---: | ---: |
| regenloop 169 frames | ≈ 50 s | < 1 s (raster→palet→ffmpeg) |
| temperatuurloop | ≈ 50 s | 2–5 s (contouren per frame) |
| windloop | ≈ 50 s | 5–15 s (CPU-deeltjes) of blijft tijdelijk via Playwright |
| generatie (173 media) | ≈ 55 s render | < 20 s |
| VM (2 kernen) | 40 min/generatie | < 2 min → renderen op de VM wordt weer haalbaar (MIP-25 optimalisatiepas) |

## Volgorde
U71a: regen native (grootste winst, kleinste risico; pariteitstest; renderer kiest per modus native of
Playwright). U71b: temperatuur (isolijnen hergebruiken). U71c: wind. Daarna de renderer-rol terug naar de VM
en ageq-dev2 vrij. Prime (uploads naar Telegram, ≈ 120 s) blijft de ondergrens tot we slideshow/file_id-hergebruik
slimmer doen (MIP-22).

## Decision
(open — PO)
