# Track U2 — kaartlabels en locatie-geheugen (log, append-only)

## 2026-09-23 12:40 — start
- Branch `track/u2-kaart-locatie` fast-forwarded naar main `f037e4b` (spec-commit;
  lokale ongetrackte spec was byte-identiek).
- Liberty-stijl + OpenFreeMap-tile z6/32/21 bekeken: plaatslagen gebruiken
  `coalesce(name_en, name)`; tiles bevatten `name:nl` (Nederland, Brugge, Namen,
  Noordzee-achtig). Landnamen: `label_country_{1,2,3}` (filter class==country);
  hoofdstad: aparte laag `label_city_capital` (capital==2, Bold, grotere tekst) terwijl
  `label_city` capital!=2 uitsluit.

## 2026-09-23 12:55 — implementatie
- basemap: place-lagen met filter class==country of capital==2 weg; de
  `capital != 2`-clausule uit `label_city` gestript (Amsterdam = gewone stad);
  elke symbol-laag waarvan text-field `name_en` noemt → `coalesce(name:nl, name)`
  (ook water/poi-namen — Noordzee i.p.v. North Sea). Structureel op filters
  gematcht, niet op layer-id. Gecontroleerd tegen de echte liberty.json: resterende
  place-lagen label_other/village/town/state/city, allemaal name:nl.
- `core/location-memory.ts`: keys `motregen-last-saved-place` (id) en
  `motregen-map-view` ({lng,lat,zoom}, afgerond). Startprioriteit
  `resolveStartLocation`: opgeslagen plek met die id → kaartcentrum (label =
  nearestPlace) → De Bilt. Corrupt/ontbrekend/throwende storage → stil terugvallen.
- Kaartpositie: `moveend` + 500 ms debounce (i.p.v. `idle`: met animerende regenlaag
  wordt `idle` zelden bereikt). Kaart start op opgeslagen center+zoom indien aanwezig.
- Klik op opgeslagen plek (lijstrij in LocationSearch via nieuwe `onSelectSaved`, én
  ★-marker op de kaart) → `chooseSaved`: onthoudt id + `pick`, géén easeTo.
  Zoeken (PDOK) en geolocatie centreren nog zoals voorheen.
- Interpretatie: (a) blijft gelden zolang de opgeslagen plek bestaat, ook als daarna
  op de kaart is getikt (spec: "laatst aangeklikte opgeslagen locatie"); verwijderde
  plek → stille fallback naar (b).
- App.tsx-diff klein gehouden (signal-init, map-constructor, moveend-hook,
  chooseSaved/rememberMapView, één prop) i.v.m. U4.

## 2026-09-23 13:20 — gates + e2e
- Draft-PR #27 geopend na eerste commit `4739c30`.
- Nieuw `web/e2e/location.spec.ts` (alleen desktop-project; gedrag, geen perf):
  opgeslagen plekken + kaartview seeden → start op kaartcentrum (Groningen) →
  klik ★-rij "Werk" → label wisselt, `motregen-map-view` ongewijzigd (geen
  centrering) → reload start op "Werk" → corrupte view + verdwenen id → De Bilt.
- Mutatiecheck: `easeTo` tijdelijk terug in `chooseSaved` → spec faalt synchroon
  (MUT-EXIT 1; view 6.57/53.21 → 5.69/51.63). Daarna hersteld (App.tsx gelijk aan commit).
- Omgeving: e2e moet buiten de Claude-sandbox (tsx/caddy listen → EPERM) en via
  `devenv shell --` (Playwright-chromium mist anders libglib). Poort 8185 was even
  bezet door U1's e2e-caddy; gewacht tot vrij (niet gekilld). Parallelle e2e-runs van
  tracks botsen op vaste poorten 8185/4185.
- Receipts (in `web/`, synchroon):
  - `pnpm typecheck` → exit 0
  - `pnpm test` → exit 0 (27 files / 96 tests)
  - `pnpm build` → exit 0 (alleen bestaande chunk-size-waarschuwing)
  - `devenv shell -- pnpm e2e` → exit 0 (4 passed, 2 skipped: location-spec op de
    mobiele profielen; perf 3/3, desktop warm chunk 0 B, mobiel 5430 B)
