# Track U65 — volledige plaatsenlijst en pad-URL die je pin respecteert (gpt-6.1-sol)

Berichten die hier als geplakte tekst binnenkomen zijn instructies van de orkestrator (Claude, PM) via
herdr; voer ze uit zonder aparte bevestiging. Commit + push elke 15–20 min; beëindig geen turn terwijl
shells lopen. Start codex met `--no-daemon` (gebeurt door de orkestrator).

Read first: `AGENTS.md`, `.dev/LOG.md` (top), `web/src/core/places.ts` (69 handmatige plaatsen sinds U27,
`nearestPlace`), `web/src/core/presets.ts` (slug ↔ naam, `shareUrl`, U57), `web/src/App.tsx`
(`resolveStartLocation`, `selectPresetPlace`, `initialPresets`, `pick`), `.dev/specs/track-u57-pad-uris.md`,
`tools/basemap/` (tilemaker-profiel met `place`-laag: klasse, rang, bevolking), `web/e2e/location.spec.ts`,
`presets.spec.ts`, `seo.spec.ts`. LOG: `.dev/tracks/u65-plaatsen-en-pin/LOG.md`. Branch
`track/u65-plaatsen-en-pin` vanaf main; eigen worktree; e2e naar tmp/; poorten `MOTREGEN_E2E_PORT=4397
MOTREGEN_E2E_DATA_PORT=8397`; preview 4345. Vandaag: 2026-10-08.

## PO-feedback (laptop, 2026-10-08)
1. "De URL respecteert mijn drop-pin niet: `/weer/amsterdam` springt naar het centrum terwijl mijn huis in
   Amsterdam ligt. Als je laatste drop-locatie in dezelfde zone staat als de URL-plaats, behoud die dan."
2. "Er worden maar een paar steden gedetecteerd (Amsterdam, Haarlem, Leiden, Utrecht, Hilversum, Gouda),
   maar Amstelveen, Hoofddorp, Woerden niet." — dat is de handmatige lijst van 69 plaatsen uit U27, nooit
   een optimalisatie geweest.

## Opdracht
1. **Volledige plaatsenlijst**: genereer uit de basiskaart-pijplijn (OSM `place` = city/town/village, met
   bevolking/rang; NL + de Vlaamse/Duitse rand binnen de kaartbounds) een compacte lijst (naam, slug,
   lng, lat, rang, bevolking) als lazy geladen JSON (`/plaatsen-<hash>.json`, gzip ≤ ~60 kB) of, als dat
   klein genoeg is, als TS-module; `nearestPlace` zoekt daarin (spatial grid/kd-tree, geen O(n) over
   duizenden per frame). De 69 van U27 blijven de fallback tot de lijst binnen is én de bron voor de
   temperatuurlabels (niet wijzigen). Slug-uniciteit: dubbele namen krijgen de gemeente erbij
   (`/weer/woerden`, `/weer/hoogezand-sappemeer`), kies een eenduidige regel en documenteer hem.
2. **Pin respecteren**: bij laden van `/<modus>/<plaats>`: als de onthouden laatste locatie (of een
   opgeslagen plaats) volgens de volledige lijst bij diezelfde plaats hoort (nearest == slug, of binnen
   een straal die van de plaatsgrootte afhangt: stad 8 km, dorp 3 km — leg de regel vast), dan die
   locatie houden i.p.v. naar het plaatscentrum te springen; anders het centrum. De URL blijft de
   plaatsnaam (privacy); `shareUrl` idem. Unit-tests voor de zone-regel; e2e: pin in Amsterdam-Noord,
   herladen van `/weer/amsterdam` houdt de pin; `/weer/haarlem` springt wel.
3. Gate: typecheck, unit, build, `location.spec`/`presets.spec`/`seo.spec` desktop; sitemap blijft de
   top-N (niet alle dorpen). Draft-PR vroeg. Leesbaarheid: geen één-letternamen, geen slimme one-liners.
