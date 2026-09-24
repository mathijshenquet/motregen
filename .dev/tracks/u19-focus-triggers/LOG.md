# U19 — focus-triggers — LOG

## 2026-09-24 start (claude opus worker)
- Spec gelezen. Plan: FocusMode krijgt modi (`temperature`, `wind`), bronnen per modus in
  recency-volgorde; winnaar = modus van de laatst geactiveerde nog-actieve bron (laatste wint),
  per modus een eigen tween. Kaartlabel-handlers + `lastMapPointer` weg. Pin wordt één waarde
  (`temperature | wind | undefined`) zodat pins elkaar uitsluiten.
- Wind: DEFAULT intensity 1.9 → 1.27 (×2/3, afgerond op de knopstap 0,01; opgeslagen v2-tuning
  blijft gelden via sanitize). Windfocus: intensiteit × (1 + focus·½) → ×3/2 bij volle focus.

## 2026-09-24 12:05 implementatie (commit ccb2688)
- `FocusMode<Mode>`: bronnen als `mode:source` in een Map (volgorde = activering; heractiveren zet
  achteraan), winnaar = modus van de laatste nog-actieve bron, per modus een eigen tween, één
  rAF-loop, `onValue(mode, value)` alleen bij verandering. `windFocusIntensity` = ×(1+f·½).
- App: kaart-`mouseenter/leave` op `motregen-temperature` + `lastMapPointer` verwijderd;
  `focusPinned: FocusKind | undefined` (pins sluiten elkaar uit); `data-wind-focus` en
  `data-wind-intensity` op `.map-shell`.
- ForecastTable: prop `temperatureFocus` → `focus` (modus-generiek), kop-knoppen via één
  `FocusHeading` (`column-focus temperature-focus` / `column-focus wind-focus`), Wind-cellen hoverbaar.
  CSS: `.temperature-focus`-regels → `.column-focus`.
- Worktree-fixture miste `web/public/data/chunks/uv_clear-20260828.mrf` (gitignored); gekopieerd
  uit de hoofdcheckout → mrf.test.ts laadde weer.
- Gates (synchroon): TYPECHECK-EXIT 0, TEST-EXIT 0 (39 files, 220 tests), BUILD-EXIT 0.
- Draft-PR: https://github.com/mathijshenquet/motregen/pull/47

## 2026-09-24 12:10 e2e focus.spec
- e2e moet buiten de Claude-sandbox (tsx-IPC-pipe EPERM) en via `direnv exec .` (caddy).
- `pnpm e2e e2e/focus.spec.ts` → E2E-FOCUS-EXIT 0 (9 passed, 18 skipped); maar kaartveeg 52 s.
- Negatieve controle: kaart-handler tijdelijk teruggezet → kaartveeg-test faalt (max focus 0,87
  resp. 0,76 op grover raster). Test vangt de regressie dus echt. Handler weer weg (git checkout).
- Veeg versneld: per rij één `mouse.move` met `steps`.
- Veeg met `steps` per rij: 39,6 s (winst klein: kosten zitten in MapLibre's symboolquery per
  mousemove, niet in de roundtrip). Rijstap terug naar 14 px (negatieve controle ving het daar ook,
  0,87) en `test.setTimeout(120_000)` voor die ene test; volle run: 33,3 s.
- Positieve run nieuwe code, kaartveeg: E2E-POS-EXIT 0.

## 2026-09-24 12:40 gates (commit 77edecf + deze LOG)
- load ~11–12, poorten 4351/8351 vooraf vrij, flock-hostlock (wachtte op een run uit de hoofdcheckout).
- `MOTREGEN_E2E_PORT=4351 MOTREGEN_E2E_DATA_PORT=8351 direnv exec . bash -c 'cd web && pnpm e2e'`
  (buiten sandbox) → E2E-FULL-EXIT 0: 24 passed, 21 skipped (5,7 min); alle 9 focus-tests groen.
- TYPECHECK-EXIT 0, TEST-EXIT 0, BUILD-EXIT 0 (zie 12:05).
- Screenshot `web/tmp/playwright-results/focus-hovering-the-wind-co-*/wind-focus.png`: kop Wind in
  accent, regen/zon ongedimd.
- Open voor PM/PO: (1) de windfocus ×3/2 werkt op de actuele knopwaarde — wie in de perf-HUD
  intensiteit opslaat, krijgt ×3/2 daarvan (bij max 2,0 → 3,0 composite-opaciteit; niet geclampt,
  zoals de knop ook al >1 toelaat). (2) Wie een opgeslagen v2-tuning heeft met 1,9, houdt 1,9
  als gedempte basis — spec: "opgeslagen tuning respecteren"; Reset in de HUD geeft 1,27.
