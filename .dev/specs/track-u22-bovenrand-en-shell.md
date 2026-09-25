# Track U22 — bovenrand vast, klok kaal, merk rechtsboven, zoekpil smal, scrubber stiller (claude opus 5.5)

Read first: `AGENTS.md`, `.dev/specs/track-u21-klok-midden-boven.md` en
`.dev/tracks/u21-klok-midden-boven/LOG.md` (wat U21 bouwde en waarom),
`web/src/components/Freshness.tsx`, `web/src/components/About.tsx`,
`web/src/components/LocationSearch.tsx`, `web/src/components/
HistogramScrubber.tsx`, `web/src/App.tsx` (overlay-JSX rond regel 1600–
1665, `NavigationControl` regel ~294, thema-state regel ~218/394, overlay-
insets voor de contain-fit), `web/src/styles.css` (`.map-clock*`,
`.search*`, `.map-brand`, `.regimes`, `.rain-bars`-bandlabels, media queries
≤430/≤768/≤959). Your LOG: `.dev/tracks/u22-bovenrand-en-shell/LOG.md` —
committed, append-only, timestamped. Branch `track/u22-bovenrand-en-shell`
vanaf main. Eigen worktree. Preview: http://ageq-mthq:4300/.

## PO (2026-09-25, na het zien van U21)

Letterlijk: "ten eerste wil ik liever alleen de klok hebben, kijk ff naar
die opties die er in zitten, die mogen weg, doe ook maar radar {tijd} weg
liever alleen een amber button naast 'observatie' / 'voorspelling' en
'trend' en dat allemaal er onder, niet meer color coden dat woord, de amber
button geeft data freshness aan, on click meer detail. Doe maar die kleur
van observatie/voorspelling/trend aan beide kanten, maak ook het ding niet
floating maar aan de bovenkant vast." Verder: "motregen.nl rechts boven, en
dan alleen de druppel / setting icon. De darkmode switcher gaat dan samen
met de uitleg in een modal menu ding. Haal de +/- knop weg bij de kaart."
Zoekbalk: "de text is te klein, het gaat er vooral om dat het element
minder breed is … gewoon vooral een icon + waar we nu op geselecteerd zijn,
thats it." Scrubber: "'zwaar/matig/licht' weghalen, dit moet gecommuniceerd
worden met kleuren, je kan ook 'vandaag' weghalen."

## Opdracht

### 1. Klok: één element, vast aan de bovenrand

- De U21-smaakvarianten gaan eruit: `?klok=stip` / `accent`-prop en
  `?zoekpaneel=omsluit` / `variant`-prop met hun CSS-takken en tests. Wat
  overblijft is één vorm, geen query-switches.
- Inhoud van de klok, van boven naar beneden:
  1. de kaarttijd groot (zoals nu `clock-map-time`, met de dagafkorting
     alleen als de kaartdag ≠ vandaag);
  2. daaronder één regel: het regimewoord in **gewone tekstkleur** (niet
     meer in de bronkleur) plus direct ernaast een kleine **amber knop**
     (rond, ~10 px) die de dataversheid draagt. De "radar 14:35 · 3 min"-
     tekst verdwijnt; die informatie zit in het detailpaneel.
- Regimewoorden (vervangt radar/nowcast/model, en ook de labels in
  `time-model.ts` zodat scrubber-aria en klok hetzelfde zeggen):
  rtcor → **observatie**, nowcast → **voorspelling**, HARMONIE → **trend**.
- De bronkleur (`--history`/`--nowcast`/`--model`, zelfde als de
  scrubberbalk) staat nu als 3 px rand aan **beide** zijkanten van de klok
  (links én rechts), niet meer als woordkleur en niet meer als stip.
- Amber knop = de bestaande versheidsstatus. Voorstel (PO kan bijsturen):
  `fresh` → verzadigd amber, `aging` → amber met een dunne ring/pulse,
  `stale`/`offline` → dezelfde vorm in `--stale`-rood. De knop (en de hele
  klok, zoals nu) opent het bestaande versheidspaneel; de knop krijgt een
  eigen `aria-label` ("Dataversheid: vers, radar 14:35, 3 min oud").
  Contrast van amber op de lichte én donkere klok checken (≥ 3:1 als
  grafisch element).
