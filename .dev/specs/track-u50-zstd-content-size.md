# Track U50 — ingest: zstd met content size voor álle frames (gpt-5.6-terra)

Read first: `AGENTS.md`, `crates/mrf/src/lib.rs` (rond regel 334–345: `compress`-closure; pred-
frames gebruiken al `zstd::bulk::compress`, ruwe frames en motion-members (rond regel 376) nog
`zstd::stream::encode_all`), `docs/mrf.md`, `web/src/core/mrf.ts` (`decodeFrame` met `fzstd`),
U49-LOG `.dev/tracks/u49-decode-budget-mobiel/LOG.md` (entry 10:02Z: de meting). LOG:
`.dev/tracks/u50-zstd-content-size/LOG.md` (committed, append-only, timestamped). Branch
`track/u50-zstd-content-size` vanaf main. Eigen worktree. Vandaag: 2026-10-07.

## Waarom

U49 mat dat `fzstd` een frame zonder content size in de header decodeert met een 8 MiB-venster;
met content size (pledged size, `zstd::bulk::compress`) decodeert dezelfde data 2,2–2,5× (regen),
4,5–5× (temperatuur/wind) en ~20× (wolkenlagen) sneller, voor +3 B per frame, byte-gelijke
uitvoer. Op een telefoon is decode de grootste post (p50 ~20 ms per frame).

## Opdracht

1. Vervang `zstd::stream::encode_all` door `zstd::bulk::compress` voor ruwe frames én motion-
   members; één helper, één regel herkomst (deze track + het U49-cijfer). `COMPRESSION_LEVEL`
   ongewijzigd.
2. Test in Rust: elk member in een gebouwde MRF heeft een zstd-frame met bekende content size
   (lees de header: `zstd::zstd_safe::get_frame_content_size` of de crate-API) en decodeert naar
   identieke bytes. Bestaande fixtures/goldens: als `docs/mrf.md` of tests byte-exacte chunks
   verwachten, werk ze bij en noteer waarom.
3. Meet vóór/ná in de browser-decoder: klein `tsx`-script in `web/scripts/` dat met `fzstd` een
   echte chunk van elk veld (regen, temp, wind, wolken) 50× decodeert en p50 ms print; twee
   builds van de ingest op dezelfde invoer (`cargo run`-pad uit `docs/ingest.md`), uitvoer in
   de LOG als tabel. Verwacht: minstens de U49-factoren.
4. Gates: `cargo fmt --check`, `cargo clippy`, `cargo test -p motregen-mrf` (en de ingest-tests),
   `nix flake check`, `pnpm typecheck`/`pnpm test`/`pnpm build` (decoder ongewijzigd, maar meet
   het). Synchrone exit statussen in de LOG. Draft-PR vroeg.

## Afbakening

Geen wijziging aan het chunk-contract (`docs/contract.md`), geen andere crate, geen client-
wijziging. Oude chunks op prod blijven geldig (geen content size = oude pad); ze worden bij de
volgende ingest-verversing vanzelf vervangen. Leesbaarheidsbar: geen één-letternamen.
