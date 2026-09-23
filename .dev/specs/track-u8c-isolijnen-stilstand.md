# Track U8c — isolijnen: stilstand na refresh/scroll, en perf zichtbaar op echte GPU (claude opus)

Read first: `AGENTS.md`, `.dev/specs/track-u8b-isolijnen-vloeiend.md`, de U8b-
commits op main (`git log --oneline -- web/src/core/isoline-layer.ts
web/src/core/isoline-field.ts web/src/core/isoline-labels.ts`), `web/src/App.tsx`
(isoline-/focus-paden, `refreshManifest`/`applyManifestRefresh`, `moveend`,
`resize`, visibilitychange), `web/src/core/manifest-refresh.ts`,
`web/src/core/perf.ts` + `components/PerfHud.tsx`, `web/e2e/focus.spec.ts`.
Your LOG: `.dev/tracks/u8c-isolijnen-stilstand/LOG.md` — committed, append-
only, timestamped. Branch: `track/u8c-isolijnen-stilstand` vanaf main.
Eigen worktree. Integratie-instantie met echte data: http://ageq-mthq:4300/.

## PO-melding (2026-09-23)

"Isolijnen zien er echt nice uit. Wat is de perf? En er was een bug: na een
refresh of scroll stonden de isolijnen stil." Hypothese: de U8b-poort "nul
werk in rust" (geen contour-pass/worker-ronde zonder wijziging) mist een
invalidatie — kandidaten: manifest-autorefresh vervangt de tijdlijn/frames
(nieuwe run, nieuwe chunk-URL's) zonder de voorbereide (x,y,t)-texture of het
slice-cachet te vernieuwen; kaart-`move`/`zoom`/`resize` verandert de snede
maar triggert geen pass; `visibilitychange`/tab-terugkeer laat de ≤20 Hz-
scheduler hangen; scrubber-cursor die na refresh op een verschoven index
staat. "Refresh" kan ook een browser-reload zijn: check ook koude start met
focus-pin (touch) actief uit localStorage.

## Opdracht

1. Reproduceer eerst, met Playwright tegen prod-data: (a) hover/pin focus →
   afspelen loopt → forceer een manifest-refresh (`page.route` met nieuwe
   `generated`/`now`, of wacht op de echte 60 s-poll) → bewegen de lijnen
   nog? (b) idem met map pan/zoom en window-resize, (c) tab verbergen/tonen,
   (d) volledige page-reload met gepinde focus. Log per geval: passes/s en
   worker-rondes/s uit de bestaande tellers, en of de lijnen meebewegen met
   de scrubber. Screenshot/video van de stilstand.
2. Fix de invalidatie centraal: één `invalidate(reason)` die de slice- en
   texture-cache, de labelankers (herprojecteren, niet resetten) en de
   scheduler raakt, aangeroepen bij manifest-apply, move/zoom/resize,
   visibility-terugkeer en tijdlijnwissel. Rust blijft nul werk (U8b-
   meting mag niet verslechteren: hertest met `web/tmp/cost.mjs`-harnas of
   het equivalent uit de U8b-LOG).
3. e2e: nieuwe test in `focus.spec.ts` die na een manifest-refresh en na een
   map-move asserteert dat de isolijnen opnieuw renderen (pass-teller stijgt,
   `data-isolines` verandert) en dat in rust de teller stil blijft.
4. Perf zichtbaar voor de PO op zijn eigen laptop (echte GPU): voeg aan de
   perf-HUD (`?perf=1`/triple-tap) een regel "Isolijnen: passes/s · ms/pass ·
   labels" toe, ms/pass via `EXT_disjoint_timer_query_webgl2` als de browser
   het biedt, anders CPU-tijd rond de pass met een "(cpu)"-markering. Zo kan de
   PO de echte GPU-kost aflezen; zet in je LOG hoe hij dat moet lezen.

## Gates

`pnpm typecheck`, `pnpm test`, `pnpm build`, `MOTREGEN_E2E_PORT=4321
MOTREGEN_E2E_DATA_PORT=8321 pnpm e2e` (volledige suite) green, synchrone exit
statussen in LOG. Draft-PR vroeg. Geen codex.
