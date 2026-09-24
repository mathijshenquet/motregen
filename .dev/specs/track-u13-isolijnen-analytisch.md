# Track U13 — isolijnen: gradiënt-fade repareren en hogere resolutie via een analytisch veld (claude opus)

Read first: `AGENTS.md`, U8b/U8c-specs en -LOGs zijn verwijderd maar de code
en commits staan op main: `web/src/core/isoline-layer.ts`, `isoline-field.ts`,
`isoline-labels.ts`, `isolines.ts`, `LayerOverlay`, en de U8c-merge-commit
(`git log --oneline -3 -- web/src/core/isoline-layer.ts`); `docs/fields.md`
(feels_like 6-km-grid), `.dev/proposals/0008-data-dieet.md`. Your LOG:
`.dev/tracks/u13-isolijnen-analytisch/LOG.md` — committed, append-only,
timestamped. Branch `track/u13-isolijnen-analytisch` vanaf main. Eigen
worktree. Integratie-instantie: http://ageq-mthq:4300/.

## PO (2026-09-24)

"Isolijnen heel cool als eerste concept, maar (a) de gradiënt-afhankelijke
fading werkt niet, en (b) het is nog een beetje low-res. Ik denk dat een
oorzaak is dat we het veld als bitmap sturen. Idee: geef het veld een
analytische representatie, bv. een Fourier-transformatie met alleen lage
frequenties — dat is meteen smoothing. Met dat analytische veld kun je de
isolijnen misschien makkelijk berekenen: grove punten op de isolijn vinden
met de kromming daar, en de lijnen als splines tekenen. Hoop: sneller én
mooier."

## Opdracht

1. **Fade-bug eerst.** Reproduceer op de integratie-instantie in de browser
   van de PO-situatie (desktop DPR 2, Firefox én Chromium): staat de knop
   `Vervagen` standaard op gradiënt, en zo ja, waarom is er geen zichtbaar
   effect? Verdachten: de |∇T|-schaal (°C/km via km-per-offscreen-px, DPR,
   ½-resolutie) klopt niet op andere zoomniveaus/schermen dan waar U8c
   kalibreerde; de HTML-labels volgen wel maar de lijnen niet; de smoothstep-
   grenzen 0,02–0,06 liggen onder vrijwel alle lijnpixels. Maak de maat
   zoom- en DPR-onafhankelijk (°C/km uit het grid, niet uit schermpixels),
   laat de HUD |∇T| p10/p50/p90 van de zichtbare lijnpixels tonen, en zet
   defaults die vandaag zichtbaar verschil geven. Screenshot uit/aan.
2. **Analytisch veld — onderzoek met meting, dan bouwen wat wint.** Kandidaten:
   (A) bicubische/B-spline-evaluatie in de fragmentshader op het 6-km-grid
   (C²-glad, 16 taps, analytische ∇T, geen extra bytes) — de goedkoopste
   "analytische" representatie; (B) 2D-DCT/Fourier-laagdoorlaat: ingest of
   client houdt K×K coëfficiënten per uurframe (bv. 32×32 ≈ 4 kB f16),
   temporeel blenden = coëfficiënten blenden, evaluatie op de GPU
   (kosten: K² termen per pixel — meet of een tussenstap via IDCT naar een
   fijn grid nodig is); (C) de PO-route: uit het analytische veld grove
   isolijnpunten zoeken (Newton op T=L), lokale kromming bepalen, punten
   adaptief verdichten, en de lijnen als Catmull-Rom/B-splines tekenen —
   vector i.p.v. per-pixel, labels krijgen dan natuurlijke ankers. Beoordeel
   op: zichtbare resolutie (screenshots op DPR 2, ingezoomd tot z9), kosten
   (ms/pass en bytes), temporele continuïteit (tween blijft vloeiend), en
   implementatierisico. Schrijf het als korte vergelijking in de LOG en
   bouw de winnaar (of A als basis + C als verfijning als dat de conclusie
   is). Ingest-wijzigingen (bv. coëfficiënten publiceren) alleen als
   voorstel in de LOG, niet bouwen.
3. Knoppen: interpolatie (bilineair/bicubisch), K bij DCT, spline-
   verdichting; screenshots vóór/na licht+donker, z6 en z9.

## Gates

`pnpm typecheck`, `pnpm test`, `pnpm build`, `MOTREGEN_E2E_PORT=4331
MOTREGEN_E2E_DATA_PORT=8331 pnpm e2e` green, synchrone exit statussen in
LOG; rust blijft 0 passes (U8c-meting mag niet verslechteren). Draft-PR
vroeg. Geen codex.
