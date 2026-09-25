# Track U29 — experiment: compacte tijdas en lead-afhankelijke smoothing achter `?dev` (claude opus 5.5)

**Start pas na de merge van U25 en U28** (beide raken `isoline-layer` resp.
`HistogramScrubber`).

Read first: `AGENTS.md`, `.dev/proposals/0011-niet-lineaire-tijdas.md`
(het idee en de onzekerheden), `web/src/core/time-model.ts`
(`timelineEpochAtCursor`/`timelineCursorAtEpoch`, `timelineZones`, ticks),
`web/src/components/HistogramScrubber.tsx` (`time-horizon`-knoppen, x-as,
fijnscrub uit U9), `web/src/core/isolines.ts` (`temporalWeights`, `window`),
`web/src/core/dev-settings.ts`, U9- en U8b-LOGs. Your LOG: `.dev/tracks/
u29-compacte-tijdas/LOG.md` — committed, append-only, timestamped. Branch
`track/u29-compacte-tijdas` vanaf main. Eigen worktree. Preview:
http://ageq-mthq:4300/.

## Opdracht

1. **Tijdas-mapping als pure functie** (`core/time-axis.ts`): epoch ↔ as-
   fractie, piecewise-lineair met knik op +6 u en compressiefactor k
   (default 3), C¹-overgang van ±30 min. Unit-tests: monotoon, inverteerbaar,
   afgeleide continu.
2. **Schakelaar** `?dev` → "Tijdas: lineair / compact" (+ k-schuif 1,5–6).
   Compact: de bereikknoppen verdwijnen en de as toont −2 u … einde van de
   tijdlijn. Balken, ticks, nu-lijn, cursor, regimebalk en het fijnscrubben
   volgen de mapping; afspelen in kaarttijd. Default blijft lineair.
3. **Lead-afhankelijke smoothing**: `temporalWeights` krijgt een venster dat
   met de lead groeit (1 u tot +6 u, lineair naar 3 u op +24 u en 6 u op
   +48 u); dev-schuif voor de eindwaarde. Default uit. Meet de isolijn-
   snelheid (bestaande lijnsnelheidsmaat uit de fade-shader of tracer) bij
   scrubben op +12 u vóór/na en zet het getal in de LOG.
4. Stills en een korte opname (frame-reeks) van scrubben 0 → +48 u in beide
   assen; mobiele fijnscrub-check in het dichte deel.

## Niet doen

- Geen default-wijziging; geen verwijdering van de knoppen buiten de
  compacte modus. Adoptie is een PO-besluit (MIP-11).

## Gates

`pnpm typecheck`, `pnpm test`, `pnpm build`, `MOTREGEN_E2E_PORT=4374
MOTREGEN_E2E_DATA_PORT=8374 pnpm e2e` groen, synchrone exit statussen in de
LOG. Draft-PR vroeg. Geen codex.
