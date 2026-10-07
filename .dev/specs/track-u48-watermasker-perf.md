# Track U48 — windlaag-watermasker van de hoofddraad af (gpt-6.1-sol)

Read first: `AGENTS.md`, `.dev/proposals/0016-profielmodus.md`, `docs/perf.md` (§Profielmodus),
`web/src/core/wind-layer.ts` (`buildWaterMask`, `scheduleWaterMask`, `waterFactor`,
`WATER_REBUILD_MS`, de `move`/`sourcedata`/`resize`-listeners), `web/src/core/perf.ts`,
`web/scripts/record-profile.ts` (+ `prof:capture`, `prof:check`, `prof:import`), U24-LOG
(waarom het masker bestaat: zee-penalty op de windparticles, `SEA_PENALTY`). LOG:
`.dev/tracks/u48-watermasker-perf/LOG.md` (committed, append-only, timestamped). Branch
`track/u48-watermasker-perf` vanaf main. Eigen worktree. Vandaag: 2026-10-07.

## De meting (PO-opname 2026-10-07, Chrome, 25 s, koude start + pannen/zoomen)

`~/motregen-profiles/2026-10-07T09:05:14.294Z-macintel.json`: van 2558 hoofddraad-samples
zitten er **1371 (54 %) in `buildWaterMask`** → `feature.geometry` → `loadGeometry` →
`readSVarint`. Oorzaak: het masker wordt bij elke `move` (debounce 200 ms) én bij elke
`sourcedata` opnieuw gebouwd, en `querySourceFeatures` decodeert daarbij telkens álle
waterpolygonen van alle geladen tegels opnieuw (de `geometry`-getter decodeert lui, per
aanroep). Tijdens continu zoomen/pannen en tijdens het laden van tegels is dat 5× per seconde
een volledige decode. Lange frames tot 487 ms aan het begin horen hier ook bij.

## Doel (meetbaar)

Aandeel `buildWaterMask`-samples in een gelijkwaardige opname (koude start, 10 s pannen en
zoomen, 10 s rust) **< 3 %**, zonder zichtbaar verschil in het windbeeld (zee-penalty blijft).
Meet vóór en ná met `pnpm prof:capture` (desktop Chromium) + een klein script dat het
aandeel per functie uit de trace telt (voeg dat toe als `web/scripts/prof-top.ts`: top-N
self-time per functie uit `ProfileChunk`; nuttig voor elke volgende track).

## Aanpak (kies op meting; zet de afweging in de LOG)

1. **Decodeer één keer per tegel**: cache de gedecodeerde ringen (al geprojecteerd naar
   gridfracties) per bron-tegel; `querySourceFeatures` alleen om te weten wélke tegels er
   zijn, nieuwe tegels decoderen, oude uit de cache gooien. Als MapLibre geen stabiele
   tegel-sleutel per feature geeft, decodeer dan zelf uit `map.getSource().loaded tiles`
   of via `queryRenderedFeatures` met een cache op feature-id + bron-tegel; documenteer wat
   stabiel bleek.
2. **Herbouw alleen als het nodig is**: niet bij elke `move`, maar als de viewport buiten de
   marge (`OVERDRAW_PX`) van het laatste masker komt of de zoom meer dan ~0,25 verschuift,
   en bij `sourcedata` alleen als er een nieuwe tegel van de waterbron is (`sourceDataType
   === 'content'`, `tile` aanwezig). Debounce omhoog mag, maar niet als enige maatregel.
3. **Van de hoofddraad af** als 1+2 niet onder de 3 % komen: het masker in een worker
   tekenen (OffscreenCanvas) of rasteren vanuit de al gedecodeerde ringen in een
   `requestIdleCallback`-plak.
4. Niet doen: het masker weglaten of de penalty uitzetten.

## Gates

`pnpm typecheck`, `pnpm test` (wind-layer-tests + een test op de herbouw-beslissing),
`pnpm build`, gerichte e2e `wind*.spec`/`focus.spec` `--project desktop` onder een slot, en de
vóór/ná-meting met synchrone receipts in de LOG. Draft-PR vroeg. Leesbaarheidsbar: geen
één-letternamen, geen slimme one-liners, commentaar alleen voor een niet-triviaal waarom.
