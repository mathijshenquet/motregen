# Track U15 — UV: met en zonder bewolking, als "moet ik me insmeren"-bar (claude opus)

Read first: `AGENTS.md`, `docs/fields.md` §UV (KNMI-dataset
`cloud_modified_UV_index_benelux`: welke variabelen zitten in het NetCDF —
bewolkt én onbewolkt/clear-sky?), `crates/ingest/src/pipeline.rs`
(`build_uv_chunk`), `web/src/core/uv.ts` (U4: schatting vooruit uit
straling/zonshoogte, `uvAdvice`), `web/src/components/ForecastTable.tsx`
(UV-kolom), `web/src/App.tsx` (`uv-chip`), `docs/contract.md`. Your LOG:
`.dev/tracks/u15-uv-bar/LOG.md` — committed, append-only, timestamped.
Branch `track/u15-uv-bar` vanaf main. Eigen worktree. Integratie-instantie:
http://ageq-mthq:4300/ (proxy naar prod).

## PO (2026-09-24)

"UV graag opgesplitst in met en zonder wolken, met een betere visuele taal:
Google heeft een laag/middel/hoog-kleurtaal, een beetje barchart-achtig, met
de downstream-vraag 'moet ik me insmeren'. Met en zonder wolken kun je in
die bar verwerken; bij ons waarschijnlijk links-naar-rechts bars omdat de
tabel van boven naar beneden loopt."

## Opdracht

1. **Data.** Onderzoek het KNMI-NetCDF: bevat het naast de cloud-modified
   UV-index ook de clear-sky-index (of een cloud modification factor)? Zo
   ja: ingest publiceert een tweede veld `uv_clear` (zelfde kwantisatie als
   `uv`, contract-compatibel, bytes klein — meet). Zo nee: leid clear-sky af
   (Madronich-achtig uit zonshoogte/ozonklimatologie, gekalibreerd op de
   KNMI-index op wolkenloze momenten) en documenteer de fout in
   `docs/fields.md`. Vooruit (HARMONIE-uren): `uv_clear` uit zonshoogte,
   bewolkt via de bestaande U4-schatting met `cloud_frac`/straling.
2. **Visueel.** In het urenoverzicht per uur een horizontale bar (ltr):
   schaal 0–11+ met de WHO-klassen laag (1–2, groen), matig (3–5, geel),
   hoog (6–7, oranje), zeer hoog (8–10, rood), extreem (11+, paars) als
   kleurband; de bewolkte waarde als gevulde bar, de onbewolkte als
   gedempte/omlijnde bar erachter (of markering) zodat "wat het zou zijn
   zonder wolken" leesbaar is; getal erbij. Dezelfde taal in de UV-chip
   ("Insmeren" vanaf UV ≥ 3 volgens KNMI/WHO-advies, tekst uit `uvAdvice`).
   Nacht/UV 0 = lege, gedempte bar. Toegankelijk: tekstlabel + kleur.
3. Schetsen: maak 2 varianten (bar met dubbele vulling vs bar + stip voor
   clear-sky) als screenshot; kies, motiveer; PO beslist op zicht.

## Gates

Rust bij ingest-wijziging: `cargo test --workspace`, `cargo clippy --workspace
-- -D warnings`, Cargo.lock ongewijzigd (anders `nix flake check -L`); web:
`pnpm typecheck`, `pnpm test`, `pnpm build`, `MOTREGEN_E2E_PORT=4333
MOTREGEN_E2E_DATA_PORT=8333 pnpm e2e` green; synchrone exit statussen in
LOG. Draft-PR vroeg. Geen codex. U14 doet de mobiele layout van de tabel —
jij alleen de UV-kolominhoud en de chip.
