# Track U43 — profielmodus `?perf` (MIP-16) (gpt-5.6-sol)

Read first: `AGENTS.md`, `.dev/proposals/0016-profielmodus.md` (de opdracht),
`docs/perf.md`, `web/src/core/perf.ts`, `web/src/components/PerfHud.tsx`, `web/src/App.tsx`
(frame-lus rond `layer.setTime`, `cursorFrame`, prefetch), `web/src/core/rain-layer.ts`,
`isoline-layer.ts`, `isoline-tracer.worker.ts`, `wind-layer.ts`, `frame-batcher.ts`,
`docs/dev-opties.md` (MIP-12: elke knop met eigenaar + vervaldatum), `web/scripts/` (bestaande
scripts, synthgen). LOG: `.dev/tracks/u43-profielmodus/LOG.md` (committed, append-only,
timestamped). Branch `track/u43-profielmodus` vanaf main. Eigen worktree. Vandaag: 2026-10-07.

## Opdracht

1. **Fase-instrumentatie (altijd aan)**: `performance.mark/measure` rond de fasen: frame-
   decode (zstd/MRF), textuur-upload, isolijn-trace (worker-rondes, al geteld) + blit,
   windstap, scrubber-paint, tabel-render (Solid: meet rond de grote memo's), basemap-tile-
   events van MapLibre. Lichtgewicht: géén measures als de profielvlag uit staat en de HUD
   dicht is (gate met één boolean). Plus een `PerformanceObserver` op `long-animation-frame`
   (feature-detect; buffered). Snapshot (`PerfSnapshot`) krijgt per fase count/p50/p95 van het
   laatste venster en een top-5 lange frames (duur, blokkerend, scriptbron/functie). HUD
   toont dat compact; `Kopieer JSON` neemt het mee.
2. **`?perf`-poort**: `?perf` zet `localStorage['motregen-perf']=1` (`?perf=0` wist hem);
   met de vlag aan: HUD open (compact) en een opnameknop "Opname 30 s" + "Koude start"
   (zet vlag `motregen-perf-cold`, herlaadt, neemt de eerste 30 s na `timeOrigin` op). Dev-
   optie in `docs/dev-opties.md` (eigenaar U43, vervalt: blijft, diagnose). `?dev` krijgt
   dezelfde knoppen in de groep Diagnose.
3. **Opname**: JS Self-Profiling API (`new Profiler({ sampleInterval: 10, maxBufferSize })`,
   feature-detect; Vite dev + preview + Caddyfile.dev zetten `Document-Policy: js-profiling`),
   gecombineerd met de marks/measures en lange frames, geëxporteerd als één JSON in Chrome
   Trace Event-formaat (`traceEvents` met `Profile`/`ProfileChunk` voor de samples en `X`-
   events voor measures) zodat https://profiler.firefox.com en Perfetto het direct laden.
   **Verifieer de import echt** (headless Chromium: Firefox Profiler laadt het bestand via
   `/from-file/` is niet scriptbaar — lever dan een Node-script `web/scripts/prof-check.ts`
   dat het bestand valideert tegen het formaat én open het één keer zelf in een browser;
   beschrijf de receipt in de LOG). Zonder Profiler-API: alleen measures + lange frames.
4. **Afleveren**: `web/scripts/prof-sink.ts` — klein HTTP-endpoint (Node, geen deps) dat
   `POST /prof` aanneemt en schrijft naar `~/motregen-profiles/<ISO>-<platform>.json`; de
   preview-opzet krijgt een proxy `/prof` → sink (Vite `server.proxy`/`preview.proxy`) en
   `Caddyfile.dev` idem. Knoppen: "Stuur" (POST), "Kopieer" (klembord), "Download". Prod
   krijgt niets (geen route, geen header): documenteer dat in `docs/perf.md`.
5. **Eerste echte opname** op deze host: start de preview op poort 4330
   (`MOTREGEN_DATA_ORIGIN=https://motregen.nl/data pnpm preview --host 0.0.0.0 --port 4330
   --strictPort`, achtergrond) + de sink, neem zelf een desktop-opname via Playwright
   (Chromium, `--project desktop`), en schrijf een korte analyse in de LOG: top-5 fasen op
   p95, top-5 lange frames. Meld de URL http://ageq-mthq:4330/?perf aan de orkestrator voor
   de telefoon-opname van de PO.
6. Tests: unit voor de fase-aggregatie en de trace-export (deterministisch); `pnpm typecheck`,
   `pnpm test`, `pnpm build`, gerichte e2e `perf.spec --project desktop` onder een slot.
   Synchrone exit statussen in de LOG. Draft-PR vroeg.

## Afbakening

Geen optimalisaties in deze track (meten eerst); geen metingen naar motregen.nl.
Bundelbudget: de profielcode mag lazy laden (dynamic import) zodat de hoofdbundel niet groeit.
