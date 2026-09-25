# Track U35 — isobaren in windmodus (ingest `pressure_hpa` + isolijnen zoals meteorologen ze tekenen) (claude opus 5.5)

Read first: `AGENTS.md`, `docs/arome.md` (parametertabel; het +1-lid bevat **parameter 1 op
niveau 103 = luchtdruk op zeeniveau, Pa**, gemeten met `grib_ls` op
`data/HA43_N20_202608281200_00100_GB`, 2026-09-25), `crates/knmi-grib/src/lib.rs`
(`decode_arome_fields`: selectie op parameter/niveau — let op: niveau 103 is géén `sfc`),
`crates/ingest/src/pipeline.rs` (`hourly_field_chunks`, `temp_c` als sjabloon, kwantisatie-
tabellen, pred-codec uit U18b), `docs/fields.md`/`docs/contract.md` (veldregistratie),
`web/src/core/isoline-*.ts` (isolijnlaag: veld, stap, tracer, labels, temporele B-spline),
`web/src/core/focus-mode.ts` + `App.tsx` (windfocus), U8b/U13/U16/U25b-LOGs. Your LOG:
`.dev/tracks/u35-isobaren/LOG.md`. Branch `track/u35-isobaren` vanaf main. Eigen worktree.

## PO (2026-09-25, avond)

"Voor windmodus ook isobaren, zoals we nu voor temperatuur doen. Geen kleurverloop; laat het
eruitzien zoals meteorologen dat normaal doen."

## Opdracht

1. **Ingest**: nieuw uurveld `pressure_hpa` (MSLP, Pa → hPa) op hetzelfde 6 km-raster en
   dezelfde chunking/leads als `temp_c`, met de verliesvrije predictieve codec (U18b).
   Kwantisatie 0,1 hPa over 940–1060 hPa (past in de bestaande tabelvorm; documenteer in
   `docs/fields.md`). Selector: parameter 1, `indicatorOfTypeOfLevel` 103 (niet `sfc`),
   `timeRangeIndicator` 0. Contract + manifest bijwerken; oude clients negeren onbekende
   velden (controleer). Meet bytes per volledige sessie vóór/na (lossless MSLP is glad, verwacht
   klein). `cargo test`, fixture-run, `nix flake check`.
2. **Client**: de isolijnlaag parametriseren op veld en stap (nu hard `feels_like_c`/1 °C):
   in **windmodus** (gepind of hover, zoals U19) tekent hij `pressure_hpa` met stap **4 hPa**,
   labels per lijn ("1012", zonder eenheid — de conventie), geen vulling, geen desaturatie-
   afhankelijke kleur: één egale, iets donkerder lijnkleur dan de temperatuurlijnen (licht/
   donker thema), uniforme dikte, geen stippel. Temporele B-spline en de vector-tracer
   hergebruiken; labels via het bestaande ankermodel. Geen H/L-markers in deze track
   (noteer als vervolg).
3. Windparticles blijven zoals ze zijn (U34 tunet die parallel; raak `wind-layer.ts` niet aan).
   Isobaren liggen ónder de particles. Bij temperatuurmodus geen isobaren; bij geen modus geen
   van beide (zoals nu).
4. Laden: het veld pas ophalen bij de eerste windfocus (zoals `uv_clear` na de initial-fase,
   U15-les), zodat de cold-TTFR niet groeit; meet warm 0 B.
5. Tests: knmi-grib-selectietest op het echte fixture-lid (niveau 103), ingest-unit voor de
   kwantisatie, client-unit voor veld/stap-parametrisatie, gerichte e2e `focus.spec` +
   nieuwe `isobars.spec` (desktop): windfocus → isobaarlabels aanwezig, temperatuurfocus → geen.
   Stills licht/donker desktop.

## Gates

`cargo test`, `nix flake check`, `pnpm typecheck`, `pnpm test`, `pnpm build`, gerichte e2e
alleen `--project desktop` onder een slot. Synchrone exit statussen in de LOG. Draft-PR vroeg.
