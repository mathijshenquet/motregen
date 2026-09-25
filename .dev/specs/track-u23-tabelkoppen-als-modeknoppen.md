# Track U23 — tabelkoppen als modeknoppen met icoon; uur+weer samen; zon op/onder kaal (claude opus 5.5)

Read first: `AGENTS.md`, `web/src/components/ForecastTable.tsx`
(`FocusHeading`, kolommen, `SunGlyph`, `sunForm`), `web/src/core/
focus-mode.ts` (`FocusKind`), `web/src/App.tsx` (hoe `focus`/`windFocus`
worden gezet vanuit de tabel: `onTogglePin`/`onFocus`, en `columns`),
`web/src/components/icons.ts` (Lucide-set uit U11), `web/src/styles.css`
(tabel-CSS rond regel 520–600, `.column-focus`, `.sun-*`, mobiel ≤430),
`.dev/tracks/u19-focus-triggers/LOG.md` (waarom focus alleen nog via de
kolomkop loopt). Your LOG: `.dev/tracks/u23-tabelkoppen-als-modeknoppen/
LOG.md` — committed, append-only, timestamped. Branch
`track/u23-tabelkoppen-als-modeknoppen` vanaf main. Eigen worktree. Preview:
http://ageq-mthq:4300/.

## PO (2026-09-25)

"Er komt een nieuwe visual language ding bij. De tabel headers worden groter
en krijgen een icoontje, die zijn ook zichtbaar op mobile. Het zijn zowel
tabel headers als mode knoppen." En: "bij zon op / zon onder pijltje
weghalen, en plaats wellicht in midden? merge uur en weer, dit is de default
mode, die hoeft niet aangegeven."

## Opdracht

### 1. Koppenrij = modebalk

- Elke kolomkop wordt een knop met **icoon boven (of vóór) het woord**, in
  een grotere maat dan de huidige 10 px-uppercase koppen: icoon 18 px,
  woord 12 px op desktop; op mobiel (≤ 430) blijft het icoon 18 px en het
  woord 10 px of valt weg met `aria-label`. Koppen zijn altijd zichtbaar,
  ook op mobiel (nu vallen ze deels weg of zijn ze te klein).
- Iconen (Lucide, al in `icons.ts` of daar toevoegen):
  Weer → `CloudSun`, Gevoel → `Thermometer`, Wind → `Wind`, UV → `Sun`,
  RV → `Droplets`, Regen → `CloudRain`. Eén set, één stroke-breedte.
- Modes = wat de kaart toont. Bestaande `FocusKind` blijft `'temperature' |
  'wind'`; voeg géén nieuwe kaartmodes toe. Gedrag:
  - **Weer** (uur + weericoon, zie punt 2) is de default. Geen
    `aria-pressed`, geen actieve stijl: de default hoeft niet aangegeven.
    Klik op Weer zet een gepinde focus uit (terug naar default).
  - **Gevoel** en **Wind** pinnen/ontpinnen zoals nu (`onTogglePin`),
    hover/toetsenbordfocus blijft de tijdelijke focus geven (U19).
  - UV, RV, Regen zijn (nog) geen kaartmodes: ze hebben wel het icoon en de
    grotere kop, maar zijn geen knop (of een uitgeschakelde knop zonder
    hover — kies wat toegankelijker leest, motiveer in de LOG).
- Actieve mode: icoon + woord in `--accent` op `--accent-soft`, afgeronde
  achtergrond die de hele kop vult (niet de huidige dotted underline).
- De hele kolom van de actieve mode krijgt een lichte tint
  (`--accent-soft` op ~40 %) zodat kop en cellen als één ding lezen.

### 2. Uur en weer samen

- De kolommen "Uur" en "Weer" worden één kolom: `hh:mm` + dagafkorting/"Nu"
  links, weericoon rechts daarvan, in één cel. De kop is "Weer" met
  `CloudSun`. `columns.weather` blijft bestaan voor het geval er geen
  wolkendata is: dan toont de cel alleen de tijd en heet de kop "Uur"
  (icoon `Clock`).
- Cel-breedte: de gecombineerde cel mag niet breder zijn dan de twee oude
  kolommen samen op 320 px.

### 3. Zon op / zon onder

- `SunGlyph` verliest de pijl (`sun-glyph-arrow`); alleen horizon + halve
  schijf. Op/onder wordt door de tekst gedragen ("Zon op 07:12").
- De `sun-row` centreert zijn inhoud (glyph + tekst) over de volle
  tabelbreedte in plaats van de linkse `margin-left: 44px`. De
  marker-vorm (`sunForm === 'marker'`) volgt: glyph zonder pijl.

### 4. Tests en screenshots

- Unit-tests voor `ForecastTable`: koppen renderen met icoon en label; Weer
  heeft geen `aria-pressed`; klik op Weer ontpint; klik op Gevoel pint.
- `focus.spec.ts` (e2e) bijwerken op de nieuwe knoppen. Screenshots vóór/na
  op desktop, Pixel 5 en 320 px, licht en donker, in de LOG.

## Niet doen

- Geen nieuwe kaartlagen of modes voor UV/RV/Regen. Geen wijzigingen aan
  de klok/zoekpil (U22), wind (U24) of isolijnen (U25).

## Gates

`pnpm typecheck`, `pnpm test`, `pnpm build`, `MOTREGEN_E2E_PORT=4362
MOTREGEN_E2E_DATA_PORT=8362 pnpm e2e` (hostlock, load < 16, één Chromium,
poorten vooraf vrij) groen, synchrone exit statussen in de LOG. Draft-PR
vroeg. Geen codex.

## Aanvulling PO (2026-09-25, later; als queued prompt aan de worker gestuurd)

1. Kolom Regen weg; regen als klein mm/u-getal bij het weericoon, alleen als ≠ 0.
2. Zonicoon mist een straal linksonder — weericonen-set herstellen (symmetrisch).
3. UV-balk schalen naar het maximaal haalbare voor de tijd van het jaar (heldere hemel
   op de zonnestand van die dag); kleuren blijven WHO-leidend, lengte wordt relatief.
4. Windkolom: visuele richting (geroteerde pijl + Bft); twee varianten als stills.
5. RV: één interessantere weergave proberen; anders tekst laten en dat zeggen.

## Tweede aanvulling PO (2026-09-25; als queued prompt gestuurd)

6. Tabel snug gecentreerd: onnodige links/rechts-padding weg.
7. "Afgelopen N uur tonen": desktop weg — historie staat in de tabel, tabel opent
   gescrold op de nu-rij; mobiel houdt een nettere toggle (touch-scrollprobleem).
8. Current-hour-rij: geen left border die de tijd laat inspringen; tint of marker
   buiten de tekstkolom.
