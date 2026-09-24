# Track U12 — windparticles overleven zoom/pan (claude opus)

Read first: `AGENTS.md`, `web/src/core/wind-layer.ts` (U3b: trailbuffer,
afstandsleven, leegste-cel-respawn, `LayerOverlay`-canvas uit U8c), de U3b-
en U8c-commits (`git log --oneline -- web/src/core/wind-layer.ts`), `docs/
motion.md`, `docs/perf.md`. Your LOG: `.dev/tracks/u12-wind-zoom/LOG.md` —
committed, append-only, timestamped. Branch `track/u12-wind-zoom` vanaf
main. Eigen worktree. Integratie-instantie: http://ageq-mthq:4300/.

## PO (2026-09-24)

"Nieuwe particles zijn nice, maar de zoom-reset is minder dan eergisteren:
als ik zoom lijken de particles weg te gaan, en het duurt even om nieuwe op
te bouwen."

## Opdracht

1. Reproduceer met Playwright (wheel-zoom en pinch, pan, resize) en leg vast
   wat er bij een transform-wijziging gebeurt: wordt de trailbuffer gewist,
   worden particles opnieuw gespawnd, start de fade-in van 15 px opnieuw,
   wacht de leegste-cel-respawn op lege cellen? Video vóór.
2. Fix: particles leven in wereldcoördinaten (Mercator) en worden bij
   zoom/pan geherprojecteerd i.p.v. gereset; de trailbuffer wordt bij een
   transform mee-getransformeerd (affiene warp van de vorige buffer, zoals
   vóór U3 het geval leek) of hooguit zacht gefaded, niet gewist; de
   dichtheid past zich per zoomniveau aan zonder de bestaande particles te
   doden (bij inzoomen extra spawnen, bij uitzoomen overtal uitfaden);
   fade-in bij spawn alleen voor écht nieuwe particles. Tijdens een
   doorlopende gesture (pinch) mag de simulatie op een lager tempo lopen,
   maar nooit blank.
3. Meet: tijd tot 90 % van de doeldichtheid na een zoomstap vóór/na
   (bestaande density-script uit U3b), frametijd tijdens pinch op het
   mobiele profiel. Video na.

## Gates

`pnpm typecheck`, `pnpm test`, `pnpm build`, `MOTREGEN_E2E_PORT=4330
MOTREGEN_E2E_DATA_PORT=8330 pnpm e2e` green, synchrone exit statussen in
LOG. Draft-PR vroeg. Geen codex. Scope: wind-layer + tests; App.tsx alleen
als het moet (U13/U14 werken daar parallel).
