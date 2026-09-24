# Track U16 — isolijnen: labels faden mee met lusjes, halve-breedte-lijn i.p.v. stippel (claude opus)

Read first: `AGENTS.md`, `web/src/core/isoline-layer.ts` (U13: vectorpad,
`dashed`, `dash()`-shader, `ringFade`), `isoline-contours.ts`, `isoline-
labels.ts` (`anchor.fade` = gradiënt-fade; ringlengte-filter alleen bij
spawn), `isolines.ts` (tuning), `App.tsx` (isolijn-/focuspaden, knoppen),
de U13-merge (`git log --oneline -3 -- web/src/core/isoline-layer.ts`).
Your LOG: `.dev/tracks/u16-isolijnen-polish/LOG.md` — committed, append-
only, timestamped. Branch `track/u16-isolijnen-polish` vanaf main. Eigen
worktree. Preview: http://ageq-mthq:4300/ (`?dev&perf=1`).

## PO (2026-09-24)

"De max-length-fade werkt heel goed, alleen de geassocieerde temperatuur-
markers moeten ook mee faden. De stippellijn loopt nu te veel; een halve-
breedte doorgetrokken lijn lijkt me voor nu beter."

## Opdracht

1. **Labels faden mee.** Elk lijnlabel-anker krijgt de `ringFade` van zijn
   ring (worker levert per ring de lengte-fade; anker bewaart ring-id/
   -lengte en volgt de fade continu, ook als de ring krimpt tijdens de
   tween), vermenigvuldigd met de bestaande gradiënt-fade (die default uit
   staat). Een anker op een ring die onder ½·L_min zakt despawnt met fade.
   Test: ring van 40 km bij L_min 60 → label-opacity ≈ smoothstep-waarde.
2. **Oneven graden: halve breedte, doorgetrokken** i.p.v. stippel. Knop
   `Oneven lijnen`: halve breedte (default) / stippel / gelijk. Behoud de
   dash-code achter de knop. Controleer dat de capsule-AA bij halve
   breedte (≈ 0,75–1 px op DPR 1) niet flikkert; zo nodig minimum 1 px en
   in plaats daarvan lagere alpha. Screenshots licht/donker, z6 en z9.
3. Rust blijft 0 passes; frametijd tijdens afspelen+focus niet slechter
   (U8c/U13-meting).

## Gates

`pnpm typecheck`, `pnpm test`, `pnpm build`, `MOTREGEN_E2E_PORT=4340
MOTREGEN_E2E_DATA_PORT=8340 pnpm e2e` (onder de hostlock, load < 16, één
Chromium) green, synchrone exit statussen in LOG. Previews voor
screenshots: eerst `pnpm build` of eigen `--outDir` (e2e vergiftigt dist).
Draft-PR vroeg. Geen codex. U17 werkt parallel in LocationSearch/About/
Freshness — blijf bij de isolijnbestanden.
