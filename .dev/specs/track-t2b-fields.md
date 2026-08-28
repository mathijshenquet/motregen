# Track T2b — extra velden in de ingest (gpt-5.6-sol)

Read first: `AGENTS.md`, MIP-4 (accepted, incl. het wind-amendement in de
changelog), `docs/contract.md` (nieuwe veldenlijst + versoepelde
quant-regel), `docs/arome.md`, `docs/fields.md` (bestaat nog niet — jij
maakt hem), `.dev/tracks/t2-ingest/LOG.md` (hoe de daemon in elkaar zit).
Your LOG: `.dev/tracks/t2b-fields/LOG.md`. Branch: `track/t2b-fields`.
API keys in `.env` in deze worktree.

## Goal

De ingest-daemon publiceert naast regen ook: `temp_c`, `feels_like_c`,
`wind_u_ms`/`wind_v_ms`, `radiation` en `uv` — conform het contract, zodat
de frontend (parallel track T3c) van synthetisch naar echt kan schakelen.

## Tasks

1. **AROME-parameters.** Identificeer in de al ge-downloade per-leadtime
   members: 2m-temperatuur, 10m U/V-wind, globale straling (en check of
   relatieve vochtigheid/dauwpunt beschikbaar is t.b.v. gevoelstemperatuur
   bij warmte). Zelfde ruwe-GRIB1-sleutels-aanpak als T1; documenteer alles
   (paramId, level, step type, eenheid) in `docs/arome.md`. Uitbreiding van
   de bestaande ranged-tar download — meet hoeveel extra MB dit kost.
2. **Afgeleiden.** `feels_like_c` serverside: JAG/TI-windchill onder ~10 °C
   met wind, hitte-index bij warmte, anders ≈ temperatuur; exacte formules +
   bronvermelding in `docs/fields.md`. Wind blijft als U/V-paar (contract:
   identiek grid/tijden/volgorde — bouw daar een test voor).
3. **UV.** Nieuwe dataset-ingest: cloud-modified UV index (KNMI Data
   Platform, Benelux-grid, per 15 min, 03:00–21:45 UTC; ontdek de exacte
   API-naam/formaat en documenteer). Publiceer als veld `uv` op het gedeelde
   grid (grove resolutie prima). Buiten het tijdvenster: geen chunks — de
   client gaat daar netjes mee om (T3c).
4. **Resoluties.** Uurvelden op gereduceerde resolutie per MIP-4 (bijv. 2×
   of 4× subsampling; wind mag fijner als de particle-viz dat nodig heeft —
   kies op bytes-vs-kwaliteit en documenteer de afweging). Kwantisatie per
   veld: ontwerp passende tabellen (temp bijv. -30…+45 °C lineair 0,3 °C;
   wind symmetrisch rond 0; uv 0…12) en versoepel de
   `quant[0]==0`-validatie in `crates/mrf` conform het contract-amendement
   (alleen index 255 = null universeel; regel per veld). Rain/radiation
   blijven byte-identiek.
5. **Daemon + manifest.** Nieuwe chunks in dezelfde atomaire publicatie;
   cadans: uurvelden bij elke AROME-refresh, uv per kwartier-batch.
   Pruning meegroeien. `Caddyfile.dev` hoeft niet te wijzigen.
6. **Cross-checks.** Python-referentie (cfgrib/h5py) voor minstens temp en
   wind-U op één leadtime, elementgewijs binnen één kwantisatiestap —
   zelfde receipt-stijl als T2.

## Out of scope

Frontend (`web/`), wolkensymbolen-afleiding (latere track), deploy.
`docs/contract.md` niet wijzigen; ambiguïteit → WALL in je LOG.

## Gates & receipts

- Workspace `cargo fmt --check` / `clippy -D warnings` / `cargo test` green;
  SYNCHRONE receipts (pipefail!) + repro in je LOG; onafhankelijke re-run
  volgt voor merge.
- E2e: daemon-run die alle nieuwe velden publiceert; `mrf inspect` per
  veldtype; manifest-validatie; de wind-paar-invariant getest.
