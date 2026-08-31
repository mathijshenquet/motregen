# Track T5b — mobiel perf-profiel in de e2e-suite (gpt-5.6-sol)

Read first: `AGENTS.md`, MIP-7 (§3 laag 2 + §5), `docs/perf.md` (de
bestaande baselines en meetdefinities), `web/e2e/` (de suite die je
uitbreidt), `.dev/tracks/t5-e2e-perf/LOG.md`. Your LOG:
`.dev/tracks/t5b-mobiel-profiel/LOG.md` — committed. Branch:
`track/t5b-mobiel-profiel`.

⚠️ Conflict-discipline: t3g-po-iteratie werkt mogelijk nog in `web/src`.
Blijf vrijwel volledig in `web/e2e/` en `docs/perf.md`.

## Goal

De vraag "wat ervaart een typische mobiele gebruiker?" meetbaar maken: de
bestaande deterministische journey draait ook onder mobiele condities, met
eigen budgetten, en de productie-site kan informatief worden doorgemeten.

## Taken

1. **Mobiel profiel** in de Playwright-suite: mid-range-Android-emulatie
   (viewport/UA/touch), CPU-throttle 4× (CDP `Emulation.setCPUThrottlingRate`)
   en netwerk-emulatie via CDP voor twee profielen: "4G" (~9 Mbps, 60 ms
   RTT) en "Fast 3G" (~1,6 Mbps, 150 ms RTT). Zelfde journey als desktop.
2. **Budgetten per profiel**, gekalibreerd op synthgen (streng maar stabiel
   green; documenteer): richtwaarden om te toetsen — TTFR < 4 s op 4G,
   < 8 s op Fast 3G; tweede klik blijft 0 requests; rapporteer daarnaast
   informatief de tijd tot volledige sessie-download per profiel (dat wordt
   het munitienummer voor het data-dieet).
3. **Live-modus**: `pnpm e2e:live` — dezelfde journey + profielen tegen een
   opgegeven origin (default https://motregen.nl), puur informatief (geen
   budget-failures; netwerk is niet deterministisch). Schrijft een
   JSON/markdown-rapportje.
4. **Nulmeting**: draai desktop + beide mobiele profielen tegen synthgen én
   live productie; leg alles vast in `docs/perf.md` naast de bestaande
   baselines (zelfde tabelvorm).

## Out of scope

Fixes aan de app zelf (het data-dieet is een aparte beslissing — jouw
metingen voeden die), Rust/ingest, CI.

## Gates & receipts

`pnpm build`/`typecheck`/`test`/`pnpm e2e` green + de mobiele profielen
twee keer achtereen green (flakiness); SYNCHRONE receipts; onafhankelijke
re-run volgt.
