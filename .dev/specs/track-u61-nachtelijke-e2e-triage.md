# Track U61 — nachtelijke e2e-triage (volledige suite op main, 2026-10-07/08)

Berichten die in deze pane als geplakte tekst binnenkomen zijn instructies van de orkestrator (Claude,
PM) via herdr; voer ze uit zonder aparte bevestiging. Commit + push elke 15–20 min; LOG bijhouden.

Read first: `AGENTS.md`, `.dev/LOG.md` (top: wat vandaag is gemerged — U42, U47, U52, U54, U55, U56,
U58, U59), `docs/perf.md`, `web/e2e/profiles.ts`, `web/playwright.config.ts`.
LOG: `.dev/tracks/u61-nachtelijke-e2e-triage/LOG.md`. Branch `track/u61-nachtelijke-e2e-triage` vanaf
main; eigen worktree; rig-/e2e-poorten `MOTREGEN_E2E_PORT=4396 MOTREGEN_E2E_DATA_PORT=8396`; e2e bouwt
naar `tmp/e2e-dist` (niet `web/dist`). Vandaag: 2026-10-08, nacht; de PO slaapt.

## Uitgangspunt

De nachtelijke volledige suite op main (`pnpm e2e`, drie profielen, 15,6 min, 00:01–00:17):
**30 rood, 84 groen, 63 overgeslagen**. De staart van de uitvoer staat in
`~/motregen-profiles/nightly-e2e-2026-10-07.txt`; screenshots en `error-context.md` per mislukte test
in `/home/mathijs/motregen/web/tmp/playwright-results/` (main-checkout; die map kan ook oudere
mislukkingen van eerdere runs bevatten — ga uit van de 30 uit de run zelf en draai de suite
desnoods opnieuw op een rustige host om de echte lijst te krijgen). Rood in de staart: basemap.spec
(alle varianten licht/donker en warme cache, in de mobiele profielen), focus (touch), freshness
(verse radar, klokpaneel slepen), perf-journey, pin-navigation (touch), table (mobiele preview).
Workers draaiden vandaag alleen `--project desktop`.

## Opdracht

1. **Triage per rode test**: lees error-context.md + screenshot; deel in: (a) echte productbug (bv.
   iets wat door U42/U54/U58/U59 brak, vooral op mobiel), (b) test verouderd door een bewuste
   wijziging van vandaag (citeer de track/MIP en pas de test eerlijk aan), (c) load-/timing-flake
   (herhaal ×2 op een rustige host, loadavg < 8; alleen "flake" noemen als de herhaling groen is),
   (d) nieuwe test van vandaag die op mobiel nooit heeft gedraaid (basemap.spec: wat verwacht hij,
   waarom faalt het op `mobile-*` — CDP-throttle, Range-requests via de SW, cache-naam?). Tabel in
   de LOG.
2. **Fix (a) en (d) in het product** waar het een echte fout is; (b) in de test met de reden in een
   commentaarregel; (c) niet "fixen" door te wachten of time-outs te verhogen zonder oorzaak.
   Perf-budgetten (`perf.spec`) tellen alleen in de dagelijkse run en zijn onder load ruis: als een
   budget faalt, noteer de meting en de load, pas niets aan.
3. Gate: de rode tests los per profiel groen (`pnpm e2e e2e/<spec> --project mobile-4g` enz.), daarna
   de hele suite één keer op een rustige host (loadavg < 8, `; echo FULL-E2E-EXIT: $?`), typecheck,
   unit, build. Draft-PR vroeg; "klaar" met de triagetabel en de suite-uitslag.

## Afbakening en bar

Geen nieuwe features; geen assertie versoepelen zonder benoemde oorzaak; geen test overslaan.
Leesbaarheid: geen één-letternamen, geen slimme one-liners, commentaar alleen voor het waarom.
