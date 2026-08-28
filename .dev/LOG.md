# motregen — orchestrator log (newest first)

## 2026-08-28 — T2a merged (luna!); HAR-bug diagnosed → T3b steer; dev topology

- T2a delivered (14m41s) — but the pane footer read `gpt-5.6-luna low`, NOT
  terra: the herdr queued-prompt model-switch artifact struck again (likely my
  contract soft-steer). Verified extra hard: full gates re-run green
  (7 property tests), quant formula matches spec exactly, AND a
  cross-implementation check: Rust CLI decodes sol's TS synthgen chunk, frame 0
  = exactly width×height bytes. zstd level 19 chosen on measurement. Merged
  with Cargo workspace union (glob members, resolver 3); positive luna-low
  datapoint for tight-spec Rust work. LESSON (mine): first merge-gate receipt
  was false-green via `cargo test | grep` without pipefail — always
  `set -o pipefail` or echo the exit INSIDE the inner shell.
- knmi-grib conformance test hard-fails without data/ fixture (1.2 GB in T1
  worktree; copied to main checkout). Follow-up for T2: fixture strategy
  (self-skip with loud message, or small committed fixture).
- PO HAR analysis (tmp/click_har.log, gitignored): one location click
  re-fetches the whole timeline per frame (83×206 per click). Cause: LRU 32 <
  85 timeline frames + meter samples all frames per click → thrash. T3b
  steered: cache holds full timeline, zero-network second click + test, chunk
  coalescing (>50% of frames → one request), build.sourcemap true.
- Dev topology per PO wish (poke testing): 4173 now runs `pnpm dev` (HMR,
  sourcemaps) from the main checkout, /data served by vite with Range 206
  verified. Real split (data as separate origin + proxy) lands with T2 per
  MIP-3; recorded as T2 spec requirement.

## 2026-08-28 — MIP-4 draft; T1 profiling follow-up merged

- PO refined the sun idea: it's "moet ik me insmeren" (zonkracht/UV, low
  spatial specificity fine), asked about KNMI sun-icon semantics (answered:
  deterministic cloud+precip summary, not a probability), added temp +
  feels-like as map layers, and set the constraint "veel info, niet
  overweldigend" → wrote MIP-4 (informatielagen): one map field at a time
  (rain default + cycler), detail lives in the hourly table, relevance-gated
  chips (insmeer-chip only at UV≥3), extra fields via the contract `field`
  mechanism at reduced resolution, UV as proxy from radiation+solar elevation
  until an official zonkracht source is found. Three open questions for PO.
- T1 profiling follow-up (PO-driven, sol, 4m57s): −0.76% instructions via
  selector short-circuit, peak heap ~4 MB, churn dominated by ecCodes message
  scan; custom GRIB1 scanner sensibly declined (10× under latency bar).
  Gates independently re-run green; follow-up commits merged to main.

## 2026-08-28 — PO visual review → T3 merged; contract field-amendment; T3b

- PO reviewed the preview and gave UX round 1: histogram must BE the scrubber;
  search box missing; layout pass; hourly forecast table incl. sun activity;
  light mode default with a light/system/dark cycler; basemap less
  traffic-focused (no roads). Direction approved implicitly → merged T3
  (PR #1) to main.
- Sun in the hourly table needs a second data field → additive contract
  amendment: optional `field` key (default `rain_rate`), new `radiation`
  (W/m²); MIP-2 §5 rain-rate-only besluit amended (changelog). Backwards
  compatible so terra's in-flight T2a stays valid; terra gets a soft steer to
  optionally include the key in serde types.
- Wrote `.dev/specs/track-t3b-ux-round1.md` (sol): the seven PO changes incl.
  PDOK Locatieserver for search (free, no key, NL-authoritative).
- PO sent T1's pane a perf follow-up himself (Python-vs-Rust delta; why not
  faster) — watcher armed on that pane; any new commits on the merged t1
  branch will need a follow-up merge.
- T2 spec (ingest daemon) queued on T2a landing; will include radiation
  extraction from AROME + download/cadence strategy for the hourly 868 MB tars.

## 2026-08-28 — T3 done+verified (awaiting PO eyes); T1 done+verified+MERGED

