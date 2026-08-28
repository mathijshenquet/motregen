# Track T2a — mrf core crate (gpt-5.6-terra)

Read first: `AGENTS.md`, `.dev/proposals/0002-frame-transport.md` (accepted),
and `docs/contract.md` — the authoritative wire format. If the contract is
ambiguous or blocks you, record it in your LOG and ask the orchestrator via a
clear WALL entry; do NOT change `docs/contract.md`. Your LOG:
`.dev/tracks/t2a-mrf-core/LOG.md` — append-only, timestamped, committed with
your work.

## Goal

`crates/mrf`: the Rust encoder + decoder for mrf v0 chunks, shared core for
the upcoming ingest daemon (T2) and tooling. Server-side counterpart of the
TS client decoder being built independently in T3 against the same contract.

## Context

- Worktree on branch `track/t2a-mrf-core`. Env: devenv + direnv at repo root
  (rust toolchain, zstd); first `cd` may still build — retry.
- Track T1 concurrently creates the workspace root `Cargo.toml` and
  `crates/knmi-grib` on its own branch. Create the root `Cargo.toml` yourself
  if absent (`members = ["crates/*"]`, keep it minimal); the orchestrator
  resolves the trivial merge. Do not touch `crates/knmi-grib`.
- No network/API work in this track.

## Tasks

1. `crates/mrf` lib per the contract: serde types for the JSON header
   (grid, quant, frames, dict), `encode(frames, meta) -> Vec<u8>` and two
   decode paths: (a) full-buffer decode, (b) header-only parse + per-frame
   access by offset/len — path (b) mirrors how the web client uses Range
   requests, and both must agree.
2. Quantization v0 (document in `docs/mrf.md`): table[0] = 0.0;
   for i in 1..=254: `0.01 * (150.0/0.01)^((i-1)/253)` mm/h (geometric ramp,
   floor 0.01, top 150); index 255 = no-data. Provide the table generator and
   `quantize(f32) -> u8` with an exactly documented rule (values below half of
   table[1] → 0; above table[254] → 254; otherwise nearest table value; NaN →
   255). The header always carries the table; nothing downstream may assume
   this curve.
3. zstd (`zstd` crate), each frame an independent member per the contract.
   Compression level: measure at least levels 3 and 19 on representative
   synthetic sparse fields (~5–10% coverage, smooth advecting blobs) and pick
   with a one-line rationale in `docs/mrf.md` (chunks are write-once
   read-many).
4. Tests: roundtrip property tests (dry frames, full no-data, heavy cells,
   85-frame chunks), header/offset invariants (`header_len == 8 + H`,
   offsets/lens exactly tile the payload), and a small deterministic golden
   chunk committed as fixture with a byte-exact decode test.
5. CLI bin `mrf` (in the crate): `inspect <chunk>` (header + frame table),
   `encode` from a simple documented raw input (e.g. .npy f32 or raw
   width×height f32 + JSON meta), `decode <chunk> <frame-idx>` to raw —
   for pipeline debugging in later tracks.

## Out of scope

KNMI download/parsing, GRIB/HDF5, reprojection, manifest generation, the
video-codec experiment, anything frontend. Do not touch `docs/contract.md`,
`crates/knmi-grib`, `spec/`, or `web/`.

## Gates & receipts

- `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings`,
  `cargo test` green in the worktree; receipts are SYNCHRONOUS exit statuses
  with exact repro commands in your LOG. Your green is independently re-run
  before merge.
