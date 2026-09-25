# Track U26 — huidige locatie voorop; kaart bedienen via de pin; alleen pan/zoom (claude opus 5.5)

Read first: `AGENTS.md`, `web/src/App.tsx` (kaartinit ~282, `map.on('click')`
~302, `marker`/`pick` ~1059, `locate` ~1358, `resolveStartLocation`-gebruik,
`transformConstrain`/`constrainMapView` ~1472), `web/src/core/
location-memory.ts` (`resolveStartLocation`), `web/src/core/map-constraint.ts`,
`web/e2e/location.spec.ts`, `web/e2e/map-zoom.spec.ts`, U2-LOG (locatie-
geheugen) en U6/U14-LOGs (contain-fit, mobiel). Your LOG: `.dev/tracks/
u26-pin-navigatie/LOG.md` — committed, append-only, timestamped. Branch
`track/u26-pin-navigatie` vanaf main. Eigen worktree. Preview:
http://ageq-mthq:4300/.

Let op: U22 (bovenrand/zoekpil/zoomknoppen weg) loopt parallel en raakt
`App.tsx`; rebase regelmatig op main en houd je diff in de kaartinteractie-
laag. Verplaats de interactielogica bij voorkeur naar een eigen module
(`core/pin-navigation.ts`) zodat de merge klein blijft.

## PO (2026-09-25)

"Als location aanstaat (authorization gegeven) is current location de top
prio voor location." En: "Op mobile is het niet touch friendly omdat alle
surfaces een eigen zoom/pan/click hebben. Voorstel: default niet de kaart
pannen; je beweegt de kaart door de droppin te verplaatsen (kan ook prima op
desktop); de kaart beweegt mee met de pin maar alleen als hij out of bounds
zou raken; dubbel tap op de pin centreert de kaart daar. Twee-vinger pannen
blijft werken. Haal alle andere transformaties weg (tilt en rotatie)."

## Opdracht

### 1. Startlocatie: huidige locatie eerst

- Bij start: `navigator.permissions.query({ name: 'geolocation' })`. Staat
  die op `granted`, dan is de huidige positie de startlocatie (boven de
  laatst gekozen/opgeslagen plaats uit `resolveStartLocation`), zonder
  prompt. `prompt`/`denied` → huidig gedrag. Terwijl de fix loopt (max 10 s)
  toont de app de onthouden locatie; zodra de fix binnen is verhuist de pin
  (en de kaart alleen als de pin anders buiten beeld valt, zie 2) met label
  "Mijn locatie". Safari zonder Permissions API: val terug op het huidige
  gedrag; documenteer.
- `watchPosition` niet; één fix per sessiestart. Geen opslag van
  coördinaten buiten de bestaande locatie-opslag.

### 2. Pin-navigatie

- De pin (`Marker`) wordt **draggable**, op touch en muis. Tijdens slepen
  volgt het rainmeter/tabel-punt niet live (te duur); bij loslaten `pick`.
  Tijdens slepen wél een lichte schaduw/lift op de pin.
- **Kaart volgt alleen bij randcontact**: als de pin binnen een randmarge
  (~48 px, groter dan de pin) van het kaartvlak komt, pant de kaart mee met
  de sleepsnelheid (edge-scroll); anders staat de kaart stil. De contain-
  constraint blijft gelden (nooit voorbij `MAP_CONTAIN_BOUNDS`).
- **Dubbeltik op de pin** centreert de kaart op de pin (`easeTo`, 450 ms).
- **Tik op de kaart** blijft de pin daarheen zetten (huidig gedrag); dat is
  de snelle weg, slepen de precieze.
- **Mobiel (pointer: coarse)**: één-vinger-slepen op de kaart pant NIET meer
  (`dragPan` uit voor single touch; MapLibre's `dragPan`/`touchZoomRotate`
  splitsen: pinch-zoom + twee-vinger-pan blijven aan). Één-vinger-slepen op
  de kaart doet niets (of, als het goedkoop is: verschuift de pin naar de
  vinger na een lange druk — alleen als het niet met scroll van de pagina
  vecht; anders niet). De pagina scrolt weer normaal over de kaart heen
  (U14: kaart ≥ 60 % eerste scherm) — dat is de touch-frictie die de PO
  bedoelt.
- **Desktop**: één-vinger/muis-pan op de kaart blijft aan (PO: pin-slepen
  "kan ook op desktop", niet "in plaats van").

### 3. Alleen pan en zoom

- Uit, hard: `dragRotate`, `touchPitch`, `pitchWithRotate`, keyboard rotate,
  `touchZoomRotate.disableRotation()`. `maxPitch: 0`, `bearing` vast 0. Als
  er nog een pad is waarlangs bearing/pitch verandert (bv. `easeTo` met
  bearing), zet het op 0 in `transformConstrain`.

### 4. Tests

- Unit: permissie-`granted` → startlocatie = fix; `prompt` → onthouden
  plaats. Edge-scroll-rekenkern (pin-positie → pan-vector) als pure functie
  met tests.
- e2e: pin slepen op desktop verplaatst locatie; slepen naar de rand pant
  de kaart; dubbelklik centreert; Pixel 5: één-vinger-swipe op de kaart
  pant niet, pinch zoomt wel; bearing/pitch blijven 0 na rotatiegebaren.

## Niet doen

- Geen UI-shell (U22/U23), wind (U24), isolijnen (U25).

## Gates

`pnpm typecheck`, `pnpm test`, `pnpm build`, `MOTREGEN_E2E_PORT=4368
MOTREGEN_E2E_DATA_PORT=8368 pnpm e2e` (hostlock, load < 16, één Chromium,
poorten vooraf vrij) groen, synchrone exit statussen in de LOG. Draft-PR
vroeg. Geen codex.