- T3 (sol, 8m09s): full shell on synthetic data, PR #1. Independently re-ran
  all gates green (synthgen/typecheck/4 tests/build, exit 0 observed
  synchronously); read mrf.ts — contract-conform incl. Range+progressive and
  non-206 fallback. Preview for PO at http://ageq-mthq:4173 (vite allowedHosts
  fix committed on the track branch; note: `fuser` does not exist on this box —
  kill listeners via `ss -tlnp` pid instead). Merge waits on PO visual check.
  Polish note: ~1 MB bundle (MapLibre) → code-split later.
- T1 (sol, 13m24s): GRIB gate PASSED — knmi-grib crate (eccodes FFI) exactly
  matches cfgrib over all 152,100 values; +1…+24 h decode+de-accumulate median
  0.19 s (bar 2 s). Independently re-ran fmt/clippy/test green incl. the
  elementwise conformance test. PR #2; MERGED to main (clean; devenv.nix grew
  bindgen/libclang env). Key discoveries for T2: AROME publishes an ~868 MB
  run-tar EVERY HOUR (not 4×/day); param = GRIB1 table 253/param 61
  accumulated → hourly de-accumulation; 390×390 lat-lon grid. MIP-1 changelog
  amended accordingly.
- Next: T2 spec (ingest daemon: rtcor+nowcast HDF5, AROME cadence/download
  strategy, reproject to shared grid, mrf encode + manifest) once T2a (terra,
  still working) lands and merges; T3 merge after PO look.

## 2026-08-28 — codex re-auth incident; MIP-3; T2a launched

- Incident: a codex re-auth wiped `~/.codex/config.toml` defaults → workers
  started asking approval per command prefix. Restored defaults
  (approval_policy never, danger-full-access, sol/high) + trusted the herdr
  worktrees dir; Mathijs additionally set both sessions to yolo and restarted
  them himself with continue-prompts. Both T1/T3 confirmed working again.
  Lesson: after any codex re-auth, CHECK config.toml before launching workers.
- PO asked: map track? codec track (server+client)? and ultra-cheap hosting
  (Hetzner/Cloudflare; in-memory serving?). Answers: map is already in T3;
  client mrf decode is in T3; server-side mrf encoder now split off as T2a
  (terra, tight spec — format fully pinned); video-codec epsilon stays gated
  on real frames per MIP-2. Hosting → wrote MIP-3 draft (origin box + Caddy
  static + Cloudflare free, HTTP cache contract; no custom in-memory server —
  page cache does that already). Awaiting PO on MIP-3's three questions.
- Wrote `.dev/specs/track-t2a-mrf-core.md` (quant table v0 pinned: geometric
  0.01→150 mm/h over indices 1..254; zstd level measured 3 vs 19; golden
  fixtures; mrf CLI). Known merge point: workspace root Cargo.toml created by
  both T1 and T2a — orchestrator resolves at merge.
- In flight: T1 (sol), T3 (sol), T2a (terra).

## 2026-08-28 — MIP-1 accepted; contract pinned; T1+T3 launched

