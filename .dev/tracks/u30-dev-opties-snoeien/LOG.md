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

## 2026-09-25 12:55 — rebase op main `99d9525` + snoeironde 2 (PO 16:30: "nog steeds veel te veel")

Rebase op `99d9525` (U22b, U23, U25b, U26 erin). Conflicten opgelost in App/ForecastTable (U23:
`sunForm`/`uvBar` weg ook in de nieuwe tijd+weer-cel en de relatieve UV-schaal), isolines/
isoline-layer (U25b-palet behouden, `fillFalloff` bestond niet meer), focus-mode (U25b zette
verzadiging al vast), styles (U26-pin-CSS behouden). Tussenstap typecheck 0 vóór `--continue`.

Snoeironde 2 (orkestrator: max. 3–4 per groep, rest constante):
- Vulling → `ISOLINE_FILL_OPACITY = 0.7`. **Afwijking van de queue-noot**: die noemt default 0,35
  en een knop Vulling-stijl (banden/verloop) "nieuw op main", maar `origin/main` (`99d9525`) heeft
  0,7 (U25b-merge: "dekkende vlakke banden per graad (0,7)") en géén stijlknop; 0,35 staat nergens
  in main/LOG/proposals. Ik zet dus de gemergde 0,7 vast; komt Vulling-stijl (met 0,35) later op
  main, dan neemt de volgende rebase die over (stijlknop houden, zoals gevraagd).
- Label-afstand → `LABEL_MIN_DISTANCE_PX = 90` (isoline-labels; `IsolineLabelTuning`/`setTuning` weg).
- Eigen oordeel, strenger dan de queue letterlijk vroeg: Focus dim → `FOCUS_DIM = 0.25`
  (`FocusTuning` weg) en Min. breedte → `MINIMUM_MAP_WIDTH_KM = 20` (+ de max-zoom-notitie). Dan
  blijven er geen eenknopsgroepen Kaart/Focus over. Terugzetten is één knop; zeg het als de PO ze
  wil houden.
- Paneel nu: **Temperatuur** (open): Isolijnen, Vervagen · **Diagnose**: Perf-HUD, Herhaal splash,
  Reset · **Wind** volgt (4 knoppen) na U24.

Knoppen: dev-paneel op main `99d9525` 26 → 5 (2 instelknoppen + Perf-HUD + 2 acties); met Wind
straks 9. URL-parameters op main 6 → 1 (`?dev`).

Receipts (vanuit `web/`, synchroon, head = deze commit):
- `pnpm typecheck` TYPECHECK-EXIT 0; `pnpm test` TEST-EXIT 0 (44 bestanden, 280 tests).
- `pnpm build` BUILD-EXIT 0: JS 1 287,37 kB (gzip 365,96); CSS 122,25 (21,17).
  Vóór = `origin/main` `99d9525` in een tijdelijke worktree gebouwd (BUILD-MAIN-EXIT 0):
  JS 1 306,27 kB (gzip 370,92); CSS 122,78 (21,24) → −18,9 kB JS (−5,0 kB gzip), −0,5 kB CSS.
- e2e: volgt (drempel load < 28).

## 2026-09-25 13:25 — rebase op `2c58da9`, eindstand, slot

- Rebase op `2c58da9` (U24 `a9d71fa` + `5fcd35b` erin). `5fcd35b` bracht Vulling 0,35 en de knop
  Vulling-stijl (banden/verloop): Vulling → `ISOLINE_FILL_OPACITY = 0.35` (daarmee is de
  0,7/0,35-afwijking uit de vorige entry opgelost), Vulling-stijl blijft instelbaar
  (`ISOLINE_FILL_STYLES`, groep Temperatuur). Geen nieuwe URL-parameters of opslagsleutels op main.
- Windknoppen v4 (`ebf142b` → na rebase `0361368`): `WindTuning` = Dichtheid, Intensiteit,
  Lijnbreedte, Tempo; de andere elf zijn constanten in `WIND_PARAMETERS` met herkomst per regel;
  opslag `motregen-wind-tuning-v4` (alleen afwijkingen), v3 eenmalig gemigreerd (onbekende
  sleutels vallen weg, v3-sleutel weg), v2-migratie geschrapt (reset wist die). JSON-export
  "Kopieer wind als JSON" in de groep Wind; PerfHud alleen nog meting (+ U24-perf-JSON).
- Eindpaneel: **Temperatuur** (open) Isolijnen, Vulling-stijl, Vervagen · **Wind** Dichtheid,
  Intensiteit, Lijnbreedte, Tempo + JSON · **Diagnose** Perf-HUD, Herhaal splash, Reset.
  Knoppen vóór (main `4c06c49d`, MIP-12): 8 URL-parameters, 28 paneelknoppen, 15 windknoppen →
  na: 1 URL-parameter (`?dev`), 10 instelknoppen + 4 acties/toggles.

Receipts op head `9f70b22` (vanuit `web/`, synchroon):
- TYPECHECK-EXIT 0; TEST-EXIT 0 (44 bestanden, 282 tests); BUILD-EXIT 0.
- Eindmeting bundle vs `origin/main` `2c58da9` (tijdelijke worktree, BUILD-MAIN-EXIT 0):
  JS 1 290,82 kB (gzip 367,16) vs 1 311,03 (372,71) → −20,2 kB (−5,6 kB gzip);
  CSS 121,94 (21,11) vs 123,13 (21,29).
- Gerichte e2e op `9f70b22` gestart 13:19:08 (startload 26,38) en op verzoek van de orkestrator
  **afgebroken** (test een oude tip): géén e2e-receipt op de eindtip. De laatste gerichte groene
  run is ronde 1 (`68550e2`, E2E-EXIT 0). De dev-panel-still is daardoor niet gemaakt; de
  test `e2e/dev-panel.spec.ts` schrijft hem (`tmp/playwright-results/.../dev-panel.png`) bij de
  volledige suite op main.

Slot: gemerged op main als `8322cfe` door de orkestrator, met conflictoplossing (U31-instrumentatie
behouden; regel "Gebruiksbaken" in de groep Diagnose via prop `usageBody` op `DevPanel`). De
volledige e2e-suite draait de orkestrator op main. Open voor de PO: de "vervalt bij"-kolom in
`docs/dev-opties.md` voor Isolijnen/Vervagen/Wind is een U30-voorstel; Focus dim en Min. breedte
zijn op eigen oordeel constant gemaakt (één knop terug als de PO ze wil).
