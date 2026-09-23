# U8 — temperatuur-isolijnen bij hover, met tween (worker: claude opus)

## 2026-09-23 — start, ontwerpkeuzes
- Spec + App.tsx/temperature/rain/wind/cloud-edge gelezen. Deps via
  `direnv exec .. pnpm install --frozen-lockfile` (worktree-.envrc eerst `direnv allow`).
- Isolijnen: eigen marching squares in `core/isolines.ts`. Segmenten krijgen als
  eindpunt-ID het rooster-edge-ID (elke kruising ligt op precies één edge die door
  hooguit twee cellen gedeeld wordt), dus stitching is exact en O(n) zonder
  coördinaatvergelijking. Zadelcellen via celgemiddelde. No-data (quant null) = NaN,
  cellen met NaN slaan we over. Smoothing: Chaikin, 2 iteraties (eindpunten open
  lijnen vast) — simpeler dan spline en kan nooit overshooten (geen lusjes).
- Alleen rekenen als focus > 0: buiten focusmodus nul extra werk (frametijd-
  randvoorwaarde). Tijdens playback key op (linker/rechter frame, mix per 1/20)
  zodat setData niet elke rAF vuurt.
- Focusmodus in `core/focus-mode.ts`: één waarde 0→1 met retarget-vanaf-huidige-
  waarde, ease-out cubic, 250/400 ms, reduced-motion → direct. Eén rAF-loop i.p.v.
  MapLibre-transitions omdat de helft (regen, wind, wolkrand) custom WebGL is; zo
  loopt alles exact synchroon.
- Trigger: muis/pen-hover op kaartlabel (mouseenter/leave op de symbol-laag) en op
  `.temperature-cell`/kolomkop; kolomkop is een `<button aria-pressed>` —
  toetsenbordfocus telt als hover, klik/tap toggelt een vastgezette focus. Touch:
  tap op de kolomkop (geen tap-and-hold: botst met scrollen van de tabel en het
  long-press-contextmenu, en is onvindbaar). pointerType 'touch' telt niet als hover
  (anders blijft een geëmuleerde hover na een tap hangen).

## 2026-09-23 — kern gebouwd, gemeten, eerste visuele ronde
- `core/isolines.ts` (blend, NaN-bewuste boxblur, marching squares met edge-ID-stitching
  in typed arrays + herbruikte workspace, Chaikin, lng/lat via rij-tabel), worker
  `isolines.worker.ts` met latest-wins (`IsolineWorker`), `core/focus-mode.ts`.
  RainLayer + CloudEdgeLayer kregen `setOpacity` (`u_opacity`); wind via
  `visibility × contextOpacity`; zon via `text-opacity`-expressie.
- Meting main thread vs worker (node, desktop-CPU), echt KNMI feels_like_c-frame
  (harmonie 08Z, 209×225), per update blend+contour+smooth:
  zonder blur: stap 2 p50 4,2 / p95 7,6 ms, maar 217 lijnen (0,3 °C-kwantisatie → spikkelringen);
  met blur 2×: stap 2 p50 4,3 / p95 12,6 ms, 44 lijnen; stap 1 p50 15 / p95 70 ms.
  Mobiel ~4× trager → worker gekozen (spec: "anders een worker").
- Bug gevonden bij eerste browserrun: `requestAnimationFrame` als default-param-methode
  → "Illegal invocation"; gefixt met arrow-wrappers.
- Screenshots (echte data via :4300-proxy, poort 4386): regen/wind dimmen, lijnen +
  "18°/20°"-labels op de lijn, licht en donker. Na blur rustig beeld (58 lijnen).
- Host herstart; werk was nog ongecommit — nu gecommit, daarna main gemerged (MOTREGEN_E2E_PORT).

## 2026-09-23 — na herstart: merges, e2e, perf-A/B, screenshots
- Main twee keer gemerged: eerst U1 (conflict `MrfClient(manifestUrl, perf.loads)`), daarna
  U3 wind-trails + tabel naar `components/ForecastTable.tsx`. Tabel-hover/-knop verhuisd naar
  ForecastTable als prop `temperatureFocus {pinned, onTogglePin, onFocus}`; wind-debug zit nu
  in de PerfHud, mijn knoppen (stap/glad/veldblur/dim/tween in/uit) blijven in `?dev`-paneel.
  `WindTuning.visibility` bestaat nog in U3 → wind-dim ongewijzigd.
- Nieuw `web/e2e/focus.spec.ts`: desktop hover in/uit (tussenwaarde, 1.00, bron leeg na uitfade,
  celhover), toetsenbordfocus + reduced motion (geen tussenwaarde), mobiel-4G tap-toggle + fps-log.
  `data-focus`/`data-isolines` op `.map-shell` als observatiepunt.
- Perf-A/B (desktop perf.spec, zelfde map/poorten, basis 07cda00 vs branch, geïnterleaved 4×):
  fps A 36/36,8/32,5/22,6 vs B 33,9/33/23,6/25,7; scrub p50 A 9,6–12,7 vs B 10,5–13,8 ms.
  Een eerdere niet-geïnterleavede reeks leek −30 % fps: dat was hostbelasting-drift
  (parallelle e2e van andere tracks; U7 draaide op 4287/8287, ik op 43xx). Buiten focus rekent
  U8 niets (lagen `visibility: none`, geen worker); rest valt binnen de ruis. Hypothese
  "canvasklik in perf.spec raakt een label → focus" expliciet gecontroleerd: focus bleef 0.00.
- Focusmodus mobiel-4G (4× CPU, SwiftShader), alleen gelogd: fps 52,1 buiten → 48,4 in focus
  (eerdere run 16,7 → 16,0).
- Gates op 934f238 (merge-tip), synchroon:
  `pnpm typecheck` EXIT 0; `pnpm test` EXIT 0 (138 tests); `pnpm build` EXIT 0;
  `MOTREGEN_E2E_PORT=4386 MOTREGEN_E2E_DATA_PORT=8386 direnv exec .. pnpm e2e` EXIT 0 (9 passed, 9 skipped).
- Screenshots/video (echte KNMI-data via :4300, OpenFreeMap): `desktop-{light,dark}-{uit,focus}.png`,
  `desktop-light-tween.png` (110 ms na hover), `pixel5-light-vastgezet.png`, `hover-in-uit-licht.webm`.
- Open voor PO: (1) touch = tap op kolomkop "Gevoel" (vastzetten); op mobiel staat de tabel onder de
  kaart, dus kaart eerst terugscrollen — tap-and-hold op kaartlabel zou directer zijn maar botst met
  kaart-pan/long-press. (2) Lijnkleur is neutraal grijs-leigrijs; in licht lijkt die op landsgrenzen
  (onderscheid zit in vorm + labels). (3) Veldblur 2× is een eigen keuze (zonder blur 217 spikkelringen).
