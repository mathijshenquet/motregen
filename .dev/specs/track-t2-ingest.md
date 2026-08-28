# Track T2 — ingest: echte regen end-to-end (gpt-5.6-sol)

Read first: `AGENTS.md`, MIP-1 §3/§5 + changelog (AROME publishes an ~868 MB
run-tar EVERY HOUR — the 4×/day assumption was wrong), MIP-2, MIP-3 §3/§5
(serving/cache contract), `docs/contract.md`, `docs/arome.md` (T1 findings:
GRIB1 table 253/param 61 accumulated, de-accumulation rule, 390×390 grid),
`docs/mrf.md` (T2a: quant v0, zstd-19). Your LOG:
`.dev/tracks/t2-ingest/LOG.md` — append-only, timestamped, committed.

## Goal

A Rust ingest daemon that turns live KNMI data into the real
`data/manifest.json` + mrf chunks: 3 h RTCOR history + latest 2 h nowcast +
AROME rain to +24 h, refreshed continuously, served on its own origin for
poke testing. Rain only — temp/UV/cloud fields are a later track (MIP-4).

## Building blocks already merged

`crates/knmi-grib` (AROME precip, conformance-tested), `crates/mrf`
(encoder + CLI, quant v0, zstd-19). API keys in repo-root `.env`
(`KNMI_OPEN_DATA_API_KEY`, `KNMI_NOTIFICATION_API_KEY`). API shape: list
files + presigned URL per file (see `.dev/specs/track-t1-arome-spike.md`).

## Tasks

1. **Shared grid.** Define the definitive shared grid (EPSG:3857 over NL +
   margin, ~1 km, near the radar native resolution) in `docs/grid.md` and a
   constant in code. Precompute nearest-neighbour index maps radar-grid →
   shared and AROME-lat-lon → shared (reprojection = gather). The
   polar-stereographic radar projection parameters come from the HDF5
   metadata — document them.
2. **Radar HDF5.** `crates/knmi-hdf5` (hdf5 crate): read
   `nl_rdr_data_rtcor_5m` (5-min accumulations, gauge-corrected → mm/h =
   ×12) and `radar_forecast` 2.0 (25 nowcast steps). Document the actual
   KNMI HDF5 structure (groups/datasets/calibration/nodata) in
   `docs/radar.md`. A small Python cross-check (h5py, like T1's harness) for
   one file of each dataset as executable spec; committed mini-fixtures so
   tests run without network.
3. **AROME strategy.** We need +1…+24 h rain from the freshest acceptable
   run WITHOUT downloading 868 MB every hour. Investigate ranged-tar partial
   download (the presigned URL supports Range; tar headers are 512-byte
   blocks → index members with a few small reads, then fetch only the ~25
   needed member files ≈ ~350 MB, or smarter). Measure and document the
   chosen strategy + cadence (default: refresh AROME every 3 h,
   configurable) in `docs/arome.md`.
4. **Daemon** `crates/ingest` (bin `motregen-ingest`): startup backfill
   (3 h RTCOR + latest nowcast + latest AROME), then poll the Open Data API
   (default 60 s for radar datasets; MQTT notification service may be a
   follow-up — document the choice), download → decode → reproject →
   quantize → `crates/mrf` encode → write chunks + manifest ATOMICALLY
   (tmp + rename), prune superseded/aged chunks. Chunk naming per contract:
   run-stamped, immutable. Config via env/flags: data dir, cadences,
   horizons.
5. **Serving for poke testing.** Add `caddy` to devenv; a committed
   `Caddyfile.dev` implementing the MIP-3 header contract (immutable chunks,
   `max-age=15` + ETag on manifest, CORS *, Accept-Ranges) serving the data
   dir on port **8080**; document the run command in your LOG and
   `docs/serving.md`. Do NOT touch `web/` — wiring the frontend to real data
   is a separate step after this track lands.
6. **Fixture hygiene** (small): make the knmi-grib conformance test SKIP
   with a loud message when `data/…_GB` is absent (instead of failing), so
   the workspace is green on a fresh clone; the full test still runs when
   the sample exists.

## Gates & receipts

- `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings`,
  `cargo test` (workspace) green — receipts are SYNCHRONOUS exit statuses
  (use `set -o pipefail` when piping) with repro commands in your LOG.
- End-to-end receipt: daemon runs ≥20 min against the live API; show ≥2
  nowcast refresh cycles in the log; `mrf inspect` on a produced chunk;
  manifest validates against the contract; one decoded RTCOR frame
  spot-checked against its Python cross-check (same cell values through the
  quant table within one quantization step).
- Honest walls (API quota, HDF5 surprises, tar-ranging dead ends) recorded
  precisely in your LOG beat silent workarounds.

## Out of scope

Fields beyond rain (temp/feels-like/UV/cloud — later track per MIP-4),
`web/`, deploy to a real box, MQTT (unless trivially done), archive backfill
beyond 3 h.
