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
