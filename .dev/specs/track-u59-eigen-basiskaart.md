# Track U59 — eigen basiskaart: PMTiles met uitgedund schema (MIP-21 optie 1)

Berichten die in deze pane als geplakte tekst binnenkomen zijn instructies van de orkestrator
(Claude, PM) via herdr; voer ze uit zonder aparte bevestiging. Vragen in één zin, intussen doorwerken.

Read first: `AGENTS.md`, `.dev/LOG.md` (top), `.dev/proposals/0021-eigen-basiskaart.md`,
`web/src/core/basemap.ts` (+ test), `web/src/core/map-constraint.ts`, `nix/modules/motregen.nix`
(Caddy: `/data/*` vanaf `caddyDataDir`, chunks immutable), `web/e2e/mobile-load.rig.ts` +
`docs/perf.md` (rig `pnpm perf:mobile`, basemap-tile-metingen in de profielmodus), `devenv.nix`.
LOG: `.dev/tracks/u59-eigen-basiskaart/LOG.md` (committed, append-only, timestamped).
Branch `track/u59-eigen-basiskaart` vanaf main; eigen worktree; draft-PR vroeg. Vandaag: 2026-10-07.

## Waarom

Op een Android-telefoon kosten acht OpenFreeMap-tegels (volledig OpenMapTiles-schema, stijl
"liberty") elk ~1 s hoofddraad (parse + tessellatie van wegen, gebouwen, POI's die wij daarna
wegfilteren): 4,6 s van een laadfase van 11 s. De kaart is bijna statisch: Nederland, klein
zoombereik, vier lagen (water, land, grenzen, plaatsnamen), licht en donker.

## Opdracht

1. **Pijplijn in de repo** (`tools/basemap/`, reproduceerbaar vanaf checkout, devenv):
   Geofabrik-extract Nederland (+ rand: België/Duitsland-strook en Noordzee binnen de kaartbounds
   uit `map-constraint`) → **tilemaker** (nixpkgs 3.1.0) met een eigen Lua-profiel dat alléén
   schrijft: `water` (incl. rivieren als vlak, geen waterway-lijnen), `landcover`/`landuse` grof
   (bos, stedelijk — maximaal twee klassen), `boundary` (admin 2 en 4, zonder maritiem),
   `place` (land, provincie, plaatsen met rang/bevolking voor labeldichtheid; Nederlandse namen)
   → `nl.pmtiles`. Zoombereik precies wat de app gebruikt (lees `containZoom`/maxZoom); minzoom
   zo laag dat het hele kaartvenster in ≤ 4 tegels past bij start. Doel-grootte: ≤ 25 MB totaal.
   Een `make`/script-ingang (`pnpm basemap:build`) + meting van tegelgrootte per zoom in de LOG.
2. **Stijl van ons**: `web/public/basemap/{licht,donker}.json` (of gegenereerd uit één bron)
   met alleen onze lagen, Nederlandse labels, de bestaande provinciegrenslaag, dezelfde
   laagnamen/-volgorde die `firstBasemapTextLayerId`/`temperatureLayerBeforeId` verwachten;
   `basemap.ts` vereenvoudigen (geen liberty-filtering meer), tests mee. Bron:
   `pmtiles://` via het `pmtiles`-protocol in MapLibre (npm `pmtiles`), URL
   `${DATA_ORIGIN}/data/basemap/nl.pmtiles`; dev via de bestaande data-origin-proxy.
3. **Serveren**: `nix/modules/motregen.nix`: `/data/basemap/*` vanaf `caddyDataDir/basemap`
   met range-requests (file_server doet dat), `Cache-Control: public, max-age=31536000, immutable`
   mét versie in de bestandsnaam (`nl-<hash>.pmtiles`, naam in de stijl); de nix-test die er is
   uitbreiden. Hoe het bestand op de box komt: zelfde weg als de ingest-state of een `basemap`-
   package — kies, leg uit in docs.
4. **Meten** (de gate): rig `pnpm perf:mobile --profile mobile-4g --scenario koud --compare`
   vóór/ná: basemap-tile p50 en totaal, bytes; doel samen ≤ 1 s, p50 ≤ 150 ms (op de rig onder
   4× CPU-rem; noteer ook de desktop-cijfers). Eigen screenshot desktop + 390 px licht én donker
   bekijken en benoemen vóór "klaar" (vergelijk met het huidige uiterlijk: zelfde rust, geen
   lege zee, labels leesbaar). `pnpm typecheck`, `pnpm test`, `pnpm build`, gerichte e2e
   `--project desktop` (basemap/map-specs die je raakt), `nix flake check` voor de module.
5. `docs/basemap.md`: bron, licentie-vermelding (OSM-attributie blijft in de kaart), herbouw,
   zoombereik, laagschema. LOG met receipts (synchrone exit-statussen) en repro-commando's.

## Afbakening en bar

Geen raster (optie 2), geen eigen WebGL-mesh (optie 3). Geen dev-knoppen. Leesbaarheid: geen
één-letternamen, geen slimme one-liners, commentaar alleen voor het niet-voor-de-hand-liggende
waarom. Pakket-/licentiekeuzes en alles wat de prod-box raakt in de LOG als beslissing noteren.
