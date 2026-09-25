# U23 — tabelkoppen als modeknoppen — LOG

## 2026-09-25 08:40 start (claude opus 5.5 worker)
- Spec + Read-first gelezen. Worktree-setup: `direnv allow` (identiek aan hoofd-.envrc), `pnpm install`,
  fixture `web/public/data/chunks/uv_clear-20260828.mrf` uit de hoofdcheckout gekopieerd (gitignored, zoals U19).
- Probe `probe.mjs` (in deze map; kopiëren naar `web/tmp/`, draaien vanuit `web/` via `direnv exec .` buiten
  de sandbox, tegen synthgen-data op 8362 + preview op 4362, vaste klok 14:58Z): koppenbreedtes + screenshots
  tabel rust en Gevoel gepind; desktop, Pixel 5, 320 px; licht/donker.
- Vóór-breedtes (CSS px) op 320: Uur 72 + Weer 48 = 120 → budget voor de samengevoegde cel.

## 2026-09-25 09:05 implementatie
- `ForecastTable`: koppenrij met Lucide-iconen (`BUTTON_ICON`, 18 px, stroke 2 — dezelfde set als de knoppen
  elders): Weer `CloudSun` (zonder wolkdata "Uur" + `Clock`), UV `Sun`, Gevoel `Thermometer`, RV `Droplets`,
  Wind `Wind`, Regen `CloudRain`. Icoon boven het woord (smaller dan ernaast; past op 320).
- Weer = knop zonder `aria-pressed`; klik zet een pin uit (`onTogglePin(pinned)`), zonder pin doet hij niets en
  heeft hij geen hoverstijl/`cursor: default`. Geen nieuwe prop nodig.
- UV/RV/Regen: gewone `<th>` met icoon + woord, geen knop. Waarom: een uitgeschakelde knop wordt door
  schermlezers als "knop, niet beschikbaar" voorgelezen — dat belooft een modus die (nog) niet bestaat en voegt
  lege tabstops/ruis toe; een kolomkop leest precies wat het is. Visueel dezelfde `.column-mode`-vorm.
- Actieve (gepinde) modus: `.forecast-table[data-mode]`; knop `--accent` op `--accent-soft`, volle kop; kolom
  (kop + cellen) krijgt `--accent-soft` op 40 % als `background-image`-laag, zodat hij over de nu-rij/verleden-
  tint heen composeert i.p.v. die te vervangen.
- Uur + Weer: één cel (`td.weather-cell > .time-weather`): tijd + dag/"Nu" (+ zon-marker) links, icoon rechts.
- `SunGlyph`: pijl weg, viewBox bijgesneden tot horizon + halve schijf; `sun-row` gecentreerd.
- Stijlen gescoped op `.forecast-table th` (PerfHud gebruikt ook de globale `th`). Coarse-pointer: de oude
  `::after`-hitbox (−12/−4 px) botste met volle-breedte knoppen → `min-height: 44px` op `.column-mode`.
- Na-breedtes op 320: Weer 114 (≤ 120 ✓). Pixel 5: tabel past nu zonder horizontale scroll (369/369, was
  375/369). 320: nog steeds 367/296 horizontale scroll (vóór 375/296) — buiten scope, zie open punten.
