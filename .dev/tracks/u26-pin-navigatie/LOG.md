# U26 — pin-navigatie (worker: claude opus 5.5)

## 2026-09-25 08:55 UTC — start
- Spec gelezen (`.dev/specs/track-u26-pin-navigatie.md`), App.tsx-kaartlaag, location-memory,
  map-constraint, location/map-zoom e2e, U2/U14-LOG. `pnpm install --frozen-lockfile` → exit 0.
- MapLibre is 5.24.0. Bevindingen in de bron:
  - `TouchPanHandler` pant met elk aantal vingers; `dragPan.disable()` zou dus ook twee-vinger-pan
    uitzetten (pinch-zoom zit apart in `TwoFingersTouchZoomHandler`, pant niet). MapLibre's eigen
    splitsing is `cooperativeGestures`: minTouches 2 voor touch-pan, container krijgt
    `touch-action: pan-x pan-y` (pagina scrolt), maar ook ctrl+wiel voor zoom op desktop.
    Keuze: `cooperativeGestures` alleen aanzetten bij `(pointer: coarse)`; de hint-overlay
    ("gebruik twee vingers") via CSS verbergen — spec: één vinger op de kaart doet niets.
  - `Marker({draggable})` hangt aan kaart-mouse/touch-events en kent geen edge-scroll bij stilstaande
    vinger. Keuze: eigen Pointer-Events-drag op het pin-element (pointer capture, propagatie gestopt
    zodat MapLibre-handlers niets zien), rAF-lus voor edge-scroll, eigen dubbeltik-herkenning
    (dblclick is op touch onbetrouwbaar).
  - `TransformConstrainFunction` is `(lngLat, zoom) → {center, zoom}`: bearing/pitch kunnen daar niet
    op 0. Hard uit via opties (`dragRotate`, `touchPitch`, `pitchWithRotate`, `maxPitch: 0`) +
    `keyboard.disableRotation()` + `touchZoomRotate.disableRotation()`. Geen code-pad met bearing
    (grep). e2e borgt het.
- Load bij start 24.6 → e2e later.

## 2026-09-25 09:05 UTC — implementatie + unit/build
- `web/src/core/pin-navigation.ts`: `edgePanVelocity` (pure kern), `attachPinNavigation`
  (pointer-drag, rAF edge-scroll, dubbeltik), `PAN_ZOOM_ONLY`, `restrictMapGestures`.
  App.tsx: marker wordt één keer gemaakt en daarna verplaatst (was: remove+new per pick),
  `revealPoint` (easeTo alleen als het punt buiten/in de rand van het vrije kaartvlak valt),
  startfix, `__motregenCamera`-hook voor e2e.
- Edge-scroll-keuze: de pin blijft onder de vinger. In de 48 px-rand pant de kaart met
  max(dwell ∝ diepte (12 px/s per px, ≤ 576 px/s), sleepsnelheid richting die rand) —
  "meebewegen met de sleepsnelheid" + doorlopen bij stilhouden. Topmarge telt vanaf de
  bedekte top-inset (versheidspil/zoekpil). Contain-constraint blijft: panBy loopt door
  `transformConstrain`.
- Startfix (`grantedStartFix` in location-memory): Permissions API `granted` → één
  `getCurrentPosition` (timeout 10 s, maximumAge 60 s), label "Mijn locatie". Geen
  Permissions API (Safari < 16), prompt/denied/fout → huidig gedrag, zonder prompt. Fix buiten
  `MAP_CONTAIN_BOUNDS` (buitenland) → genegeerd (geen data daar). Komt de fix binnen nadat de
  gebruiker al iets anders koos, dan wint de keuze van de gebruiker.
- Trade-off `cooperativeGestures` op coarse pointers: een *muiswiel* zoomt daar alleen met ctrl
  (trackpad-pinch stuurt ctrlKey en werkt wel). Op telefoons irrelevant; `map-zoom` e2e
  (Pixel 5) houdt nu ctrl vast tijdens het wielen.
