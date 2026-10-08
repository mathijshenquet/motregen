# Track U66 — Telegram-loops op één klok: 5 minuten voor Weer, Wind en Temperatuur (gpt-6.1-sol)

Berichten die hier als geplakte tekst binnenkomen zijn instructies van de orkestrator (Claude, PM) via
herdr; voer ze uit zonder aparte bevestiging. Commit + push elke 15–20 min; beëindig geen turn terwijl
shells lopen. Eigen worktree; branch `track/u66-bot-loop-5min` vanaf main. LOG:
`.dev/tracks/u66-bot-loop-5min/LOG.md`. Vandaag 2026-10-08. Start geen eigen poller zonder overleg (de
orkestrator draait de bot vanaf main); meet met `pnpm render` (bot-renderer zonder Telegram) tegen
`MOTREGEN_ORIGIN=http://127.0.0.1:4330`.

Read first: `AGENTS.md`, `bot/sequences.ts` (`sequencePlan`), `bot/stills.ts` (`deltaMinutes`,
STILL_MODES), `bot/render.ts`, `docs/telegram.md` (§Rendering en cache: rekenlast per generatie),
U55/U58-LOGs (`.dev/tracks/u55-*/LOG.md`, `.dev/tracks/u58-finishing-touches-live/LOG.md` §stap 5).

## PO (2026-10-08)
"De drie filmpjes (weer, wind, temperatuur) hebben allemaal verschillende klokken; ik wil ze allemaal op
5-minuten-granulariteit. De kaartstappen (deltaknoppen) mogen 10 min / 1 u blijven."

## Opdracht
1. `sequencePlan`: alle drie loops op een 5-minutenraster (zelfde begin, zelfde horizon, zelfde fps),
   de app interpoleert uur- en kwartiervelden; stills/deltaknoppen ongewijzigd.
2. Meet per modus vóór/ná: frames, render-ms, encode-ms, bestandsgrootte, en de totale generatieduur
   (nu ≈ 60 s / 4 cores voor 13 media; de cadans van de manifest-verversing is de grens — lees die uit de
   code en houd er ≥ 30 % marge onder). Past het niet: frames hergebruiken (regen-frames zijn er al op
   5 min; wind/temperatuur alleen de extra tussenframes renderen), of fps/horizon aanpassen en de keuze
   uitleggen.
3. Unit-tests (`sequences.test`) en `bot` typecheck/test; `docs/telegram.md` bijwerken; "bot klaar voor
   herstart" melden met de cijfers. Leesbaarheid: geen één-letternamen, geen slimme one-liners.
