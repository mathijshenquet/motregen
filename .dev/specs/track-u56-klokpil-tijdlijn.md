# Track U56 — klokpil: slepen = scrubben, uitgerold = tijdlijn met bronzones (claude-opus-5-5)

Feedback Maarten (2026-10-02): "tijd widget draggable maken / tijdlijn laten zien als die expand".
Read first: `AGENTS.md`, `web/src/components/Freshness.tsx` (de klokpil en het uitrollende
versheidspaneel, U21/U22/U34), `web/src/core/freshness.ts` (`sourceZone`, `freshnessStatus`),
`web/src/components/HistogramScrubber.tsx` (`onCursor`, `timelineZones`, glide), `web/src/App.tsx`
(`cursor`, `selectedEpoch`, `pauseForFreshness`), `web/src/styles.css` (`.freshness*`, `.clock*`),
`docs/perf.md` §Scrub-latency. LOG: `.dev/tracks/u56-klokpil-tijdlijn/LOG.md` (committed,
append-only, timestamped). Branch `track/u56-klokpil-tijdlijn` vanaf main. Eigen worktree. Preview
op 4345. U42 (tabel/modi) en U54 (scrubber/laadchoreografie) raken de scrubber; jij raakt alleen
Freshness/klokpil-code en CSS.

## Opdracht

1. **Slepen op de klokpil = scrubben**: `pointerdown` + horizontale beweging op de pil stuurt
   `onCursor` (zelfde pixel-per-tijd-schaal als de scrubber op dat moment, of een vaste
   jog-schaal van ~2 min per px — meet welke natuurlijk voelt, PO kiest); een tik blijft het
   paneel openen (tap-slop zoals in de scrubber); tijdens slepen pauzeert afspelen en hervat het
   na de bestaande rusttijd (1 s); cursor:ew-resize op hover, `aria`-rol slider op de pil met
   dezelfde toetsenbediening als de scrubber. Geen conflict met de verticale paginascroll op
   mobiel (`touch-action: pan-y`).
2. **Uitgerold paneel toont een tijdlijn**: een compacte strook met de drie bronzones (radar,
   nowcast, HARMONIE; kleuren uit `sourceZone`), de nu-lijn, de getoonde tijd als marker, en per
   zone de versheid (leeftijd van de laatste run) in plaats van alleen tekstregels. Bestaande
   tekst ("laatste check", bron) blijft eronder, korter. Tik in de strook springt de cursor.
3. Baken: `clockScrub` toevoegen aan `USAGE_FEATURES` (MIP-13-contract + docs/analytics.md).
4. Tests: unit voor de jog-berekening en de zone-strook; e2e `freshness.spec` (desktop): slepen
   op de pil verandert `aria-valuenow` van de scrubber; `pnpm typecheck`, `pnpm test`, `pnpm
   build`, gerichte e2e onder een slot. Draft-PR vroeg; stills desktop + Pixel 5.

## Afbakening

Geen scrubber-wijzigingen, geen About. Leesbaarheidsbar: geen één-letternamen, geen slimme
one-liners, commentaar alleen voor een niet-triviaal waarom.
