# Track U54 — laadchoreografie: splash, fog of war, histogram per balk, schermwaarheid (claude-opus-5-5, live-pane)

**Start na de merge van U42** (zelfde scrubber-/tabelcode).

Read first: `AGENTS.md`, `.dev/proposals/0019-laadchoreografie.md` (opdracht + meetkant),
`.dev/proposals/0020-intent-gedreven-laden.md`, U52-LOG (`window-ready`, Intent, per-frame
publicatie van reeksen), `web/src/App.tsx` (`setMapReady`, `PointLoadStage`, autoplay-koppeling),
`web/src/components/HistogramScrubber.tsx`, `web/src/core/perf.ts`, `web/scripts/perf-mobile.ts`
+ `web/perf/scenarios.json` (U53-rig), `.dev/specs/track-u34-wind-live.md` §Werkwijze.
LOG: `.dev/tracks/u54-laadchoreografie-live/LOG.md` (committed, append-only). Branch
`track/u54-laadchoreografie-live` vanaf main. Eigen worktree. Preview op 4355.

## Werkwijze

Per stap: bouw, **maak zelf een screenshot van het resultaat (desktop én 390 px breed) en bekijk
hem** vóór je "klaar, herlaad" meldt — "geen stills" betekent geen stills-gate voor de PO, niet
dat je zelf niet kijkt (les U47 2026-10-07: een band die op y=0 begon viel de worker niet op).

## Opdracht

0. **De lat (PO 2026-10-07, MIP-19 §De lat)**: `ttfp` — tijd tot kaart met eerste regenframe én
   lopende tijdlijn — op mobile-4g **≤ Buienradar**. Eerst meten: (a) `ttfp` op main in de rig
   (navigatiestart → eerste frame-wissel tijdens afspelen; markeer in `perf.ts`, HUD, trace,
   rig-rapport); (b) `ttfp-ref` op https://www.buienradar.nl (mobiel, koud, zelfde rig-profiel,
   drie herhalingen; detecteer het lopen van hun radaranimatie via frame-wissels van de
   radarafbeelding of hun tijdlabel) als los rig-scenario `referentie-buienradar`, resultaat in
   `docs/perf.md` met datum. Beide getallen vóór je iets verandert in de LOG.
1. **Meetpunten**: `blank-visible-ms`, `ttfh`, en `ttfr` dat op tiles + eerste regen wacht
   (plafond 1,5 s); in snapshot, HUD, trace en als rig-assertie (`blank-visible-ms == 0` na de
   splash). Vóór-meting op main in de LOG.
2. **Splash**: verbergt kaart + eerste regenlaag tot beide er zijn; nooit langer dan het plafond;
   daarna geen tweede wachtmoment.
3. **Scrubber-kader vanaf het eerste frame** (PO 2026-10-07): de scrubber tekent direct zijn
   kader — tijdas met uurlabels en dagstreepjes, nu-lijn, cursor — ook als er nog geen reeks is,
   met een rustige laadmelding ín het plotvlak ("regen laden…" / "tabel laden…", gedempt,
   geen spinner), zodat het scherm nooit een leeg blok onder de kaart toont. Zodra balken
   komen vervangt de fog/balk de melding per slot.
4. **Histogram per balk, van binnen naar buiten**, en **fog** voor slots die nog komen (gedempte
   arcering of wazige band die wegtrekt), ook voor wolkenlagen en tabelrijen (skeleton);
   kaartlagen van een modus faden in. Fog alleen voor "nog niet binnen" binnen het venster dat
   we laden; "niet nodig" is geen fog. PO kiest de vorm live.
5. **Spelen zodra het kan** (vervangt "venster compleet", MIP-19 §De lat): afspelen start als
   het frame op de cursor en het volgende frame in afspeelrichting aanwezig zijn; de intent krijgt
   de afspeelrichting als richting (regen vooruit vóór achteruit); ontbreekt het volgende frame
   dan toont het scrubber-kader de laadmelding op dat slot en loopt de cursor door zodra het er is
   — nooit een onzichtbare pauze. Uurvelden/andere modi zijn nooit een speelvoorwaarde.
   Gate: `ttfp` op de rig ≤ `ttfp-ref`, en in een PO-opname op Android.
6. Bij "klaar": unit voor de slot-classificatie, `pnpm perf:mobile --compare` (geen stijging van
   bytes/decodes), gerichte e2e desktop, stills, LOG met receipts, draft-PR.

## Afbakening

Geen tijdsneden/contract (MIP-20 p2). Leesbaarheidsbar: geen één-letternamen.

## Aanvulling (PO 2026-10-07, 18:50): rig als PO-telefoon, autonome lus naast Buienradar

Mandaat van de PO: "maak een rig die mijn mobiel nabootst, itereer daarop en houd hem naast
Buienradar. Alles zonder waarneembaar effect voor de gebruiker mag meteen door." Dus:

A. **Profiel `po-android`** in de rig (`web/e2e/profiles.ts` + `perf/scenarios.json`): kalibreer
   CPU-rem, netwerk en viewport zó dat de rig de PO-opnames in `~/motregen-profiles/*.json`
   reproduceert (Android Chrome, UA "Linux; Android 10; K", 390 px): decode p50 ≈ 21 ms,
   basemap-tile p50 ≈ 0,7–1,0 s, LoAF-profiel van de koude run 16:27:59. Leg de kalibratie vast
   (welke knop, welke afwijking per meetpunt) in `docs/perf.md`; de rig hoeft niet exact te zijn,
   wel in dezelfde rangorde van kosten. Let op: CDP-throttle remt workers niet — compenseer met
   de gemeten decode-tijd uit de opnames als weegfactor in het rapport, niet door te faken.
B. **Lus**: meet `ttfp`, `ttfp-ref` (Buienradar), LoAF eerste 12 s, decodes, wire; verbeter één
   ding; meet opnieuw; commit met vóór/ná in de boodschap; LOG-regel per iteratie. Zonder
   PO-akkoord mag alles wat **geen waarneembare verandering** geeft (laadvolgorde, planner, worker-
   verdeling, caching, bundel, textuurformaten, tile-strategie samen met U59). Alles wat de
   gebruiker wél ziet (splash, kader, fog, speelregel-gedrag, kaartuiterlijk) blijft een stap
   met PO-akkoord in de pane, zoals de spec al zegt. Twijfel = PO-stap.
C. **Volgorde**: nu stap 0/1 (meten) + A (kalibratie) + B op alles buiten `HistogramScrubber.tsx`
   en de tabel (U58 werkt daar en wordt eerst gemerged; merge daarna main en ga door). Stop niet
   na één iteratie: de lus loopt tot `ttfp ≤ ttfp-ref` of tot je eerlijk kunt zeggen waarom niet.
D. **Rapport per iteratie** in de LOG als tabel: ttfp, ttfp-ref, LoAF 12 s, decodes, wire, en
   het verschil met de vorige regel; plus de PO-opname-vergelijking als die er is.
