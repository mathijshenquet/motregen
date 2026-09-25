# Track U36 — windstoten in de kolom Wind + eenheidsinstelling Bft/knopen/km/u/m/s (claude opus 5.5)

Read first: `AGENTS.md`, `.dev/proposals/0014-kolommen-en-extra-lagen.md`, `docs/arome.md`
(parameter 162/163 @ 10 m, `timeRangeIndicator` 2 = maximale stoot over het uur, m/s-componenten),
`crates/ingest/src/pipeline.rs` (`wind_u_ms`/`wind_v_ms` als sjabloon; U35 voegt parallel
`pressure_hpa` toe — houd je ingest-diff klein en rebase vaak), `web/src/core/weather.ts`
(`summarizeWind`), `web/src/components/ForecastTable.tsx` (kolom Wind: pijl + Bft), `About.tsx`
(sectie Weergave = de instellingen), `web/src/core/usage.ts` (baken-contract). LOG:
`.dev/tracks/u36-windstoten-eenheid/LOG.md`. Branch `track/u36-windstoten-eenheid` vanaf main.

## Opdracht

1. **Ingest**: uurveld `gust_ms` (scalaire stootsnelheid = |(162,163)|, m/s, kwantisatie 0,5 m/s
   tot 60) op het 6 km-raster, zelfde chunking/codec als de andere uurvelden. Contract/docs.
2. **Kolom Wind**: `pijl 3 Bft · 45` → de stoot klein achter de hoofdwaarde, alleen als de stoot
   ≥ hoofdwaarde + 1 eenheidsstap (anders ruis); in de eenheid van de instelling.
3. **Eenheidsinstelling** in de About-modal onder Weergave: Bft (default) / knopen / km/u / m/s;
   opslag `motregen-wind-unit`; geldt voor kolom, scrubber-readout in windmodus (U28 later) en
   de tooltip. Baken-veld `unit` (MIP-13-contract + docs/analytics.md + `contract.jq` bijwerken,
   `v` blijft 1 — nieuw veld met eigenaar U36).
4. Laden: `gust_ms` alleen ophalen als de tabelkolom Wind zichtbaar is (dat is altijd, dus: met
   de andere uurvelden mee; meet de bytes).
5. Tests: ingest-unit, `summarizeWind`-unit per eenheid, e2e `table.spec` (desktop): stoot
   zichtbaar en eenheid wisselt. Stills desktop/Pixel 5.

## Gates

`cargo test`, `nix flake check`, `pnpm typecheck`, `pnpm test`, `pnpm build`, gerichte e2e
`--project desktop`. Synchrone exit statussen in de LOG. Draft-PR vroeg.
