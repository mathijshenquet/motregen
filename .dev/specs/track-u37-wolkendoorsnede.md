# Track U37 — experiment: wolkendoorsnede in de weermodus van de scrubber (claude opus 5.5)

Read first: `AGENTS.md`, `.dev/proposals/0014-kolommen-en-extra-lagen.md` (PO-richting),
`docs/arome.md` (parameters 73/74/75 @ sfc = bewolking laag/midden/hoog, fractie 0–1; 71 = totaal,
al in productie als `cloud_frac`), `crates/ingest/src/pipeline.rs`, `web/src/components/
HistogramScrubber.tsx`, `.dev/specs/track-u28-scrubber-per-modus.md` (scrubber volgt de modus —
dit track is de weermodus-variant en mag U28's structuur alvast neerzetten). LOG:
`.dev/tracks/u37-wolkendoorsnede/LOG.md`. Branch `track/u37-wolkendoorsnede` vanaf main.

## PO (2026-09-25)

"Onder het weerkopje de wolkenbedekking; daar moeten we zeker mee experimenteren. Je zou de
regen kunnen vervangen door een dwarsdoorsnede van de wolken; je kunt dan de verschillende
wolkenlagen als het ware tekenen."

## Opdracht (experiment achter `?dev`, groep Kaart: "Scrubber: regen / wolken")

1. **Ingest**: drie uurvelden `cloud_low`, `cloud_mid`, `cloud_high` (fractie → %, kwantisatie
   5 %), zelfde chunking als `cloud_frac`. Laden pas als de wolkenweergave aanstaat.
2. **Doorsnede**: in de scrubber, boven de tijdas, drie horizontale banden (hoog / midden / laag,
   van boven naar beneden) waarvan de dekking per uur wordt "getekend": geen strakke balken maar
   zachte, licht gerafelde vormen (SVG-paden met een ruisrand, opacity ∝ fractie, grijstinten die
   met het thema meegaan). Regen valt eronder als de bestaande balken, lager en smaller, zodat
   "wolk → regen" leest. Nu-lijn, cursor, afspelen ongewijzigd.
3. Twee varianten als stills (desktop, licht/donker): A = doorsnede vervangt het histogram in
   weermodus; B = doorsnede als dunne strook bóven het histogram. PO kiest.
4. Unit: fractie → tekenparameters; e2e (desktop) alleen dat de weergave wisselt met de toggle.

## Gates

`cargo test`, `nix flake check`, `pnpm typecheck`, `pnpm test`, `pnpm build`, gerichte e2e
`--project desktop`. Synchrone exit statussen in de LOG. Draft-PR vroeg. Eigenaar van de dev-
toggle: U37, vervalt bij PO-keuze.
