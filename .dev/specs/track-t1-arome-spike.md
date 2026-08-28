# Track T1 — AROME GRIB spike (gpt-5.6-sol)

Read first: `AGENTS.md`, `.dev/proposals/0001-mvp-architecture.md` (§3 ingest +
§5), `.dev/proposals/0002-frame-transport.md`. Your LOG:
`.dev/tracks/t1-arome-spike/LOG.md` — append-only, timestamped, keep it
current, commit it with your work.

## Goal

Prove the MIP-1 Rust-GRIB gate: parse HARMONIE-AROME cy43 p1 precipitation in
Rust, **fast and conformant to the Python reference** (cfgrib/eccodes), leaving
behind (a) a reusable lib crate and (b) a Python conformance harness that acts
as the executable spec the Rust lib must match (PO requirement).

## Context

- Repo is jj-colocated; you work in a git worktree on branch
  `track/t1-arome-spike`; use plain git there.
- Env: devenv + direnv at repo root (rust toolchain, eccodes, hdf5,
  pkg-config, uv, zstd, jq). First `cd` may still be building the env — retry.
  Missing package? Add to `devenv.nix` and note it in your LOG.
- KNMI Open Data API:
  - list: `GET https://api.dataplatform.knmi.nl/open-data/v1/datasets/harmonie_arome_cy43_p1/versions/1.0/files?maxKeys=10&sorting=desc&orderBy=created`
  - download URL: `GET .../files/{filename}/url` (returns a presigned URL)
  - header: `Authorization: <key>`
- Key: use `KNMI_OPEN_DATA_API_KEY` from repo-root `.env` if present. The PO
  is registering keys and may drop that file mid-flight — re-check it before
  every fallback. Fallback = the shared anonymous key (below), which is often
  rate-limited during the day: back off patiently (≥60 s between attempts),
  and treat a saturated-all-day key as an honest wall, not something to hammer.
  Anonymous key:
  `eyJvcmciOiI1ZTU1NGUxOTI3NGE5NjAwMDEyYTNlYjEiLCJpZCI6IjUzYTg1ZDBhMmQ5YzRkYzJiYWNlNzQ4NTQ2Zjk4ODExIiwiaCI6Im11cm11cjEyOCJ9`
- Downloads land in `data/` (gitignored). Check listed file sizes BEFORE
  downloading and note them; one file may be large (possibly a tar bundling
  per-leadtime GRIBs — discover the real structure).

## Tasks

1. Fetch one recent `harmonie_arome_cy43_p1` file; document its structure
   (container format, per-leadtime layout, sizes) in `docs/arome.md`.
2. Identify the precipitation parameter(s): record GRIB shortName/paramId,
   units, level, step type (instantaneous vs accumulated) in `docs/arome.md`.
   End goal of the pipeline (context, not this track): rain rate in mm/h per
   hourly step to +24 h. If only accumulations exist, document the
   de-accumulation rule.
3. Python reference = executable spec: `spec/` (uv project or PEP-723
   scripts) using cfgrib/xarray: given an AROME file, extract per leadtime the
   precip field as float32 grid + grid metadata (lat-lon params), dump to a
   simple fixture format (.npy + .json). This defines conformance.
4. Rust lib crate `crates/knmi-grib` (create the workspace root Cargo.toml):
   open an AROME file, iterate GRIB messages, select the precip parameter,
   decode values + grid definition. Primary path: eccodes FFI (`eccodes`
   crate against the nixpkgs libeccodes). If FFI proves painful, evaluate the
   pure-Rust `grib` crate — decide on evidence, tradeoffs in your LOG.
5. Conformance test: a `cargo test` (may shell out to the `spec/` harness, or
   compare against committed small fixtures) that checks Rust output vs the
   Python reference elementwise on the same file. Exact match expected while
   both sit on eccodes; if a tolerance is genuinely needed, justify it in
   `docs/arome.md`.
6. Speed: wall time to decode all hourly precip fields to +24 h from one run
   (warm FS cache). Soft bar ≤ 2 s. Report the measured numbers in LOG +
   `docs/arome.md`; report honestly if the bar is missed — do not tune blindly.
7. Verdict paragraph in `docs/arome.md`: is the MIP-1 GRIB gate passed
   (Rust path viable)? Evidence, residual risks.

## Out of scope

Radar HDF5, the mrf encoder, reprojection, the ingest daemon, anything
frontend. Do not touch `docs/contract.md`.

## Gates & receipts

- Receipts are SYNCHRONOUS exit statuses you observed; leave exact repro
  commands in your LOG. Your "green" is independently re-run before merge.
- `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings`,
  `cargo test` green in the worktree.
- An honest wall is a valuable outcome — record it precisely instead of
  working around it silently.
