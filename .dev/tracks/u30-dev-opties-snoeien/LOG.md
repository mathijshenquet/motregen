# U30 — dev-opties snoeien (MIP-12) — worker LOG (append-only)

## 2026-09-25 11:10 — start, inventaris op main `ab3fb05`

Worker: claude opus 5.5. Branch `track/u30-dev-opties-snoeien`, rebased = main (U22 en U25 zitten
erin, U24 nog niet → windknoppen wachten, PO-aanvulling: rest nu).

Inventaris vóór (verschilt van MIP-12 omdat U22/U25 al snoeiden en toevoegden):

- URL-parameters (6): `?dev`, `?perf=1`, `?labelfade`, `?histogram=wait`, `?zon=markering`,
  `?uvbalk=stip` (`?klok`/`?zoekpaneel` al weg door U22).
- Dev-paneel (30 bedieningselementen + 2 notities): Isolijnen, Vulling, Vulling afval,
  Kaartverzadiging (U25, vervallen in U25b), Tijdvenster, Label-afstand, Label-spatiëring,
  Vectorlijnen, Lusjes <, Verdichting, Bicubisch, Contour px/CSS-px, Contour max, Glad (labels),
  Vervagen, |∇T| laag, |∇T| hoog, Snelheid laag, Snelheid hoog, Veldblur, Focus dim, Tween in,
  Tween uit, Wolkrand, Grafiek vult, Min. breedte, Temp-afstand, Splash ×, Herhaal splash,
  Reset alle instellingen; notities "Maximale kaartzoom", reset-status.
- PerfHud windknoppen (15), `motregen-wind-tuning-v3`.

Bundle vóór (`pnpm build`, BUILD-EXIT 0): JS `index-*.js` 1 298,10 kB (gzip 367,49 kB),
CSS 121,65 kB (gzip 21,07 kB), workers 4,17 / 8,91 / 9,16 kB.

Plan: (1) URL-params + weg-knoppen + Wolkrand-laag weg, constanten met herkomst; (2) paneel
groeperen met uitleg; (3) PerfHud-knop in paneel; (4) docs/dev-opties.md + AGENTS-regel;
(5) na U24-merge: wind v4.

## 2026-09-25 11:25 — snoeironde 1 (alles behalve wind)

Gedaan:
- URL-parameters weg: `?perf` (HUD start dicht; triple-tap + knop Perf-HUD in `?dev`),
  `?labelfade` (constante `fadeDuration: 0`, U8b), `?histogram=wait` (+ toggle "Grafiek vult";
  skeleton, U1), `?zon=markering` (zon-op/onder alleen nog als rij; `.sun-mark` CSS weg),
  `?uvbalk=stip` (variant A; `UvBarVariant`, `.uv-bar-dot` weg). Over: alleen `?dev`.
- Wolkrand helemaal weg: `cloud-edge-layer.ts` + test, laag `motregen-cloud-edges`, signaal,
  attach/show/toggle, reset-regel. Er bestond geen opslagsleutel `motregen-cloud-edges` (het was
  de laag-id; de instelling was nooit persistent) — niets te migreren.
- Isolijnknoppen weg → constanten in `isolines.ts` met herkomstregel: `ISOLINE_BLUR` (Veldblur),
  `ISOLINE_WINDOW` (Tijdvenster), `ISOLINE_FILL_RESOLUTION` (Contour px), `ISOLINE_RING_KM`
  (Lusjes), `ISOLINE_TOLERANCE_PX` (Verdichting), `ISOLINE_GRADIENT` (|∇T| laag/hoog).
  Dode code van verliezende varianten weg: het hele rasterlijnenpad in `isoline-layer.ts`
  (contour-shader, `pass()`, `bench()`, maxHz-catch-up; Vectorlijnen/Contour max), de
  shaderbranches lineair-in-tijd en bilineair (Tijdvenster/Bicubisch), label-Chaikin-schakelaar
  (Glad), en de vervaagmodus "snelheid" (bestond alleen in het rasterpad — in vectormodus
  deed hij niets; Snelheid laag/hoog). `IsolineTuning` houdt alleen step/fade + de twee
  U25-vulknoppen; `IsolinePassTuning` is weg. De algemene wiskunde (`temporalWeights`,
  `sliceWeights`, `isolineLayerIndices` met window-parameter) blijft geparametriseerd: de tests
  daarvan documenteren waarom B-spline won.
