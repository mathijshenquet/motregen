# Track U18 — gevoelstemperatuurveld als laagfrequente DCT (ingest + client) (claude opus)

Read first: `AGENTS.md`, `.dev/proposals/0002-frame-transport.md` (MIP-2, mrf-
contract), `docs/mrf.md`, `docs/contract.md`, `docs/fields.md`, `docs/data-
dieet.md`, `crates/mrf/src/lib.rs`, `crates/ingest/src/pipeline.rs`
(`hourly_field_chunks`, `HOURLY_GRID` 6 km 209×225, kwantisatie),
`crates/ingest/src/publisher.rs` (manifest), `web/src/core/mrf.ts`
(client-decoder, `LruCache`), `web/src/core/isoline-field.ts`/`isoline-
contours.ts` (U13: uurvelden als B-spline-controlepunten), `web/src/core/
temperature.ts` (stadslabels lezen hetzelfde veld), `.dev/tracks/u13-
isolijnen-analytisch/LOG.md` §"meting A/B/C" (DCT K=16/32/64: ringen, rms,
max °C; ingest-voorstel). Your LOG: `.dev/tracks/u18-dct-veld/LOG.md` —
committed, append-only, timestamped. Branch `track/u18-dct-veld` vanaf
main. Eigen worktree.

## PO (2026-09-24)

"DCT-coëfficiënten lijkt me sowieso top, 30 KiB besparen is nice." (Per
uurframe ~47 kB nu; K=64 ≈ 8 kB f16, K=32 ≈ 2 kB.) Het is een compact
analytisch veld: smoothing zit in de afkap, blenden in tijd = coëfficiënten
blenden, en de client bouwt er eenmalig per uurframe een grid uit.

## Opdracht

1. **Ontwerp** (kort, in LOG + `docs/fields.md`/`docs/mrf.md`): nieuw veld
   `feels_like_dct` (en, als het gratis meegaat, `temp_c_dct`) als extra
   chunk per dagdeel/hist-run naast de bestaande bitmapchunks (contract-
   compatibel: oude clients negeren onbekende velden — verifieer dat in
   `buildTimeline`/`Manifest`-typen). Payload per frame: 2D-DCT-II van het
   6-km-veld (no-data eerst ingevuld met naaste-buur/gemiddelde, masker
   apart of impliciet via het bestaande grid), K×K laagfrequente
   coëfficiënten, kwantisatie f16 of int16 met schaal per frame; zstd zoals
   mrf. Kies K op U13's curve (rms t.o.v. blur-2-referentie ≤ ~0,25 °C,
   geen lijnverschuiving > ~2 °C-equivalent aan de kust) — meet zelf op
   ≥ 3 runs, rapporteer bytes én fout per K (16/24/32/48/64).
2. **Ingest (Rust)**: DCT via een eigen kleine implementatie of `rustdct`
   (nieuwe dependency → Cargo.lock wijzigt → `nix flake check -L` bij
   merge; motiveer). Unit tests: round-trip op synthetisch veld, byte-
   determinisme, no-data-masker.
3. **Client**: decoder in `mrf.ts`/nieuwe `dct.ts` (IDCT naar het 209×225-
   grid in de worker, één keer per uurframe, gecachet), daarna ongewijzigd
   de U13-B-spline-pijplijn en de stadslabels. Gebruik het DCT-veld als het
   in het manifest zit, anders de bitmap (feature-detectie, geen breaking
   change). Meet: bytes passief (e2e-budget), decode-tijd per frame
   desktop/mobiel, en visueel verschil isolijnen bitmap vs DCT (screenshots
   z6/z9).
4. Synthgen (`web/scripts/synthgen.ts`) levert ook DCT-chunks zodat e2e/
   synth het pad dekt.

## Gates

Rust: `cargo fmt --check`, `cargo clippy --workspace -- -D warnings`,
`cargo test --workspace`; als `Cargo.lock` wijzigt: `nix flake check -L`
(lang, meld het). Web: `pnpm typecheck`, `pnpm test`, `pnpm build`,
`MOTREGEN_E2E_PORT=4342 MOTREGEN_E2E_DATA_PORT=8342 pnpm e2e` (hostlock,
load < 16, één Chromium) green; synchrone exit statussen in LOG.
Live daemon `--once` tegen de echte API met de key uit `.env` en
`spec/validate_manifest.py`. Draft-PR vroeg. Geen codex. U16 (isolijnen-
polish) en U17 (UI) werken parallel — raak `isoline-layer.ts`/labels niet,
alleen de veldbron.