- **Vast aan de bovenkant**: de klok is geen zwevende pil meer. Hij hangt
  aan de bovenrand van het kaartvlak (top 0 + safe-area), zonder bovenste
  afronding en zonder schaduw naar boven: een tab die uit de rand hangt
  (afgeronde onderhoeken, zijranden in bronkleur, onder- en zijschaduw).
  Desktop én mobiel gecentreerd; de U21-"tweede rij"-uitwijk vervalt omdat
  de zoekpil (punt 4) smal genoeg wordt om altijd naast de klok te passen.
  Werk de overlay-insets (contain-fit, U14/U21) bij op de nieuwe hoogte.
- Freshness-tests en `freshness.spec.ts` bijwerken: gecentreerd, top-
  aligned, geen overlap met zoekpil links en merk rechts; amber knop
  aanwezig en klikbaar; regimewoord wisselt met de scrubberpositie.

### 2. Merk rechtsboven als icoonknop; About + thema in één modal

- De `.map-brand`-knop (druppel + "motregen.nl" + info-icoon, nu linksonder
  desktop / boven op mobiel) wordt een ronde icoonknop **rechtsboven** op de
  kaart met **alleen de druppel** (`/droplet.svg`), `aria-label="Over
  motregen en instellingen"`. Zelfde `round-action`-maat als de huidige
  themaknop. Triple-tap → PerfHud blijft werken (`About.tsx`).
- De losse themaknop op mobiel (`mobile-map-theme`) en het `segmented
  sidebar-theme`-blok in de sidebar-nav gaan weg. Het thema wordt een sectie
  in de About-modal: kop "Weergave", daaronder de bestaande segmented
  Licht / Donker / Systeem (zelfde `setTheme`, zelfde opslag). Zet de
  sectie bovenaan de modal, boven de uitleg — het is de enige instelling.
- De modal heet niet meer "Over motregen" maar "motregen.nl" (druppel +
  woordmerk als header, dat is nu de enige plek waar het woordmerk staat
  naast de splash). De `.source`-regel ("Bron: KNMI · Kaart: OpenFreeMap")
  blijft waar hij staat.
- Als de `sidebar-nav` daarmee alleen nog de UV-chip bevat: chip blijft,
  lege ruimte niet (controleer de mobiele layout uit U14: geen lege band).

### 3. Zoomknoppen weg

- `map.addControl(new maplibregl.NavigationControl(...))` verwijderen,
  inclusief de `.maplibregl-ctrl*`-CSS die alleen daarvoor bestond. Scroll,
  pinch en dubbelklik blijven; `map-zoom.spec.ts` gebruikt eventueel de
  knoppen — vervang door `map.zoomTo` via `page.evaluate` of wheel-events.

### 4. Zoekpil: icoon + huidige plaats, smal

- In rust toont de pil alleen het zoekicoon en de **naam van de huidige
  locatie** (zoals `locationLabel`), in 14 px (was 13 px in een 240 px
  pil). Breedte = inhoud + padding, `max-width` ~ 200 px met ellipsis; geen
  vaste 240 px meer. Het favoriet-sterretje in rust verplaatst naar het
  open paneel (naast het veld) — rust is echt alleen icoon + naam.
- Open blijft de bestaande uitvouwvorm (variant A uit U21, nu de enige):
  veld 14 px, resultaten/favorieten eronder, buiten-tik-schild, ×, Escape.
- `location.spec.ts` en de LocationSearch-tests bijwerken op de nieuwe
  rustbreedte en de verplaatste favorietknop.

### 5. Scrubber

- Bandlabels "Zwaar / Matig / Licht" (`bandLabels` + `.rain-bars`-labels)
  weg; de kleurbanden en de guides blijven. Aria-teksten houden de
  klassificatie (`classifyRain`) wél — die is voor de schermlezer.
- Daglabel "Vandaag" niet meer tonen; "Morgen" / "Gisteren" / weekdag
  blijven op hun plek (`dayLabel` levert `''` voor vandaag, het label-
  element wordt dan niet gerenderd — geen lege pil).

## Niet doen

- Geen nieuwe smaakvarianten of query-switches; de PO kiest op zicht via
  screenshots in de LOG (vóór/na, licht/donker, desktop + Pixel 5 + 320 px).
- De tabelkoppen (U23), wind (U24) en temperatuurkaart (U25) zijn aparte
  tracks — niet aanraken.

## Gates

`pnpm typecheck`, `pnpm test`, `pnpm build`, `MOTREGEN_E2E_PORT=4360
MOTREGEN_E2E_DATA_PORT=8360 pnpm e2e` (hostlock, load < 16, één Chromium,
poorten vooraf vrij) groen, synchrone exit statussen in de LOG. Draft-PR
vroeg. Geen codex.