- Lange-druk-pin-verplaatsen niet gebouwd (optioneel in spec; zou met pagina-scroll vechten).
- Edge-scroll pant per frame met `panBy(duration 0)` → `moveend` per frame; die listeners
  (debounced view-opslag, isolijnlabels alleen in temperatuurmodus) zijn goedkoop genoeg.
- Fresh worktree: `pnpm synthgen` (buiten sandbox: tsx-pipe EPERM) nodig voor mrf.test-fixture.
- Receipts (vanuit `web/`, synchroon):
  - `pnpm typecheck` → TYPECHECK-EXIT: 0
  - `pnpm test` → TEST-EXIT: 0 (42 files, 242 tests)
  - `pnpm build` → BUILD-EXIT: 0
- Draft-PR: https://github.com/mathijshenquet/motregen/pull/56
- e2e wacht op load < 16 (was 30).

## 2026-09-25 09:25 UTC — PO-aanvulling: pin wordt subtiel afgekapt
- Oorzaak (MapLibre 5.24 `marker.ts`): het standaardpinpad raakt de viewBox-randen (x 0/27, y 0),
  element is 27 px breed → `translate(-50%,-100%)` zet het op x.5 px, en `.maplibregl-marker` heeft
  `will-change: transform` → eigen compositing-laag ter grootte van de box; antialiasing buiten de
  box valt weg (boven/links/rechts; onder staat de schaduw-ellips met ruimte).
- Fix: `.location-pin { padding: 2px 2px 0 }` + `.location-pin svg { overflow: visible }`. Geen
  padding onder en symmetrisch opzij → onder-midden (het anker) ongewijzigd. Verificatie (200 %-crops
  op zoom 7,3 en 8,7, anker-meting met/zonder fix) volgt na de lopende e2e (één Chromium).
- Eerste gerichte e2e-run (09:02, load 14,4): FULL-GATE-EXIT: 1 — 11 passed, 2 failed, 14 skipped.
  Beide fouten in mijn testaannames: (1) svg-onderkant ≠ anker (6,5 px) → centreer-check nu tegen
  de gekalibreerde startpositie van de pin; (2) startlabel bij geseede view is "Utrecht", niet
  "De Bilt" → vergelijken met het label van vóór het gebaar. Herhaalrun staat in de hostlock-rij.

## 2026-09-25 10:05 UTC — diagnose touch-test, rebase, nieuwe e2e-slotregel
- Tweede gerichte run (`e2e/pin-navigation.spec.ts`): FULL-GATE-EXIT: 1 (2 failed). Diagnose-spec
  (tijdelijk, niet gecommit) op Pixel 5: één-vinger-swipe op de kaart verandert níets (camera,
  location, scrollY, pin identiek vóór/tijdens/na) → app correct. De camerasprong kwam uit de
  test zelf: na pinch+pan sleepte hij de pin 40 px omhoog de 48 px-randmarge onder klok/zoekpil in
  → edge-scroll, zoals ontworpen. Desktop-fout (6 px op y) = sleep-lift (translateY(-6px), 120 ms)
  nog niet teruggezakt. Fix in de spec: pin-sleep eerst (vanaf midden, omlaag), `settledPinTip`,
  en "locatie verplaatst" via `location` in de camera-hook i.p.v. het grove plaatslabel.
- Gates op cffb3bf (vanuit `web/`, synchroon): TYPECHECK-EXIT: 0; TEST-EXIT: 0 (42 files, 242
  tests); BUILD-EXIT: 0.
- PO-procesregel (main 211b57f): twee e2e-slots via `web/scripts/e2e-slot.sh`; workers draaien
  alleen eigen/geraakte specs. Mijn volledige suite stond nog in de rij voor de oude lock (draaide
  niet) → gestopt en vervangen. Rebased op 211b57f → HEAD 6f17a19 (force-with-lease gepusht).