- PO sanctioned the stack: Rust ingest ("geen super positieve ervaring met
  Python"), and asked for (a) an immediate sol spike on AROME GRIB parsing with
  the Python library as executable conformance spec — "snel en conform" — and
  (b) an immediate frontend scaffold. On shadcn he said "ook ok" (permissive);
  PM call: staying with MIP-1's SolidJS + Tailwind v4 without shadcn.
- MIP-1 flipped to accepted (§5 records the sanction).
- Pinned `docs/contract.md` (manifest v0 + mrf v0: magic/len/JSON-header with
  frame-offset-index + quant table, independent zstd members, Range +
  progressive decode) so T1/T2 and T3 build against the same wire format
  without coordination.
- Seeded devenv at repo root (rust, node/pnpm, eccodes, hdf5, pkg-config, uv,
  zstd) so parallel tracks don't invent competing envs. Note: transient DNS
  failures on github.com via MagicDNS broke two devenv builds; also, devenv
  can exit 0 while the underlying nix fetch failed — check for devenv.lock as
  the real receipt.
- Wrote `.dev/specs/track-t1-arome-spike.md` (sol; GRIB gate + Python
  reference harness + speed bar ≤2 s) and `.dev/specs/track-t3-frontend-shell.md`
  (sol; shell on synthetic data per contract).
- KNMI license question from PO: all used datasets are CC-BY 4.0 → any use
  incl. commercial is fine with attribution; "Bron: KNMI" requirement added to
  the T3 spec. Use-case field on key registration is informational only.
- Open with Mathijs: drop KNMI keys in `.env` (T1 falls back to the saturated
  anonymous key otherwise). Open for agents: T1 + T3 in flight.

## 2026-08-28 — MIP-2 accepted

- PO adopted MIP-2 with calls: intra-only (YAGNI), quantization floor stays at
  0.01 mm/h (display threshold is a frontend concern), rain rate only. He asked
  for frame-range requests and ideally progressive decode → format amended at
  adoption: fixed-size header with a frame-offset-index (byte offset + length
  per compressed frame), frames as independent zstd members ⇒ HTTP Range on
  arbitrary frame ranges + decode-as-bytes-arrive; reserved per-chunk
  dictionary field for later cross-frame wins (empty in v1).
- PO also noted RainViewer runs on maplibre-gl and looks fine — supports the
  MIP-1 map choice.
- Open with Mathijs: MIP-1 §4 stack sanction (Rust + SolidJS/Tailwind) and the
  two KNMI keys (Open Data API + Notification Service). Open for agents:
  T-specs start the moment MIP-1 lands.

## 2026-08-28 — PO-ronde 1 op MIP-1

- PO answered MIP-1: 3 h history, +24 h midcast (not 48), dev on ageq-mthq +
  dedicated box later, domain already via Porkbun, droplet logo, everything in
  Dutch. Asked for a serious Rust-vs-Python weighing and frontend
  framework/styling proposals (React vs SolidJS vs frameworkless; shadcn vs own).
- Revised MIP-1 (now in Dutch): recommendation flipped to Rust ingest
  (hdf5-metno + eccodes FFI; T1 must decode one AROME GRIB end-to-end as the
  ontbindende voorwaarde; Python stays as uv-based throwaway explorer and T2
  cross-validator). Frontend: SolidJS + Tailwind v4, no shadcn; core
  (decoder/WebGL/time model) framework-free TS so the shell stays swappable.
  Decisions recorded in §5; sole remaining open question = stack sanction.
- MIP-2 and proposals README translated to Dutch; AGENTS.md updated.
- KNMI portal check: Open Data API and Notification Service are separate key
  requests; EDR/WMS not needed. PO registers both keys.
- Open with Mathijs: stack sanction (MIP-1 §4), MIP-2 adoption + its three open
  questions, the two KNMI keys. Open for agents: still nothing until adoption.

## 2026-08-28 — kickoff: research + founding proposals

- PM/PO kickoff (Mathijs = PO, fable = PM/orchestrator, codex sol/terra = workers).
- Verified KNMI data coverage for the unified slider: `nl_rdr_data_rtcor_5m` 1.0
  (history, archive since 2018-12), `radar_forecast` 2.0 (pySTEPS, 25×5 min),
  `harmonie_arome_cy43_p1` 1.0 (hourly to +60 h). Found the seamless 6 h ensemble
  blend product (post-MVP candidate). API: list + presigned URL per file; MQTT
  notification service preferred over polling.
- Anonymous API key is rate-limit-saturated (every probe today 429'd, incl. after
  60 s backoff) → registered key required. PO action.
- Repo scaffolded: jj colocated, `.claude/CLAUDE.md` → `AGENTS.md`, MIP process
  (lightweight composix-CIP variant, flat `.dev/proposals/` per Mathijs).
- Wrote MIP-1 (MVP architecture: Python/uv ingest → shared-grid 8-bit frames +
  manifest → static serving → Vite/TS/MapLibre/WebGL frontend; tracks T0–T5) and
  MIP-2 (mrf binary format, intra+zstd; video-codec idea preserved as measured
  epsilon track). Both Status: draft — awaiting PO.
- Open with Mathijs: adopt/answer MIP-1 + MIP-2 open questions; KNMI key;
  motregen.nl domain. Open for agents: nothing until MIPs land.
