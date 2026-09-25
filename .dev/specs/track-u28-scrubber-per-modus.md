# Track U28 — scrubberinhoud volgt de kaartmodus (claude opus 5.5)

**Start pas na de merge van U23** (tabelkoppen als modeknoppen: dat
definieert de modes Weer / Gevoel / Wind).

Read first: `AGENTS.md`, `.dev/specs/track-u23-tabelkoppen-als-
modeknoppen.md` + LOG, `web/src/components/HistogramScrubber.tsx`, `web/src/
core/rain-chart.ts`, `web/src/App.tsx` (`rainSeries`, `feelsLikeSeries`,
`temperatureSeries`, `windUSeries`/`windVSeries`, `focusPinned`), `web/src/
core/uv.ts` (kleurniveaus als voorbeeld van een schaal), U9-LOG (histogram-
polish). Your LOG: `.dev/tracks/u28-scrubber-per-modus/LOG.md` — committed,
append-only, timestamped. Branch `track/u28-scrubber-per-modus` vanaf main.
Eigen worktree. Preview: http://ageq-mthq:4300/.

## PO (2026-09-25)

"Graag de content van de scrubber afhankelijk maken van de kaartmodus."

## Opdracht

1. De scrubber toont per gepinde modus (`focusPinned`, U23) een andere
   reeks voor de gekozen locatie, met dezelfde tijdas, nu-lijn, cursor en
   afspeelknop:
   - **Weer (default)**: het regenhistogram zoals nu.
   - **Gevoel**: gevoelstemperatuur als lijn (met luchttemperatuur als
     dunne tweede lijn), y-as auto op het zichtbare bereik met vaste stap
     (2 of 5 °C), kleur uit het U25-temperatuurpalet als die er is, anders
     `--accent`.
   - **Wind**: windsnelheid (Bft-banden als achtergrondkleur, m/s als lijn)
     met kleine richtingspijltjes per uur onder de as.
2. Wissel met een korte crossfade (≤ 200 ms) en zonder dat de cursor of
   het afspelen onderbroken wordt. `prefers-reduced-motion`: direct.
3. De cursor-readout (`formatRate`) volgt de modus: "12 °C" / "5 Bft ZW" /
   "1,2 mm/u".
4. Het regenhistogram is de hoofdweergave; de tijdelijke hover-focus (U19)
   wisselt de scrubber NIET — alleen pinnen doet dat (anders flikkert hij bij
   hoveren over de tabel).
5. Tests: unit voor de y-as-schaal en de readout per modus; e2e: pin
   Gevoel → scrubber toont temperatuurlijn; pin uit → histogram terug;
   stills licht/donker.

## Niet doen

- Geen nieuwe data-fetches: alle reeksen zijn al per locatie geladen voor de
  tabel. Geen wijziging aan de kaartmodes zelf.

## Gates

`pnpm typecheck`, `pnpm test`, `pnpm build`, `MOTREGEN_E2E_PORT=4372
MOTREGEN_E2E_DATA_PORT=8372 pnpm e2e` (hostlock, load < 16, één Chromium,
poorten vooraf vrij) groen, synchrone exit statussen in de LOG. Draft-PR
vroeg. Geen codex.
