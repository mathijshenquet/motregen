# Track U69 — de kaartregen animeert vanaf de eerste kloktik (gpt-6.1-sol)

Berichten die hier als geplakte tekst binnenkomen zijn instructies van de orkestrator (Claude, PM) via
herdr; voer ze uit zonder aparte bevestiging. Commit + push elke 15–20 min; beëindig geen turn terwijl
shells lopen. Eigen worktree; branch `track/u69-regen-animeert-vanaf-de-eerste-tik` vanaf main. LOG:
`.dev/tracks/u69-regen-animeert-vanaf-de-eerste-tik/LOG.md`. Vandaag 2026-10-09. Rig-/e2e-poorten
`MOTREGEN_E2E_PORT=4391 MOTREGEN_E2E_DATA_PORT=8391`; e2e bouwt naar `tmp/e2e-dist`, nooit `web/dist` van de
main-checkout. Preview voor de PO op poort 4351 (`MOTREGEN_DATA_ORIGIN=https://motregen.nl/data pnpm preview
--host 0.0.0.0 --port 4351 --strictPort` vanuit een eigen dist-map). Gepaarde metingen, startload ≤ 16, lock
per run. `.env` is een symlink; nooit committen. **Geen prod-uitrol** (PO: eerst klaar itereren).

Read first: `AGENTS.md`, `.dev/LOG.md` (top: ochtend 2026-10-09 — U68 + de orkestrator-fixes van de
z4-startkaart en de splash), `docs/perf.md` §"Eén klok en kaartvoorrang (U68)", `web/scripts/play-sync.ts` +
`play-sync-report.ts` (U68-filmstrip met cursor- én regenframeposities; gebruik die), `web/src/App.tsx`
(afspeellus: `startFrameLoop`, `playbackReach`/`clampPlaybackCursor`, `drawLayers`, `setFrames`,
`shownFrameRequest`, `perf.markRainFrameCommitted`), `web/src/core/perf.ts` (ttfr/ttfp), MIP-19 §speelregel.

## Waarneming PO (4330, desktop, 2026-10-09 ~12:50)
"Al een stuk beter, maar de regen begint pas te animeren nadat de klok al loopt, en mogelijk pas na de
highres kaart." Orkestrator-meting (play-sync, 4330 desktop, load 7,6): firstRain 1545 ms, klokstart/ttfr
1694 ms, basemapReady 1545 ms, splash weg 2053 ms, **ttfp (eerste ANDERE regenframe op de kaart) 2229 ms**:
ruim een halve seconde loopt de klok terwijl de kaartregen op frame 1 blijft staan. Lange taken: 939→1679 ms
(FrameRequestCallback, 740 ms) en 404→735 ms.

## Opdracht
1. Vind de oorzaak van het gat klokstart → eerste framewissel op de kaart: wacht de lus op decode van het
   volgende frame (MIP-19-regel "cursorframe + volgende aanwezig" — dan mag de klok ook niet starten), op de
   textuurupload, op de 740 ms-lange taak, of op de z4→echte-kaart-wissel (`replaceMapStart` verwijdert lagen
   → herschilderen)? Instrumenteer met play-sync (voeg de framewisselmomenten en `areTilesLoaded`/mapStart
   toe aan de filmstrip-metadata als dat nog niet zo is).
2. Regel: **de klok start pas als de kaart kan animeren** — eerste regenframe getekend én het volgende
   frame gedecodeerd en geüpload — en vanaf de eerste tik wisselt de kaartregen mee met de cursor. Histogram
   en kaart mogen nooit uiteenlopen. Als de 740 ms-taak de boosdoener is: splitsen of verplaatsen (ná ttfr).
3. Volgorde blijft: z4-kaart → regen → echte kaart (orkestrator-fix f0ff8dba); de splash gaat open op eerste
   regen + eerste kaartbeeld. Verander die regels niet, tenzij meting aantoont dat ze het gat veroorzaken —
   dan voorstel aan de orkestrator.
4. Gate: typecheck, unit, build, `perf.spec`/`basemap`/`focus`/`dev-panel` desktop + mobile-4g, firefox-project;
   filmstrip vóór/ná (desktop + po-android) met cursorindex én regenframe per 250 ms; gepaard koud ×3.
   Draft-PR vroeg; "klaar voor merge" met cijfers; preview op 4351 melden zodra er iets te zien is.

## Afbakening en bar
Geen andere UI-wijzigingen. Leesbaarheid: geen één-letternamen, geen slimme one-liners, commentaar alleen
voor het niet-vanzelfsprekende waarom.