- Gericht te draaien (eigen + geraakt): `e2e/pin-navigation.spec.ts` (nieuw), `e2e/map-zoom.spec.ts`
  (ctrl-wiel op touch), `e2e/location.spec.ts` (pin-marker wordt nu hergebruikt i.p.v. vervangen;
  tik-op-kaart-gedrag). Daarna pin-crops onder een slot.

## 2026-09-25 10:40 UTC — pin-ruimte geverifieerd (crops), gerichte e2e groen
- Gerichte e2e op 6f17a19 (rebased op 211b57f), via `scripts/e2e-slot.sh`:
  `MOTREGEN_E2E_PORT=4368 MOTREGEN_E2E_DATA_PORT=8368 pnpm e2e e2e/pin-navigation.spec.ts
  e2e/map-zoom.spec.ts e2e/location.spec.ts` → FULL-GATE-EXIT: 0 (13 passed, 14 skipped: de
  profielfilters van de specs; mobile-fast-3g draait deze gedragsspecs niet).
- Crops, eerste poging (padding `2px 2px 0`): de meting liet zien dat de standaardmarker op zijn
  **midden** ankert (`translate(-50%,-50%)` + offset −14), niet onderaan. Padding alleen boven
  schoof de pin 1 px omlaag (tip y 406,5 → 407,5). Gecorrigeerd naar `padding: 2px` rondom.
- Crops, eind (`pin-crops.mjs`, vast kader 381,356 48×58 CSS px, 1280×800, De Bilt; "voor" = fix
  uitgeschakeld met een geïnjecteerde style in dezelfde pagina):

  | DPR | zoom | tip voor | tip na | box voor→na | pinvlak-px met verschil>8 (max) |
  |---|---|---|---|---|---|
  | 1    | 7,3 | 405 / 406,5 | 405 / 406,5 | 27×41 → 31×45 | 0 (1) |
  | 1    | 8,7 | 405 / 406,5 | 405 / 406,5 | 27×41 → 31×45 | 12 (29): windstreep, niet de pin |
  | 1,5  | 7,3 | 405 / 406,5 | 405 / 406,5 | 27×41 → 31×45 | 38 (211): windstreep |
  | 1,5  | 8,7 | 405 / 406,5 | 405 / 406,5 | 27×41 → 31×45 | 9 (42): windstreep |
  | 2,75 | 7,3 | 405 / 406,5 | 405 / 406,5 | 27×41 → 31×45 | 592 (71): hele contour + stip |
  | 2,75 | 8,7 | 405 / 406,5 | 405 / 406,5 | 27×41 → 31×45 | 611 (78): hele contour + stip |

  Beeld: `shots/pin-z7.3-200pct.png`, `shots/pin-z8.7-200pct.png` (DPR 1, 200 %), en
  `shots/pin-sheet.png` (alle zes, voor | na | verschil ×4, vergroot).
- Duiding, eerlijk: **anker exact gelijk** (CSS px) op alle zes. De **afkapping zelf reproduceer ik
  headless niet**: op DPR 1/1,5 zijn de pinranden pixel-identiek (verschillen = bewegende wind), op
  DPR 2,75 verschilt de hele contour incl. de witte stip gelijkmatig: een subpixel-fase van de
  herrasterde laag (box 31 i.p.v. 27 breed), geen weggenomen afkapping (die zou alleen boven/links/
  rechts zitten). Swiftshader rastert anders dan een echte GPU; de fix is onschadelijk en logisch
  (ruimte voor de antialiasing buiten de viewBox) maar **nog te bevestigen op het PO-toestel**.
- Repro (vanuit `web/`, onder een slot): `pnpm build`,
  `MOTREGEN_DATA_ORIGIN=https://motregen.nl/data pnpm preview --host 127.0.0.1 --port 4369 --strictPort`,
  `devenv shell -- node ../.dev/tracks/u26-pin-navigatie/pin-crops.mjs http://127.0.0.1:4369/` →
  CROPS-EXIT: 0; dan `uv run --with pillow python ../.dev/tracks/u26-pin-navigatie/pindiff.py` en
  `pinsheet.py`.
