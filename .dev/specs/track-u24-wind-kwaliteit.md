# Track U24 — windparticles: korrel, wegvallers, loefzijde, continu zoomen, subtieler default (claude opus 5.5)

Read first: `AGENTS.md`, `web/src/core/wind-layer.ts` (helemaal; let op
`resetViewport`, `respawn`/`emptiest cell`, `ensureTrailTargets`/
`blitTrail`, `viewportParticleRetention`, de fade/warp-pass, `bufferDpr`
default 1,5, `intensity` default 1,27 en `WIND_FOCUS_GAIN`), `web/src/core/
wind-layer-viewport.test.ts`, `web/e2e/wind-zoom.spec.ts`, en de LOGs van
U3b, U12 en U20 (`.dev/tracks/u*-wind*/LOG.md`) — wat al geprobeerd en
gemeten is, en de PO-oordelen daarbij. Your LOG: `.dev/tracks/u24-wind-
kwaliteit/LOG.md` — committed, append-only, timestamped. Branch
`track/u24-wind-kwaliteit` vanaf main. Eigen worktree. Preview:
http://ageq-mthq:4300/. Dev-knoppen via `?dev`.

## PO (2026-09-25)

"Er is nog steeds iets niet nice aan de wind particles. Het is ook nog
steeds te intens zonder selectie, daarnaast is het korrelig, soms vallen
particles weg, ook worden particles niet overdrawn en daardoor zijn er te
weinig particles aan de loefzijde. Er is ook nog steeds een zoom effect:
als ik continu inzoom op mac gaan alle particle trails weg." En onder
"Wind mode": "hier mag de opacity zoals het nu is van de wind particles;
ze mogen in default mode een stuk subtieler."

Vijf klachten, vijf metingen. Werk ze in deze volgorde af, elk met een
vóór/na-still (of korte frame-reeks) in de LOG en, waar mogelijk, een
getal.

## Opdracht

### 1. Default subtieler, windmodus zoals nu

- In default (geen Wind-focus) moet de zichtbare inkt duidelijk lager: richt
  op ~55–65 % van de huidige default-inkt (meet als gemiddelde alpha van de
  trailbuffer over land op zoom 7, of tel gedekte pixels > 8/255). De
  Wind-focus-intensiteit blijft wat hij nu is: pas dus `WIND_FOCUS_GAIN`
  aan (of vervang hem door een expliciete focus-intensiteit) zodat
  focus-inkt onveranderd blijft terwijl de default daalt.
- Het is een tuning-v3-default-wijziging: opgeslagen afwijkingen van
  gebruikers blijven, defaults schuiven mee (zie U20 voor de valkuil).

### 2. Korrel

Hypotheses, in volgorde van waarschijnlijkheid; test ze apart:
- `bufferDpr` 1,5 op een 2×-Mac: de trailbuffer is 0,75× device-resolutie
  en wordt LINEAR opgeschaald — dat leest als korrel/onscherpte op dunne
  lijnen. Meet met `bufferDpr` = 2 (dev-knop) of vervang de cap door
  "volle DPR tot een pixelbudget, daarna dalen".
- 8-bits RGBA-fade: multiplicatief faden in UNORM8 laat rest-grijs staan en
  kwantiseert de staart in zichtbare stappen. Optie: fade met een kleine
  bias (`max(0, a*k - 1/255)`), of `RGBA16F`-trailtargets als
  `EXT_color_buffer_half_float` beschikbaar is (val terug op RGBA8).
- `antialias: false` op de overlay-canvas plus de AA in de shader uit U3b:
  controleer of de kop-AA nog klopt na U12's wereldcoördinaten.
Lever een still op 200 % zoom (crop) vóór/na.

### 3. Wegvallers

- Zoek de dood-zonder-fade: `maxAge`-dood midden in een trail, `retireSurplus`
  bij zoom (fade-out te snel?), `die → removeSlot` als `active > budget`
  (dat wist een particle abrupt zónder ramp). Elke dood moet via een ramp
  van ≥ 0,3 s lopen; een slot mag pas verdwijnen als zijn ramp 0 is.
- Meet: aantal "abrupte verdwijningen" per seconde (kop-alpha van 1 naar
  0 in één frame) vóór/na, in een unit- of headless-test op de life-logica.

### 4. Te weinig aan de loefzijde

- Particles worden geboren in de leegste cel, maar advectie sleept alles
  lijwaarts: aan de loefkant van een kaartrand/landmassa ontstaat een
  leegte omdat daar niemand binnenkomt en de leegste-cel-keuze gedempt is
  (U3b: leegste van k pogingen). Twee fixes, meet beide:
  a. **Loef-gewicht bij respawn**: kies onder de k kandidaatcellen niet
     puur de leegste maar `leegte + λ · (upstream-score)`, waarbij upstream
     = hoe ver de cel loefwaarts ligt t.o.v. de lokale windrichting aan de
     rand (of: sample kandidaten met kans ∝ lokale windsnelheid × leegte).
  b. **Randinstroom**: een vast deel (10–20 %) van de respawns komt op de
     loefrand van het particlegebied (buiten beeld, één cel), zodat trails
     "van buiten" binnenkomen.
- Metric: dichtheidsprofiel (particles per cel) langs de windrichting over
  het beeld; doel: verhouding loef/lij ≥ 0,8 (nu meten). Voeg de meting
  toe aan de dev-JSON-export.

### 5. Continu inzoomen (Mac trackpad/pinch): trails weg

- Reproduceer met een script: `map.zoomTo` in 60 stappen van 0,02 over 1 s
  (of Playwright wheel-events) en tel de trailinkt per frame. Verwachting
  op basis van de code: elke zoomstap warpt de trailbuffer (fade-pass met
  LINEAR-sampling) én past `viewportParticleRetention` toe — bij 60 kleine
  stappen stapelt dat tot bijna-nul inkt, terwijl één grote stap prima
  gaat.
- Fixes, meet ze apart: retention alleen toepassen op de netto zoomverandering
  sinds het laatste rustmoment (accumuleer tijdens een gesture, pas één
  keer toe), en de warp met de exacte affiene transformatie zonder
  hersampling-verlies (of accumuleren in een buffer op vaste wereldzoom
  zolang de gesture loopt, dan één keer herprojecteren). Doel: inkt aan
  het eind van een continue zoom van 7→9 ≥ 70 % van de inkt bij één sprong
  7→9; en nooit een leeg beeld tijdens de gesture.
- `wind-zoom.spec.ts` krijgt de continue-zoom-case erbij.

## Niet doen

- Geen nieuwe dev-knoppen tenzij ze een meting dragen. Geen wijzigingen aan
  de UI-shell (U22/U23) of isolijnen (U25). Trails blijven in
  wereldcoördinaten (U12); dat besluit staat.

## Gates

`pnpm typecheck`, `pnpm test`, `pnpm build`, `MOTREGEN_E2E_PORT=4364
MOTREGEN_E2E_DATA_PORT=8364 pnpm e2e` (hostlock, load < 16, één Chromium,
poorten vooraf vrij) groen, synchrone exit statussen in de LOG. Draft-PR
vroeg. Geen codex.
