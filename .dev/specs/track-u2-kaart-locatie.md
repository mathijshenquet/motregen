# Track U2 — kaartlabels en locatie-geheugen (claude opus)

Read first: `AGENTS.md`, `web/src/core/basemap.ts`, `web/src/core/
saved-places.ts`, `web/src/core/places.ts`, `web/src/App.tsx` (rond
`defaultLocation`, `pick`, `easeTo`). Your LOG:
`.dev/tracks/u2-kaart-locatie/LOG.md` — committed, append-only,
timestamped. Branch: `track/u2-kaart-locatie` vanaf main. Eigen worktree.

## PO-punten (2026-09-23)

1. Basemap: het label "Netherlands" (Engels) en het extra grote
   "Amsterdam"-hoofdstadlabel zijn overbodig op een Nederlandse kaart.
   Filter in `prepareBasemapStyle` de landnaamlaag weg en zet plaatsnamen
   op Nederlandse namen (`name:nl`/`name` uit OpenMapTiles), zonder
   capital-vergroting. Voeg tests toe naast de bestaande basemap-tests.
2. Locatie-default: nu De Bilt. Nieuwe prioriteit bij opstart:
   (a) de laatst aangeklikte opgeslagen locatie, (b) anders de laatste
   kaartpositie (center + zoom, bij idle opgeslagen, gedebounced), (c) anders
   De Bilt. Alles in localStorage met `motregen-`-prefix zoals de bestaande
   keys; corrupte waarden vallen stil terug. Geolocatie-gedrag ongewijzigd.
3. Klik op een opgeslagen locatie mag de kaart NIET meer centreren
   (`easeTo` weg op dat pad); de meter/histogram/tabel wisselen wel.
   Zoeken via LocationSearch mag wél nog centreren.

## Gates

`pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm e2e` green (synchrone
exit status in LOG). Draft-PR vroeg. Geen codex. Houd App.tsx-wijzigingen
klein en lokaal: U4 werkt parallel in dezelfde file (tabel/uurpaneel).
