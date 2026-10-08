# Track U62 — mobiele scrubber: hemelachtergrond volgt de cursor i.p.v. de tijdas (claude-opus-5-5, live-pane)

Berichten die hier als geplakte tekst binnenkomen zijn instructies van de orkestrator (Claude, PM) via
herdr; voer ze uit zonder aparte bevestiging; vragen in één zin, intussen doorwerken. Beëindig je turn
niet terwijl shells lopen. Vóór elk "klaar, herlaad": zelf een screenshot (390 px én desktop) maken en
bekijken. Commit + push per goedgekeurde stap.

Read first: `AGENTS.md`, `.dev/LOG.md` (top), `web/src/components/HistogramScrubber.tsx` (`skyStops`,
`timelineStart/End`, `sunTurns`), `web/src/core/cloud-section.ts`, `web/src/core/sky*.ts`, en de
U42/U49-logica voor het krappe apparaat ("venster volgt de cursor": `loadViewWindow`, `in-view`).
LOG: `.dev/tracks/u62-mobiele-hemel-venster/LOG.md`. Branch `track/u62-mobiele-hemel-venster` vanaf
main; eigen worktree; preview 4320 (`MOTREGEN_DATA_ORIGIN=https://motregen.nl/data pnpm preview --host
0.0.0.0 --port 4320 --strictPort`, normale build in web/dist; rig/e2e naar tmp/). Vandaag: 2026-10-08.

## Bug (PO, Android Chrome, prod 2026-10-08 07:18, twee screenshots in de track-map)

Mobiel: de hemelachtergrond van de scrubber hangt af van de cursorpositie. Bij cursor 08:08 toont de as
8u–13u en ligt de nacht/dageraad-overgang rond 8u; bij cursor 09:31 toont de as 8u–14u (venster
verschoven) maar is de donkere band tot ~9u opgeschoven: de hemel is niet met de as meegeschoven of is
berekend op het oude venster. Desktop heeft het niet (vast venster). Vermoedelijk: `skyStops(
timelineStart(), timelineEnd())` wordt op mobiel berekend over een ander bereik dan de getekende as, of
de hemel-canvas/SVG wordt niet opnieuw getekend wanneer het venster de cursor volgt (U42/U49), of de
memo hangt aan de cursor i.p.v. aan het zichtbare venster.

## Opdracht

1. Reproduceer op 390 px (Playwright touch, cursor verslepen zodat het venster verschuift) en meet:
   positie van de zonsopgang in de hemel vs de as-tijd, vóór en ná de verschuiving (pixelvergelijking).
2. Fix: de hemel (en de zonsopgang/ondergang-markeringen, sterren) worden altijd berekend en getekend
   over precies het zichtbare as-bereik; bij een venster-verschuiving opnieuw getekend; geen afhankelijkheid
   van de cursor behalve de cursorlijn zelf. Voeg een unit-test toe voor de mapping (venster → stops) en
   een e2e op `--project mobile-4g` die de zonsopgang-x met de as-x vergelijkt na een sleep.
3. Gate: typecheck, unit, build, `cloud-section.spec` + de nieuwe e2e (desktop én mobile-4g), eigen
   screenshots 390 px vóór/ná; LOG met receipts; draft-PR.

## Afbakening

Alleen de hemel/kader-mapping; geen andere scrubber-veranderingen. Leesbaarheid: geen één-letternamen.
