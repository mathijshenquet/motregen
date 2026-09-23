# Track U9 — regenhistogram/scrubber: visueel iteratief mooier maken (claude opus)

Read first: `AGENTS.md`, `web/src/components/HistogramScrubber.tsx` (+ test),
`web/src/styles.css` (histogram-/scrubber-regels), `.dev/tracks/` van U7
is verwijderd, maar het U7-werk zit in main (histogram luchtiger, Nu-pil op
de as); zie `git log --oneline -- web/src/components/HistogramScrubber.tsx`.
Referentie voor gevoel: DWD WarnWetter, en de regengrafiek van Buienradar/
Buienalarm als tegenvoorbeeld (druk). Your LOG: `.dev/tracks/u9-histogram-
polish/LOG.md` — committed, append-only, timestamped. Branch:
`track/u9-histogram-polish` vanaf main. Eigen worktree. Integratie-
instantie met echte data: http://ageq-mthq:4300/.

## PO-opdracht (2026-09-23)

"De regenhistogram-scrubber kan een stuk mooier. Laat een agent naar
screenshots KIJKEN en iteratief verbeteren." Dit is een ontwerptrack: je
werkwijze is de loop screenshot → beoordelen → aanpassen → screenshot, en
je LOG bevat elke iteratie met het beeld en wat je zag. Werk met echte
data (proxy naar prod zoals U7's `shots.mjs`; kies momenten mét regen in
de tijdlijn — scrub zo nodig naar een buiige periode) op desktop en
Pixel-5-portrait, licht en donker.

## Aandachtspunten (niet limitatief; jij ziet meer)

- Balken: hoogteschaal (log/wortel voor lichte regen zichtbaar), kleur =
  intensiteitsklasse consistent met de kaart-colormap, afgeronde toppen,
  rustige "nog niet geladen"-skeleton (U1 laadt nu in ~4 s; het skeleton
  mag subtieler).
- Verleden vs toekomst: duidelijke maar zachte scheiding bij Nu; de bron-
  overgangen (radar→nowcast→seamless→model) mogen voelbaar zijn zonder
  legenda-lawaai (bv. lichte tint/dash, tooltip).
- Cursor/pil: leesbare tijd, geen botsing met de Nu-pil, aanraakdoel ≥
  44 px op mobiel, fijne scrub met dempen; playknop en horizonpillen
  visueel in dezelfde familie.
- Typografie en spacing: tabular-nums, één maat-systeem; op telefoon niet
  cramped, op desktop niet leeg.
- Beweging: cursor tweent bij afspelen; balken die binnenkomen faden in;
  reduced-motion gerespecteerd.
- Toegankelijkheid: contrast AA, focus-ring, aria-valuetext op de slider.

## Gates

`pnpm typecheck`, `pnpm test`, `pnpm build`, `MOTREGEN_E2E_PORT=4301
MOTREGEN_E2E_DATA_PORT=8301 pnpm e2e` green, synchrone exit statussen in
LOG. Vóór/na-screenshots per iteratie in de LOG-map; eindvergelijking
desktop+mobiel, licht+donker. Draft-PR vroeg. Geen codex. Scope:
HistogramScrubber + styles + tests; App.tsx alleen voor props.
