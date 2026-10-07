# Track U58 — finishing touches, live met de PO in de pane (claude-opus-5-5)

Read first: `AGENTS.md`, `.dev/LOG.md` (top), `.dev/specs/track-u34-wind-live.md` §Werkwijze,
`web/src/components/About.tsx` (Weergave: "Dag en nacht in tabel", U42), `web/src/core/cloud-section.ts`
+ `HistogramScrubber.tsx` (ingang `expressive`, U47), `web/src/core/table-appearance.ts`,
`web/src/components/Freshness.tsx` + `core/clock-timeline.ts` (U56 jog), `bot/stills.ts`,
`bot/handlers.ts`, `bot/sequences.ts`, `bot/render.ts`, `docs/telegram.md`, `web/e2e/dev-panel.spec.ts`.
LOG: `.dev/tracks/u58-finishing-touches-live/LOG.md` (committed, append-only, timestamped).
Branch `track/u58-finishing-touches-live` vanaf main. Eigen worktree. Vandaag: 2026-10-07.

## Werkwijze (live-pane, loop van minuten)

Per stap: bouw, **maak zelf een screenshot (desktop én 390 px) en bekijk hem** vóór "klaar,
herlaad"; "geen stills" = geen PO-gate, niet "niet zelf kijken". Commit per goedgekeurde stap.
Preview: `cd web && pnpm synthgen && pnpm build && MOTREGEN_DATA_ORIGIN=https://motregen.nl/data
pnpm preview --host 0.0.0.0 --port 4320 --strictPort` → http://ageq-dev2:4320/. Voor de bot
(stap 4–6): bouw `bot`, maar start geen eigen poller zonder overleg — de orkestrator draait de bot
vanaf main; meld "bot klaar voor herstart" en de orkestrator herstart hem vanuit jouw branch.

## Opdracht (PO-lijst, volgorde = voorstel)

1. **Eén globale schakelaar "Expressief"** (About › Weergave, standaard aan, `localStorage
   motregen-expressive`, hoort bij gebruikersstaat): stuurt U47's hemel/streken (`expressive`-
   ingang) én U42's dag/nacht-kleuring in de tabel; de losse "Dag en nacht in tabel" verdwijnt
   (migratie: oude sleutel uit → expressief uit). `docs/dev-opties.md` §Opslag bijwerken.
2. **Klokpil-jog**: PO kiest richting en schaal live (nu rechts = later, vast 120 s/px); de keuze
   wordt de default, de `?dev`-knop vervalt (MIP-12).
3. **`dev-panel.spec`** rood op main sinds U43/U46 ("expected hidden, received visible"): oorzaak
   vinden, fixen of de assertie eerlijk aanpassen.
4. **Bot-commando's**: `/gevoel` → `/temperatuur` met alias `/hitte` (commando's, help, inline-
   filter, docs); `/loop` vervalt: elke modus antwoordt standaard met de loop (`sendAnimation`),
   de delta-knoppen eronder geven een still op dat moment; Wind blijft alleen loop.
5. **Loop-bericht leesbaar op desktop**: de staande 960×1272-mp4 maakt de Telegram-bubbel smal,
   knoppen en labels te klein. Kies een landscape-frame (bv. 1280×800 met de kaart links en de
   klok/bron rechts, of 16:10 met grotere typografie) zodat de bubbel op desktop breed is; stills
   mogen staand blijven of meegaan, PO kiest op een echt bericht.
6. Afsluiting: `pnpm test`, gerichte e2e `--project desktop` (about/usage/freshness/dev-panel +
   telegram.spec), bot-tests, stills, LOG met receipts, draft-PR.

## Afbakening

Geen pad-URI's (U57), geen laadchoreografie (U54). Leesbaarheidsbar: geen één-letternamen.
