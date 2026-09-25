# Track U38 — kolomset: kern + extra kolommen (RV eruit, zicht/luchtkwaliteit/pollen erbij) met paging (claude opus 5.5)

**Start na de merge van U36** (kolom Wind + eenheidsinstelling) en met U39's velden in het
manifest (pollen/luchtkwaliteit mogen ontbreken: kolom dan verborgen).

Read first: `AGENTS.md`, `.dev/proposals/0014-kolommen-en-extra-lagen.md` (PO-richting +
22:30: "RV uit het standaardlijstje; tabel gepaged/gescrold voor de extra items"),
`web/src/components/ForecastTable.tsx`, `About.tsx` (Weergave), `usage.ts`, `docs/arome.md`
(zicht: parameter 20 @ sfc, m). LOG: `.dev/tracks/u38-kolomset/LOG.md`. Branch
`track/u38-kolomset` vanaf main.

## Opdracht

1. **Kern** (altijd): Weer (uur + icoon + regen), Gevoel, Wind. **Extra** (uit, per stuk aan te
   zetten onder Weergave): UV, RV, Zicht, Luchtkwaliteit, Pollen. Opslag `motregen-columns`;
   baken-veld `cols` (lijst van aangezette extra kolommen; MIP-13-contract bijwerken).
2. **Zicht**: ingest `visibility_m` (parameter 20, kwantisatie 100 m tot 20 km, 8 bit is genoeg
   met een log-schaal); kolom toont km met één decimaal onder 10 km en "> 10" daarboven; het
   weericoon krijgt een mist-variant bij < 1 km en nevel bij < 5 km óók als de kolom uit staat
   (de PO-vraag "hoe zou jij zicht doen": alleen opvallen als het ertoe doet).
3. **Paging**: de extra kolommen staan op een tweede "pagina" van de tabel: op desktop naast de
   kern als er breedte is, anders (en op mobiel altijd) horizontaal te swipen/paginaknop
   ("meer ›") met sticky eerste kolom; de kop toont een puntjes-indicator. Geen verticale
   tabel-scroll bovenop de pagina-scroll.
4. About: één regel attributie voor CAMS als een van die kolommen aanstaat.
5. Tests: unit voor kolomselectie/opslag; e2e `table.spec` (desktop): RV standaard weg, kolom
   aanzetten toont hem, paging op smal venster. Stills desktop/Pixel 5.

## Gates

`cargo test` (zicht-ingest), `nix flake check`, `pnpm typecheck`, `pnpm test`, `pnpm build`,
gerichte e2e `--project desktop`. Synchrone exit statussen in de LOG. Draft-PR vroeg.
