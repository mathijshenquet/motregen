# Track U54 — laadchoreografie: splash, fog of war, histogram per balk, schermwaarheid (claude-opus-5-5, live-pane)

**Start na de merge van U42** (zelfde scrubber-/tabelcode).

Read first: `AGENTS.md`, `.dev/proposals/0019-laadchoreografie.md` (opdracht + meetkant),
`.dev/proposals/0020-intent-gedreven-laden.md`, U52-LOG (`window-ready`, Intent, per-frame
publicatie van reeksen), `web/src/App.tsx` (`setMapReady`, `PointLoadStage`, autoplay-koppeling),
`web/src/components/HistogramScrubber.tsx`, `web/src/core/perf.ts`, `web/scripts/perf-mobile.ts`
+ `web/perf/scenarios.json` (U53-rig), `.dev/specs/track-u34-wind-live.md` §Werkwijze.
LOG: `.dev/tracks/u54-laadchoreografie-live/LOG.md` (committed, append-only). Branch
`track/u54-laadchoreografie-live` vanaf main. Eigen worktree. Preview op 4355.

## Opdracht

1. **Meetpunten eerst**: `blank-visible-ms`, `ttfh`, en `ttfr` dat op tiles + eerste regen wacht
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
5. **Autoplay loskoppelen van de fase "venster compleet"** (U52-prijs op desktop 2,9 → 3,7 s):
   afspelen start zodra het afspeelvenster vooruit geladen is, niet het hele venster.
6. Bij "klaar": unit voor de slot-classificatie, `pnpm perf:mobile --compare` (geen stijging van
   bytes/decodes), gerichte e2e desktop, stills, LOG met receipts, draft-PR.

## Afbakening

Geen tijdsneden/contract (MIP-20 p2). Leesbaarheidsbar: geen één-letternamen.