- Gates op a4bf61c (vanuit `web/`, synchroon): TYPECHECK-EXIT: 0; TEST-EXIT: 0 (42 files, 242
  tests); BUILD-EXIT: 0.
- Gerichte e2e op a4bf61c (zelfde drie specs, via e2e-slot.sh, start 10:29 UTC bij load 15,85)
  → FULL-GATE-EXIT: 0 (13 passed, 14 skipped).

## 2026-09-25 10:45 UTC — slot-samenvatting U26
**Geleverd** (branch `track/u26-pin-navigatie`, draft-PR #56, rebased op main 211b57f):
1. Startlocatie: Permissions API `granted` → één fix (≤ 10 s), label "Mijn locatie", pin verhuist;
   kaart alleen mee als de pin anders buiten/in de rand van het vrije kaartvlak valt. Prompt/denied/
   geen Permissions API (Safari < 16)/fout/fix buiten de kaartgrenzen → huidig gedrag, nooit een prompt.
   Geen watchPosition, geen extra opslag. Een keuze van de gebruiker vóór de fix wint.
2. Pin-navigatie (`core/pin-navigation.ts`): pin sleepbaar met muis en vinger (lift + schaduw), pick
   pas bij loslaten; edge-scroll in 48 px-randmarge (sleepsnelheid richting de rand, anders dwell
   ∝ diepte), contain-constraint blijft; dubbeltik/-klik centreert (easeTo 450 ms); tik op kaart
   zet de pin nog steeds. Mobiel (pointer: coarse): één vinger pant niet (pagina scrolt), pinch +
   twee-vinger-pan blijven (MapLibre `cooperativeGestures`, hint verborgen). Desktop: muis-pan blijft.
3. Alleen pan/zoom: dragRotate, touchPitch, pitchWithRotate uit, maxPitch 0, keyboard- en
   touch-rotatie uit. (`transformConstrain` kan bearing/pitch niet zetten, dus het gebeurt via de
   opties; de e2e borgt 0/0.)
4. PO-aanvulling pin-ruimte: `padding: 2px` rondom + `svg { overflow: visible }`; anker exact gelijk
   gemeten; afkapping niet headless reproduceerbaar (zie boven).

**Receipts op a4bf61c** (vanuit `web/`, synchroon): TYPECHECK-EXIT: 0 · TEST-EXIT: 0 (242 tests)
· BUILD-EXIT: 0 · gerichte e2e (`e2e/pin-navigation.spec.ts e2e/map-zoom.spec.ts
e2e/location.spec.ts`, poorten 4368/8368, e2e-slot) FULL-GATE-EXIT: 0 (13 passed, 14 skipped)
· pin-crops CROPS-EXIT: 0. De volledige suite heb ik volgens de nieuwe regel niet gedraaid; die is
voor de orkestrator op de merge-kandidaat.

**Open voor PO (Mathijs):**
- Muiswiel op een touch-primair apparaat zoomt alleen met ctrl (bijwerking van cooperativeGestures;
  trackpad-pinch werkt wel). Acceptabel? Anders is een eigen touch-pan-splitsing nodig.
- Pin-afkapping: bevestigen op het eigen toestel. Headless zie ik geen verschil aan de randen.
- Lange-druk-om-pin-te-verplaatsen niet gebouwd (optioneel; vecht met pagina-scroll).
- Knop "mijn locatie" (`locate`) centreert nog altijd (ongewijzigd); alleen de startfix centreert
  voorwaardelijk. Gelijk trekken?

**Voor de orkestrator:** volledige suite op de rebased merge-kandidaat; `map-zoom.spec.ts` is
aangepast (ctrl-wiel op touch-profielen); nieuwe testhook `window.__motregenCamera` (camera +
location). Let op de merge met U22 (App.tsx): mijn diff raakt kaartinit (`...PAN_ZOOM_ONLY`,
`restrictMapGestures`), `pick` (marker één keer maken), `revealPoint`, startfix bij de signals,
en de `__motregenCamera`-hook.
