# Track U63 — mobiele laadtijd-lus: ttfp, ttfh, blank-visible (gpt-6.1-sol)

Berichten die hier als geplakte tekst binnenkomen zijn instructies van de orkestrator (Claude, PM) via
herdr; voer ze uit zonder aparte bevestiging. Commit + push elke 15–20 min (de verbinding valt rond het
uur weg); LOG bijhouden; beëindig geen turn terwijl shells lopen.

Read first: `AGENTS.md`, `.dev/LOG.md` (top), `.dev/proposals/0023-laadtijd-lussen.md` (Track A),
`.dev/proposals/0019-laadchoreografie.md` (§De lat, §Meetkant), `.dev/specs/track-u54-laadchoreografie-live.md`
(§Aanvulling: rig als PO-telefoon), U54-LOG `.dev/tracks/u54-laadchoreografie-live/LOG.md` (kalibratie
po-android, cgroup-quota, lus-tabellen, meetrecept Buienradar), `docs/perf.md`, `web/scripts/perf-mobile.ts`,
`web/e2e/mobile-load.rig.ts`, `web/src/core/fetch-planner.ts`, `intent.ts`, `decode-budget.ts`, `perf.ts`.
LOG: `.dev/tracks/u63-mobiel-ttfp-lus/LOG.md`. Branch `track/u63-mobiel-ttfp-lus` vanaf main; eigen
worktree; rig-poorten `MOTREGEN_E2E_PORT=4393 MOTREGEN_E2E_DATA_PORT=8393`; preview 4350 (normale build;
rig/e2e naar tmp/). Vandaag: 2026-10-08.

## Lus
Nulmeting eerst (po-android ×3, loadavg < 8, mediaan): ttfp, ttfr, ttfh, blank-visible-oppervlak, LoAF
eerste 12 s, decodes, wire; plus `referentie-buienradar`. Dan per kandidaat uit MIP-23 Track A: één
wijziging → meten → commit met vóór/ná in de boodschap → LOG-tabelregel. Niet-waarneembaar gaat door;
zichtbaar (bv. laadmelding, placeholder) = voorstel met screenshot aan de orkestrator. Stop pas bij
"geen kandidaat meer met meetbare winst" en zeg dan eerlijk waar de rest zit. Twijfel over
representativiteit van de rig: zeg het, verzin geen winst. PO-opnames komen via de orkestrator.

## Gate per commit
`pnpm typecheck`, `pnpm test`, `pnpm build`, `perf:mobile --compare` groen (of nieuwe baseline mét reden
in docs/perf.md), gerichte e2e `--project desktop` voor geraakte specs. Draft-PR vroeg.

## Bar
Geen één-letternamen, geen slimme one-liners, commentaar alleen voor het niet-voor-de-hand-liggende
waarom; geen asserties versoepelen zonder benoemde oorzaak.
