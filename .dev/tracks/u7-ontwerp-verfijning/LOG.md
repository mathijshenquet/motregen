# Track U7 — ontwerpverfijning (claude opus)

## 2026-09-23T15:30 — Start, vóór-screenshots

- Gelezen: AGENTS.md, spec, HistogramScrubber.tsx, App.tsx (splash, `.source`, temperatuurlaag), styles.css, core/temperature.ts, core/places.ts, core/basemap.ts, docs/perf.md, README.md. `pnpm install --frozen-lockfile` → exit 0.
- Screenshotscript: `shots.mjs` in deze map (Playwright, desktop 1440×900 + Pixel 5, nl-NL, Europe/Amsterdam). Repro vanuit `web/`: `direnv exec .. node ../.dev/tracks/u7-ontwerp-verfijning/shots.mjs <url> <prefix>`.
- `ageq-mthq` resolvet hier naar een IPv6-adres, maar de integratie-vite luistert alleen op 100.108.127.86:4300. Vóór-screenshots daarom tegen `http://100.108.127.86:4300/` → exit 0, `shots/before-*.png`.
- Waarnemingen vóór: (1) histogram: labels 7–9 px; x-as-labels staan ín de plot met 32 px lege strook eronder; de "Nu"-pil botst met de cursorpil; de dagchip "VANDAAG" plakt in de hoek. (2) `.source` ligt 2 px van de rand met 3 px radius, los van de kaarthoek. (5) Desktop: Groningen mist zijn temperatuur. Mobiel: alleen 6 labels in beeld.

## 2026-09-23T16:00 — Punt 5: temperatuurlabels (incl. PO-aanvulling minimale dichtheid)

- **Diagnose "maar 4 labels"** (meting met `labels.mjs`, telt geplaatste symbols via `queryRenderedFeatures` tegen de bronfeatures in beeld; vereist een tijdelijke dev-only `window.__map`-hook, niet gecommit):
  (a) De set was 10 vaste steden. Op een telefoon staat op zoom 6,4 maar 6–7 ervan in beeld, en bij inzoomen (zoom 8) nog 1. Dat is het grootste deel van de klacht.
  (b) De temperatuurlaag stond onder álle basemaptekst (t3j: vóór de eerste tekstlaag). Waternamen, POI's, dorpen en `label_other` wonnen dus de collision. Op zoom 8 in de Randstad vielen daardoor Rotterdam, Utrecht, Den Haag, Dordrecht en Gouda weg.
- **Oplossing:**
  - `temperaturePlaces`: 66 plaatsen in prioriteitsvolgorde. De kop dekt alle provincies, Zeeland via Middelburg. De staart vult de kust en de eilanden (Den Helder, Den Burg, West-Terschelling, Harlingen, Dokkum, Delfzijl, Hoek van Holland, IJmuiden, Vlissingen, Zierikzee, Terneuzen).
  - `selectTemperaturePlaces(zoom, spacingPx)`: greedy Poisson-disk selectie in Web-Mercator-pixels op halve zoomstappen. Elke weggelaten kandidaat ligt binnen `spacing` van een gekozen label, dus de afstand is ook de grootste labelvrije gat. Dat is de minimale dichtheid die de PO vroeg.
  - `TEMPERATURE_LABEL_SPACING = { viewportFraction: 1/7, minimumPx: 56, maximumPx: 96 }` → spacing = clamp(min(b,h)/7). Een vaste 84 px gaf op mobiel na U6 (overzicht zoom 5,6) maar 6 labels, desktop 15. In ?dev staat een knop "Temp-afstand" (px, overschrijft auto).
  - `symbol-sort-key: rank`, zodat prioriteitsplaatsen binnen de laag winnen.
  - `temperatureLayerBeforeId`: de laag komt nu vóór de eerste place-laag met town/city/state/country. Temperaturen winnen van waternamen, POI's en dorpen, maar wijken nog steeds uit voor stads-, gemeente- en regionamen (t3j-dodge blijft: overlap uit, variable anchors).
  - Herberekening op `zoomend`.
- **Meting na** (prod-data, na merge van main met U6 contain):
  - desktop 1440×900: overzicht z6,96 → 12/12 geplaatst, z7,2 → 16/17, z8 → 26/27.
  - Pixel 5: overzicht z5,59 → 11/11, z6 → 14/14, z6,6 → 15/15, z7,2 → 15/16, z8 → 7/8.
  - Missers zijn incidenteel en wisselen per zoom (Arnhem, Utrecht, Den Haag, Venlo): alle acht ankers botsen daar met de eigen stadsnaam plus buren. Een gekozen label dat door collision wegvalt, wordt niet door een buur vervangen. Dat is een bewuste grens: de dodge heeft voorrang.
- Tests (`temperature.test.ts`): elke kandidaat valt in precies één provincie; bij zes zoom/spacing-paren ligt geen kandidaat verder dan de spacing van een label, en onderling liggen de labels ≥ spacing uit elkaar; Zeeland altijd op het overzicht (zoom 5–7); alle provincies op zoom 7; ~10 op het overzicht voor telefoon en desktop, ≥20 ingezoomd; monotoon dichter bij inzoomen. `basemap.test.ts`: laagvolgorde.

