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

## 2026-09-25 08:50 spec-aanvulling (PO 2026-09-25, later op de dag) — vult de spec aan
Via de orchestrator/PO in de worker-sessie ontvangen; letterlijk samengevat:
1. Kolom Regen weg; regen bij het weericoon als klein mm/u-getal, alleen als ≠ 0 (afronding zoals nu).
2. Zonicoon mist een straal linksonder — weericonenset (`WeatherIcon.tsx`) nalopen en symmetrisch maken.
3. UV: UvBar schalen naar het maximaal haalbare voor die dag (heldere-hemel-UV op de zonnestand van die dag,
   uv_clear of uit zonshoogte), zodat een volle balk "maximaal voor nu" betekent; kleuren (WHO) blijven leidend,
   lengte relatief. Keuze motiveren.
4. Wind: visuele richtingsaanduiding proberen (pijl in windrichting + Bft); 2 varianten als stills, één kiezen.
5. RV: één interessantere weergave proberen (druppelbalk / dauwpunt-tint), still; zo niet beter, tekst laten.
Vóór-screenshots van main staan in `web/tmp/shots/voor/` (main apart gebouwd in een tijdelijke worktree).

## 2026-09-25 09:20 tweede spec-aanvulling (PO 2026-09-25) — vult de spec aan
6. Tabel niet snug gecentreerd: onnodige linker/rechter padding weg, tabel vult de paneelbreedte, kolommen gecentreerd.
7. Rij "Afgelopen N uur tonen": op desktop weg — historie staat in de tabel, tabel opent gescrold op de nu-rij met
   de historie erboven; op mobiel (pointer: coarse) blijft de toggle (touch-scrollprobleem), maar netter: kleine
   gecentreerde tekstknop zonder driehoekje.
8. Nu-rij: de linkerrand laat de tijd inspringen → achtergrondtint of marker buiten de tekstkolom, niets springt in.
