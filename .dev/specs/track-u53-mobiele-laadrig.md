# Track U53 — mobiele laadrig: PO-laadgedrag reproduceren, wire weight en decode-overhead meten (gpt-6.1-sol)

Read first: `AGENTS.md`, `.dev/proposals/0016-profielmodus.md`, `.dev/proposals/0019-laadchoreografie.md`,
`.dev/proposals/0020-intent-gedreven-laden.md`, `web/scripts/record-profile.ts` (`prof:capture
--profile`), `web/scripts/prof-top.ts`, `web/scripts/prof-check.ts`, `web/e2e/profiles.ts`
(mobile-4g/mobile-fast-3g: netwerk + CPU-throttling), `web/e2e/decode-budget.spec.ts`,
`web/e2e/playback.ts`, `web/src/core/perf.ts` (fasen, LoAF, netwerktotalen uit Resource Timing),
U49-/U52-LOG, de echte PO-opnames in `~/motregen-profiles/` (Android-Chrome
`2026-10-07T10:01:39.411Z-linux-armv81.json`, Android-Firefox `…10:02:26…`, Pixel-emulatie
`…09:22:05…`). LOG: `.dev/tracks/u53-mobiele-laadrig/LOG.md` (committed, append-only,
timestamped). Branch `track/u53-mobiele-laadrig` vanaf main. Eigen worktree. Vandaag: 2026-10-07.
**U52 loopt parallel** (tijd-majeur + intent-planner in `mrf.ts`/`decode-queue.ts`/`App.tsx`):
raak die bestanden niet aan; jouw rig meet ze. Dit is een meetrig: eerlijkheid boven snelheid.

## Doel

Eén commando, `pnpm perf:mobile [--profile mobile-4g|mobile-fast-3g] [--scenario koud|journey]
[--baseline]`, dat deterministisch (synth-data of een gepinde prod-manifestkopie, geen live
netwerk) de lading van de PO's telefoon nabootst en een JSON-rapport + markdown-tabel schrijft:

| maat | bron |
| --- | --- |
| TTFR, splash weg, window-ready per veld (U52-meetpunt), ttfh (histogram nu±1 u compleet) | perf-marks |
| decodes (aantal, totale ms, p50/p95) per veld | fasen |
| **wire weight**: bytes en requests per soort (manifest, chunks, tiles, overig), aantal Range-requests, bytes vóór TTFR, bytes vóór ttfh, bytes totaal na 30 s, gemiddelde requestgrootte | Resource Timing + Playwright-netwerklog |
| lange frames (aantal, totale blokkeertijd, top-3 bronnen via prof:top) | LoAF + samples |
| hoofddraad-bezetting (% samples niet idle) | Self-Profiling |

Een gecommitte baseline per profiel en scenario (`web/perf/baselines/<profiel>-<scenario>.json`,
met sha en datum) en een `--compare` dat de delta toont en een exit ≠ 0 geeft als wire weight
of decodes meer dan X % stijgen (X in de baseline, voorstel 10 %). Dit is het gereedschap waarmee
U52 (tijd-majeur + intent) zijn ombouw en de overhead ervan aantoont.

## Opdracht

1. **Getrouwheid eerst**: vergelijk de rig met de echte PO-opnames (zelfde maten: decodes per
   seconde-histogram, fasen-p50, bytes). Documenteer per maat hoe ver de emulatie van de echte
   Pixel/Android af zit en kalibreer CPU-throttle en netwerk tot de decode-tijdverdeling binnen
   ~30 % van de echte Android-Chrome-opname ligt. Wat niet te reproduceren is (GPU, thermisch),
   benoem je expliciet.
2. **Scenario's** als data, niet als code: koude start (30 s stil), journey (koude start →
   scrub 2 u vooruit → afspelen 10 s → modus wind → terug), modus-wissel-storm (Weer→Lucht→
   Gevoel→Wind binnen 5 s, meet wat er onnodig geladen is). Deterministische klok waar mogelijk.
3. **Wire weight** uit twee bronnen die elkaar moeten bevestigen: Resource Timing in de pagina
   en Playwright's request/response-log (encoded body size, Range-headers). Verschil > 2 % is
   een bevinding, geen afronding.
4. **Rapport** in `docs/perf.md` §Mobiele laadrig: hoe draaien, wat de maten betekenen, de
   baseline-tabel op main van vandaag. Baselines committen (klein JSON).
5. Gates: `pnpm typecheck`, `pnpm test` (unit voor rapport/compare), de rig zelf 3× achter
   elkaar met < 5 % spreiding op decodes en bytes (anders: eerst determinisme repareren), onder
   een e2e-slot. Synchrone exit statussen in de LOG. Draft-PR vroeg.

## Afbakening

Geen productcode-wijzigingen; geen live-netwerk in de rig. Leesbaarheidsbar: geen één-letternamen,
geen slimme one-liners, commentaar alleen voor een niet-triviaal waarom.