## 2026-09-23T16:30 — Punten 1–4 en 6

- **1 Histogram:**
  - Hoogte 180→214 px (desktop 196→232). Lettergroottes 7–9 → 9–11 px. Horizonknoppen 28 px hoog (touch).
  - De x-as staat nu ónder de plot (was: erin, met 32 px dode strook). De cursorpil staat in een eigen strook boven de plot.
  - De "Nu"-pil staat op de x-as en het uurlabel onder hem wijkt. Daardoor botst hij niet meer met de cursorpil en dekt hij geen balken meer af.
  - `hourLabelStep`: 1/2/3/6/12/24 u zodat labels ≥ 34 px uit elkaar staan (ResizeObserver op de plot). Middernacht toont de dagafkorting ("za"). Een dagchip met minder dan 80 px ruimte tot de rechterrand verdwijnt, dus geen afgekapt "MORG…" meer. Uurlijnen zonder label zijn lichter.
  - Balken opacity .72→.85.
  - Vóór: `shots/before-*-scrubber.png`. Na: `after-*-scrubber.png` (prod-data, droog) en `after-synth-*-scrubber.png` (synth, met regen).
- **2 Hoek:** `.source` ligt nu kant-en-klaar in de hoek (right/bottom 0). Radius 9 px alleen linksboven, `env(safe-area-inset-right)` in de padding, 10 px tekst. Zie `after-*-corner.png`. Onderrand-safe-area is niet nodig: op mobiel ligt de kaart niet tegen de schermonderrand.
- **3 Splash:** de druppel veert (`translate`, zodat de bestaande `transform`-val bij ready gewoon composeert) en een rimpel spreidt waar hij neerkomt. Periode 1,6 s, CSS-only, loopt tot `.ready`. Bij `prefers-reduced-motion` geen beweging, alleen een zachte opacity-ademhaling. "Herhaal splash" en de slowdown blijven werken: animaties hangen aan `:not(.ready)`. Een stilstaand frame staat in `after-*-splash.png`; de beweging beoordeel je live.
- **4 About:** `components/About.tsx` bevat de bronregel plus een "i"-knop (`aria-haspopup="dialog"`) en een native `<dialog>` met `showModal`. Escape is native, klikken op de backdrop sluit, de sluitknop krijgt autofocus en de focus gaat terug naar de trigger. Tekst: kernboodschap, vijf bronnen, privacyregel, link naar https://github.com/mathijshenquet/motregen. Geen externe fonts of tracking. Tailwind-preflight zette de dialog-margin op 0 (niet gecentreerd), gerepareerd met `inset:0; margin:auto`. Test: `About.test.tsx` (jsdom mist `showModal`; het open/close-contract is in de test gemodelleerd). Zie `after-*-about.png`.
- **6 README:** Nederlands en productgericht: wat, voor wie, de vier KNMI-bronnen, de één-tijdlijn-belofte, gratis/geen reclame/open source/geen tracking, "zelf draaien" (devenv, cargo ingest, caddy, pnpm) en `docs/`. Geen `.dev/`, geen MIP's. De AROME-horizon staat er als "tot een etmaal": live eindigt de manifest ~21 u vooruit (arome-hours 24). De oude README zei "+2 dagen".
- App.tsx-diff klein gehouden: About-import en -tag, temperatuurselectie + `zoomend` + één debugregel.

## 2026-09-23T16:45 — Gates (na merge van origin/main `07cda00`)

- `pnpm typecheck` → TYPECHECK-EXIT: 0
- `pnpm test` → TEST-EXIT: 0 (29 files, 127 tests)
- `pnpm build` → BUILD-EXIT: 0
- `MOTREGEN_E2E_PORT=4287 MOTREGEN_E2E_DATA_PORT=8287 pnpm e2e` → E2E-EXIT: 0 (6 passed, 3 skipped). Passief Fast 3G 719.874 B ≤ 800.000, warm chunks 0 B.
- Repro vanuit `web/` met `direnv exec ..`. Screenshots: preview met `MOTREGEN_DATA_ORIGIN=https://motregen.nl/data` (prod) of `MOTREGEN_SYNTH=1 MOTREGEN_DATA_ORIGIN=` (synth; zonder SYNTH valt `vite preview` terug op de dev-proxy naar :8080). Daarna `shots.mjs`; `CLICK="440,330;140,125"` kiest op synth een plek in de bui.

## Open

- **MET PO — LICENSE:** er is geen LICENSE-bestand, terwijl README en About "open source" beloven. Kies een licentie (bv. MIT/Apache-2.0 voor code; let op ODbL voor eventuele OSM-afgeleide data). Ik heb er bewust geen gekozen.
- MET PO, op zicht: de splashbeweging (live bekijken), de labeldichtheid (`?dev` → "Temp-afstand"), en of temperaturen boven dorpen/waternamen mogen winnen.
- Gezien, niet van deze track: op mobiel staat onder de kaart een lege witte band van ~60 px vóór het histogram (ook in `before-pixel5-page.png`, waarschijnlijk een leeg `current-weather`-blok).
- Klein: op mobiel bij stap 2 u verdwijnen beide uurlabels naast "Nu" (< 30 px). Aanvaardbaar, maar de linkerkant van de as kan dan leeg ogen.
