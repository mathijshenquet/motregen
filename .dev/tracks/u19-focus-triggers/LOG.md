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
