# MIP-21 — Eigen basiskaart: de statische helft van de laadtijd

Status: draft · 2026-10-07 · auteur: orkestrator, op aanzet van de PO ("helft van de tijd kwijt
aan een basically statische kaart is om te huilen")

## Waarneming

PO-opnames op Android (Chrome, 4320, 2026-10-07 16:11): acht basiskaart-tegels van elk ~1,0 s
(p50 1030 ms, p95 1250 ms), samen 4,6 s op de hoofddraad in een laadfase van 11 s — meer dan de
regendecodes (die zitten in de worker) en meer dan alle UI-werk samen. Firefox: 8 × 0,58 s.
De basiskaart komt van OpenFreeMap (stijl "liberty", volledige OpenMapTiles-vectortegels); wij
strippen de wegen pas in de client (`basemap.ts`) en tonen alleen water, land, grenzen en
plaatsnamen. MapLibre parst en tesselleert desondanks elke volledige tegel (wegen, gebouwen,
POI's, huisnummers) — op een trage telefoon is dat de dure stap, niet het netwerk.

De kaart is voor ons bijna statisch: Nederland, een klein zoombereik (`map-constraint.ts`:
contain-zoom tot een vaste maxZoom), vier lagen, licht en donker.

## Opties

1. **Eigen PMTiles met uitgedund schema.** Eén `nl.pmtiles` (planetiler of tilemaker met een
   laagfilter: water, landuse/landcover grof, bestuurlijke grenzen, place-labels; geen wegen,
   gebouwen, POI's) op motregen.nl achter Caddy (range-requests, immutable cache). Verwacht
   5–10× minder bytes en parse per tegel; stijl blijft MapLibre-vector, dus licht/donker en
   focus-verzadiging blijven werken. Werk: een dag ingest-tooling (herhaalbaar in de repo),
   stijl-JSON van ons, meting met de rig. Dit is de bestaande E8.
2. **Vooraf gerenderde rastertegels** (WebP 512 px, eigen stijl, licht én donker). Parse ≈ 0,
   alleen GPU-upload; wel 2 tegelsets, geen dynamische verzadiging (kan via CSS-filter op de
   laag), labels bakken mee (schaalvast, niet herplaatsbaar). Goedkoop om te proberen met
   dezelfde PMTiles-pijplijn.
3. **Eén statische NL-geometrie in onze eigen WebGL.** Het hele zoombereik past in één
   pre-getesselleerde mesh (land/water/grenzen) van enkele honderden kB, als één asset met de
   app geladen; labels als aparte kleine laag. Geen tegels, geen MapLibre-stijlparse voor de
   basis. Grootste winst, grootste werk (MapLibre blijft nodig voor projectie/interactie of
   wordt vervangen).

## Voorstel

Optie 1 eerst: het is meetbaar met de bestaande rig (basemap-tile p50 en bytes zijn al in de
profielmodus), hergebruikt alles wat er staat, en levert de pijplijn die optie 2 en 3 ook nodig
hebben. Doel: basemap-tegels samen ≤ 1 s op mobile-4g, p50 per tegel ≤ 150 ms. Haalt optie 1 dat
niet, dan optie 2 uit dezelfde bron; optie 3 pas als laadchoreografie (MIP-19) laat zien dat de
basis als eerste beeld nog steeds te laat komt.

## Decision

(open)
