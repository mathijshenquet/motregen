# Track U5 — gevoelstemperatuur zoals KNMI, switch weg (claude opus)

Read first: `AGENTS.md`, MIP-10 (`.dev/proposals/0010-gevoelstemperatuur-
knmi.md`, bindend), `docs/fields.md` §Gevoelstemperatuur,
`crates/ingest/src/pipeline.rs` (`feels_like_c`, tests rond regel 975),
`web/src/App.tsx` (`temperatureField`, `TemperatureField`, de switch-UI),
`web/src/core/temperature.ts`. Your LOG: `.dev/tracks/u5-gevoelstemperatuur/
LOG.md` — committed, append-only, timestamped. Branch:
`track/u5-gevoelstemperatuur`. Eigen worktree.

## Opdracht

1. Ingest: vervang `feels_like_c` door de KNMI-definitie uit MIP-10 §2.1.
   Verifieer eerst de exacte KNMI-formulering (drempels, windhoogte,
   dampdrukformule) via KNMI's publieke uitleg en citeer de bron in
   docs/fields.md; wijk niet stil af. Tests: windchill-, Steadman- en
   continuïteitsgeval rond 10 °C; bestaande heat-index-test vervalt met
   motivering. Meet op één live AROME-run het verschil gevoel−temp
   (min/mediaan/max over cellen) en log het: het moet nu zichtbaar ≠ 0 zijn.
2. Frontend: verwijder de temp/gevoel-switch en `temperatureField`;
   kaartlabels/meter tonen `feels_like_c` met label "gevoel"; urenoverzicht
   toont gevoel prominent en luchttemperatuur klein secundair (MIP-10 §2.2).
   Verwijder dode code en tests die alleen de switch dekten.
3. Deploy is via main (auto-upgrade 03:19); schrijf in de LOG welke
   manifestrun als eerste de nieuwe waarden bevat zodat ik dat kan checken.

## Gates

Rust: `cargo test --workspace`, `cargo clippy --workspace -- -D warnings`
(Cargo.lock hoort niet te wijzigen; zo wel: `nix flake check -L`). Web:
`pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm e2e` green. Synchrone
exit statussen in LOG. Draft-PR vroeg. Geen codex. U2 en U4 werken
parallel in App.tsx: houd je diff beperkt tot de temperatuurpaden.
