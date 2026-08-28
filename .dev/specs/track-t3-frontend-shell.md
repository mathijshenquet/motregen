# Track T3 — frontend shell on synthetic data (gpt-5.6-sol)

Read first: `AGENTS.md`, `.dev/proposals/0001-mvp-architecture.md` (§3
frontend + §5), `.dev/proposals/0002-frame-transport.md`, and
`docs/contract.md` — the wire contract you build against. The contract is
authoritative: if it blocks or underspecifies something, record a wall/note in
your LOG and (for true blockers) stop rather than changing it. Your LOG:
`.dev/tracks/t3-frontend-shell/LOG.md` — append-only, timestamped, committed
with your work.

## Goal

The motregen.nl MVP shell working end-to-end on synthetic data: map + WebGL
rain overlay + unified time slider + location picking + rain intensity meter,
all reading manifest/mrf v0 exactly per `docs/contract.md`.

## Stack (decided in MIP-1 — not up for debate in this track)

`web/` — Vite + TypeScript + SolidJS + Tailwind v4, pnpm, vitest. No shadcn,
no component library. MapLibre GL JS with an OpenFreeMap style. Hard
architectural requirement: the core (mrf client/decoder, time model, WebGL
layer) is framework-free TS modules; Solid is a thin shell over it.

## Tasks

1. Scaffold `web/` (vite + solid + ts + tailwind v4 + vitest;
   `pnpm build` and a `typecheck` script from day one).
2. `web/scripts/synthgen.ts` (run via `pnpm synthgen`, deterministic seed):
   generates a full synthetic dataset into `web/public/data/` —
   `manifest.json` + mrf chunks per the contract: 3 h history at 5 min,
   25×5 min nowcast, 24 hourly "harmonie" frames; advecting rain cells with
   plausible intensities (drizzle to heavy showers), some frames dry. This is
   the first independent implementation of the contract — any ambiguity you
   hit is a finding; log it.
3. mrf client lib (framework-free, vitest-covered): parse header, fetch
   frames progressively (Range requests using `header_len` and frame
   offsets), zstd-decode in a web worker (pick a lib, e.g. fzstd), LRU cache
   of decoded frames, values exposed through the header's quant table.
4. Map + overlay: MapLibre custom WebGL layer; frames as R8 textures;
   colormap LUT + blending between adjacent frames in the fragment shader;
   georeferenced to the manifest grid (EPSG:3857). Buienradar-like colormap
   (transparent dry → blue → red/violet heavy), exact ramp is your taste call.
5. Unified time slider: full timeline from the manifest, visible regime
   segmentation (history | nu | nowcast | model — labels in Dutch), a "nu"
   marker, drag-scrub that stays smooth at 60 fps, play/pause with sensible
   speed. Scrubbing must never jank on frame decode (prefetch around the
   cursor).
6. Location: tap-to-pick marker + a geolocation button (browser API, graceful
   denial). Intensity meter panel: current mm/h at the picked cell plus a
   rain graph over the whole timeline (the buienradar graph, but scrubbable —
   cursor synced with the slider). Meter reads the same decoded arrays as the
   map.
7. Look & feel: WarnWetter-inspired, mobile-first responsive, works on a
   dark basemap. Droplet favicon/logo placeholder (simple inline SVG). UI
   text in Dutch. Include a small "Bron: KNMI" attribution placeholder in the
   map corner (license requirement later). Taste within these bounds is
   yours; note notable UX decisions in your LOG.

## Out of scope

Real KNMI data, anything Rust/ingest, deploy/hosting, PWA. No server beyond
vite dev/preview serving static files. Do not touch `docs/contract.md`,
`crates/`, or `spec/`.

## Gates & receipts

- `pnpm build`, `pnpm typecheck`, `pnpm test` (vitest: mrf client decodes a
  synthgen chunk byte-exact; time-model unit tests) — all green in the
  worktree, receipts as SYNCHRONOUS exit statuses with repro commands in your
  LOG; your green is independently re-run before merge.
- End state: `pnpm dev` shows the app animating synthetic rain over the
  Netherlands with working slider, picker and meter; describe the manual
  verification steps you performed in your LOG.
