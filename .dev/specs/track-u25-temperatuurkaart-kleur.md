# Track U25 — temperatuurkaart: dunne uniforme isolijnen, gedesatureerde basiskaart, subtiel KNMI-palet tussen de lijnen (claude opus 5.5)

Read first: `AGENTS.md`, `web/src/core/isoline-layer.ts` (raster-shader
met `sampleField`/B-spline in (x,y,t); vectorpad; `oddLine`; composite-
pass; maxHz-cadans), `web/src/core/isolines.ts` (`DEFAULT_ISOLINE_TUNING`,
`odd: 'half'`), `web/src/core/isoline-tracer*.ts` (vectorlijnen, default
sinds U13), `web/src/core/focus-mode.ts` + `applyFocus` in `web/src/App.tsx`
(regel ~761: wat er nu dimt bij temperatuurfocus, `contextOpacity`),
`web/src/core/overlay-canvas.ts` (de basiskaart is MapLibre's eigen canvas;
regen/wind/isolijnen zijn aparte canvassen erboven), `web/src/core/
basemap.ts`, en de LOGs van U8/U8b/U8c/U13/U16/U19. Your LOG:
`.dev/tracks/u25-temperatuurkaart-kleur/LOG.md` — committed, append-only,
timestamped. Branch `track/u25-temperatuurkaart-kleur` vanaf main. Eigen
worktree. Preview: http://ageq-mthq:4300/. Dev-knoppen via `?dev`.

## PO (2026-09-25)

"Voor temperatuur mode: isolines minder dik, niet meer alterneren. Graag de
kaart licht desatureren (animeer dit), ik zou het als shader-achtig ding
doen dan kost het ook niks als het kan, niet de hele OFM redrawen elke
keer. Dan graag een color palette voor de velden in de isolines. Als je een
isoline fade dan correspondingly de kleuren naar elkaar faden. Gebruik
hiervoor een standaard palet zoals die van KNMI, maak het subtiel en
misschien intensiteit/opacity afhankelijk van afstand tot de isoline ofzo
(subtiel)."

## Opdracht

### 1. Lijnen: dunner, één gewicht

- `odd: 'half'` (U16: oneven graden halve breedte) gaat als default eruit;
  alle lijnen even dik, en dunner dan de huidige volle breedte (richt op
  ~0,7 van nu; noteer de CSS-px-breedte vóór/na). Behoud de dev-keuze
  `odd` alleen als het geen code kost; anders verwijderen inclusief
  `oddLine` en de `u_odd_*`-uniforms in beide shaders.
- Labels (U16) volgen: alle graden een label kunnen dragen, met de
  bestaande afstandsregels.

### 2. Basiskaart desatureren bij temperatuurfocus, geanimeerd, gratis

- Geen MapLibre-restyle en geen paint-property-sweep over alle lagen (dat is
  de "OFM redraw" die de PO niet wil). Gebruik in plaats daarvan een
  compositor-filter op MapLibre's eigen canvas: `filter: saturate(var(--
  map-saturation))` op `.maplibregl-canvas`, gestuurd door `applyFocus`
  (focus 0 → 1,0; focus 1 → ~0,55; PO stelt bij). CSS `transition` volgt
  de bestaande focus-tween (`inMs`/`outMs`) of zet de waarde per frame uit
  de tween — kies wat vloeiend is bij `prefers-reduced-motion` uit/aan.
  Overlays (regen, wind, isolijnen) zitten op eigen canvassen en blijven
  verzadigd.
- Meet dat het niets kost: rAF-frametijd en MapLibre-renders per seconde in
  rust met focus aan vóór/na (U8c-meting: 0 passes in rust moet zo
  blijven). Als de compositor-filter op mobiel toch een fullscreen
  repaint per frame veroorzaakt, val terug op een enkele `raster-saturation`
  /`fill-color`-aanpak en documenteer de meting.
- Stadslabels van de kaart (`temperatureLabels`, eigen symbol-laag) blijven
  ongewijzigd leesbaar.

### 3. Vlakvulling tussen de isolijnen, KNMI-palet, subtiel

- Kleurschaal: het KNMI-temperatuurpalet (de bekende blauw → groen → geel →
  oranje → rood-schaal van de KNMI-temperatuurkaarten). Neem de stops op in
  een `TEMPERATURE_PALETTE`-tabel in een eigen module met bron/herkomst in
  één regel; geen exacte hex-kopie nodig, wel dezelfde tinten per graadband.
  Kleur per **band** (tussen twee isolijnen van de huidige `step`), niet
  continu: de vlakken lezen dan als gekleurde vlakken die de lijnen
  begrenzen.
- Rendering in de bestaande raster-pass van `isoline-layer.ts`: de shader
  samplet het veld al (`sampleField`); voeg de bandkleur toe als aparte
  output/pass onder de lijnen (lijnen blijven vector). De pass loopt op de
  bestaande maxHz-cadans en alleen bij focus > 0 — rust blijft 0 passes.
- **Subtiel**: basisopacity van de vulling laag (start ~0,10–0,14 op de
  gedesatureerde kaart) en, zoals de PO suggereert, afhankelijk van de
  afstand tot de dichtstbijzijnde isolijn: sterker vlak bij de lijn, weg
  naar het midden van de band (bv. `opacity = base · smoothstep(0, halve
  bandbreedte in px, afstand)` omgekeerd). Geef een dev-knop voor
  basisopacity en voor de afstandsafval; lever drie stills (0,08 / 0,12 /
  0,18) zodat de PO kiest.
- **Faden met de lijn**: waar een isolijn wegfadet (kleine ringen op
  ringlengte, U13; eventuele gradiëntfade) moeten de twee aangrenzende
  bandkleuren naar elkaar mengen met dezelfde factor, zodat er geen
  kleurgrens overblijft zonder lijn. In de raster-pass: bereken de
  fade-factor van het lokale niveau met dezelfde formule als de lijn en
  `mix(kleur(level), kleur(level±1), fade)`. Voor de ringlengte-fade
  (die alleen de tracer kent) is een veldbenadering acceptabel als je
  aantoont dat het niet opvalt; anders geef de tracer per ring de fade
  door als klein raster.
- De vulling volgt `contextOpacity` niet (die dimt context, dit is het
  onderwerp) maar schaalt wél met de focus-tween in/uit.

### 4. Tests en stills

- Unit: palet-lookup per band; opacity-formule; fade-menging op een
  synthetisch veld met één fadende lijn (geen kleursprong > 1/255 · base
  in het gemengde punt).
- e2e `focus.spec.ts`: focus aan → `--map-saturation` < 1 en vulling
  zichtbaar (pixel-sample), focus uit → beide weg; rust-pass-teller 0.
- Stills licht/donker, desktop en Pixel 5, vóór/na en de drie opacities, in
  de LOG.

## Niet doen

- Geen restyle van de OFM-stijl per laag. Geen verandering aan de
  lijngeometrie (tracer) buiten de breedte. Wind (U24) en UI-shell
  (U22/U23) blijven ongemoeid.

## Gates

`pnpm typecheck`, `pnpm test`, `pnpm build`, `MOTREGEN_E2E_PORT=4366
MOTREGEN_E2E_DATA_PORT=8366 pnpm e2e` (hostlock, load < 16, één Chromium,
poorten vooraf vrij) groen, synchrone exit statussen in de LOG. Draft-PR
vroeg. Geen codex.
