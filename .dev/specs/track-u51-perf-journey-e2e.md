# Track U51 — perf.spec-journey herschrijven voor in-view laden en mobiele profielen (gpt-5.6-terra)

Read first: `AGENTS.md`, `web/e2e/perf.spec.ts` (de journey vanaf regel ~64: klikt op de
bereikknop "Alles" die sinds U34 niet meer bestaat; beschrijft het oude `eager`-laadgedrag),
`web/e2e/decode-budget.spec.ts` (U49), `web/e2e/profiles.ts` (budgetten per profiel),
`web/e2e/playback.ts`, `docs/perf.md` (§Lab-gates, §Mobiele labprofielen), `web/src/core/
decode-budget.ts` (U49: `in-view` op krappe apparaten), U43- en U49-LOG. LOG:
`.dev/tracks/u51-perf-journey-e2e/LOG.md` (committed, append-only, timestamped). Branch
`track/u51-perf-journey-e2e` vanaf main. Eigen worktree. Vandaag: 2026-10-07.

## Opdracht

1. Herschrijf de journey in `perf.spec.ts` naar het huidige product: koude start → TTFR →
   scrubben via de scrubber (geen bereikknoppen; `playback.ts`-helpers) → afspelen → locatie-
   wissel via de zoekpil → wachten tot `complete` (desktop) of tot het zichtbare venster
   geladen is (mobiele profielen, U49 `in-view`). Geen `getByRole('button', { name: 'Alles' })`.
2. Budgetten per profiel in `profiles.ts` eerlijk zetten op wat main nú haalt met 10 % marge,
   met in `docs/perf.md` een tabel "gemeten op <sha>, <datum>". De passieve chunkbytes-regel
   (nu 1,05 MB) idem.
3. De journey moet op alle drie de profielen groen zijn (desktop, mobile-4g, mobile-fast-3g)
   onder een slot, twee keer achter elkaar (flake-check). De bekende continue-zoom-flake in
   `wind-zoom.spec.ts` (ratio 0,64–0,70 tegen grens 0,7 onder swiftshader) hoort hier ook bij:
   meet tien runs, kies een grens die de echte regressie (U24: sprong vs continu) nog vangt, of
   markeer de assertie als `test.fixme` met de meting als reden. Geen stil versoepelen.
4. Gates: `pnpm typecheck`, `pnpm test`, `pnpm build`, de drie profielen × 2 runs van
   `perf.spec`/`decode-budget.spec`/`wind-zoom.spec` met synchrone exit statussen in de LOG.
   Draft-PR vroeg.

## Afbakening

Geen productcode, alleen e2e, profielen en docs. Leesbaarheidsbar: geen één-letternamen.