- Label-spatiëring → `LABEL_SPACING_PX` (isoline-labels). Tween in/uit → `FOCUS_IN_MS`/
  `FOCUS_OUT_MS`; `FocusMode` neemt geen tuning-getter meer. Temp-afstand weg (altijd auto).
  Splash × weg: 1,5× als CSS-variabelen op `.map-splash`, `motregen-splash-slowdown` wordt niet
  meer geschreven (reset wist oude waarden via de prefix-scan).
- Dev-paneel is nu `components/DevPanel.tsx`: `<details class="dev-panel">` met groepen Kaart
  (open) / Temperatuur / Focus / Diagnose (dicht); elke knop heeft zijn uitleg als `title` én
  grijze `.dev-hint`-regel. Toont nu op `?dev` alleen (vroeger ook alleen als er wind was).
  Wind-groep volgt met de v4-knoppen na de U24-merge. De U25-knoppen Vulling/Vulling afval/
  Kaartverzadiging blijven tot U25b (die haalt ze zelf weg, zie `origin/track/u25b-palet-lokaal`).
- `docs/dev-opties.md` (levende lijst), AGENTS-conventie, `docs/perf.md` bijgewerkt;
  `e2e/perf.spec.ts` (`/` i.p.v. `/?perf=1`, HUD start dicht), nieuw `e2e/dev-panel.spec.ts`;
  scripts `measure-session`/`wind-ink`/`wind-bisect` bijgewerkt.

Knoppen: dev-paneel 30 → 11 (8 instelknoppen + Perf-HUD + 2 acties), waarvan 3 U25-knoppen die
U25b weghaalt → 8. URL-parameters 6 → 1.

Receipts (vanuit `web/`, synchroon):
- `pnpm synthgen` SYNTH-EXIT 0 (buiten sandbox: tsx-IPC-pipe EPERM erin). NB: vooraf bestaand —
  `public/data/chunks/uv_clear-20260828.mrf` valt onder `.gitignore` (`data/`), dus een verse
  worktree faalt `mrf.test.ts` tot synthgen draait; fixtures verder byte-identiek.
- `pnpm typecheck` TYPECHECK-EXIT 0; `pnpm test` TEST-EXIT 0 (42 bestanden, 254 tests).
- `pnpm build` BUILD-EXIT 0: JS 1 281,42 kB (gzip 363,42) vs 1 298,10 (367,49) → −16,7 kB
  (−4,1 kB gzip); CSS 121,33 (21,03) vs 121,65 (21,07); isolines.worker 4,11 vs 4,17 kB.
- e2e: nog niet (load 32 > 22).

## 2026-09-25 11:34 — e2e-proces

- Eerste e2e-poging (11:18, load 21,92) faalde vóór de tests: `caddy: command not found` — de
  worktree-`.envrc` (ongewijzigd t.o.v. main) was nog niet `direnv allow`ed. Toegestaan; e2e
  loopt nu via `direnv exec .. pnpm e2e …`.
- Herstart 11:26:10, startload 20,71, head `68550e2`, specs: dev-panel, perf, focus, location,
  map-zoom, freshness (geraakt door deze track).
- Orkestrator-procesnoot: wachtdrempel voortaan load < 28, de slotlock (`e2e-slot.sh`) regelt de
  rest; max. één Chromium; startload per run in deze LOG.

## 2026-09-25 11:45 — gerichte e2e ronde 1 groen

`MOTREGEN_E2E_PORT=4376 MOTREGEN_E2E_DATA_PORT=8376 direnv exec .. pnpm e2e e2e/dev-panel.spec.ts
e2e/perf.spec.ts e2e/focus.spec.ts e2e/location.spec.ts e2e/map-zoom.spec.ts e2e/freshness.spec.ts`
(vanuit `web/`), head `68550e2`, startload 20,71: **E2E-EXIT 0**, 34 passed, 26 skipped
(projectgebonden skips), 7,6 min. Perf-journey met HUD dicht bij start + triple-tap open/dicht/open
groen op alle profielen. U24 nog niet op main (`origin/main` = `d140ed8`); windknoppen wachten.
