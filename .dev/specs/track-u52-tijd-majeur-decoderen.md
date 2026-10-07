# Track U52 — tijd-majeur decoderen: wachtrij op afstand tot de cursor, alle velden (claude-opus-5-5)

Read first: `AGENTS.md`, `.dev/proposals/0019-laadchoreografie.md` (§Aanbeveling 4 = de opdracht),
U49-LOG `.dev/tracks/u49-decode-budget-mobiel/LOG.md`, `web/src/core/decode-queue.ts` (+test),
`web/src/core/decode-budget.ts`, `web/src/core/mrf.ts` (`getFrames`, prefetch, puntreeksen),
`web/src/App.tsx` (prefetch-planning, `nearby`, puntreeks-effecten per veld, afspeelrichting),
`web/e2e/decode-budget.spec.ts`, `web/scripts/record-profile.ts` (`prof:capture --profile`).
LOG: `.dev/tracks/u52-tijd-majeur-decoderen/LOG.md` (committed, append-only, timestamped).
Branch `track/u52-tijd-majeur-decoderen` vanaf main. Eigen worktree. Vandaag: 2026-10-07.
U42 (tabel/modi) raakt `App.tsx` ook; houd je wijzigingen in de decode-/prefetch-laag.

## Meting (PO-opname 2026-10-07 10:02, Firefox-Android, koude start)

Decodes per seconde: 29, 111, 38, 57, 76, 135, 179, 163, 47, 27, 30, daarna vrijwel 0 — alle
~900 in 12 s, veld-voor-veld. Het wolkenhistogram verscheen pas rond t ≈ 6 s omdat de
wolkenreeksen achter regen- en puntreeksdecodes in de wachtrij stonden.

## Doel (meetbaar)

Op mobile-4g (emulatie, CPU 4×) na koude start: op elk moment t is het geladen venster rond de
cursor voor álle getoonde velden even breed (regen, motion, wolkenlagen, kolommen van de modus);
concreet: **de wolkenlagen en de tabelwaarden voor "nu ± 1 u" zijn binnen 1 s na de eerste
regen-draw beschikbaar** (nu ~6 s), en de totale decodes/decodetijd van U49 verslechteren niet.
Meet vóór/ná met `pnpm prof:capture --profile=mobile-4g` plus een nieuw meetpunt in de trace:
per veld het tijdstip waarop het venster nu±1 u compleet is (`measure` "window-ready:<veld>").

## Opdracht

1. Eén wachtrijsleutel voor alle decodes: `|frameEpoch − cursorEpoch|`, met een lichte voorkeur
   in de afspeelrichting (bijv. ×0,8 vooruit tijdens afspelen), round-robin over velden bij
   gelijke afstand, regen eerst. Cursorsprongen herordenen de wachtrij (bestaande annulering).
2. Puntreeksen (histogram, tabel) lopen door dezelfde wachtrij per frame-tijdstip, niet als
   blok per veld; het histogram mag per balk binnenkomen (Solid-signaal per index of per batch
   van 5 min), zodat U53 (fog) daarop kan tekenen. Geen UI-wijziging hier behalve dat partiële
   reeksen geen fout zijn.
3. Vooruitladen blijft binnen het U49-budget; het verschil is alleen de volgorde.
4. Tests: unit voor de sleutel/ordening (incl. afspeelrichting en sprong), `decode-budget.spec`
   groen, het nieuwe window-ready-meetpunt in `docs/perf.md`. Gates: `pnpm typecheck`, `pnpm
   test`, `pnpm build`, gerichte e2e `--project desktop` en `--project mobile-4g` onder een slot,
   vóór/ná-tabel in de LOG met synchrone exit statussen. Draft-PR vroeg.

## Afbakening

Geen fog/splash (U53), geen contract-/chunkwijziging. Leesbaarheidsbar: geen één-letternamen,
geen slimme one-liners, commentaar alleen voor een niet-triviaal waarom.
