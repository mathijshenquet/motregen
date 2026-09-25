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

## 2026-09-25 09:05 aanvulling 1 uitgevoerd (commit 9d30fde, samen met aanvulling 2)
1. Regen: kolom weg; `span.rain-amount` onder het weericoon ("1,1 mm/u", accent, 11 px), alleen als de afgeronde
   waarde ≠ "0" (0,004 → niets; afronding ongewijzigd: < 1 → 2 decimalen, anders 1). Geen "…"-placeholder meer
   voor ongeladen regen (zou onder elk icoon ruis geven); de rij toont dan gewoon geen getal. `rainLoaded` uit
   `ForecastSeries`. Werkt ook zonder wolkdata (kop "Uur", getal zonder icoon).
2. Zonstraal: de eigen `WeatherIcon`-zon (niet Lucide) had 7 stralen — linksonder ontbrak (`M6.7 14.3l-2.1 2.1`
   toegevoegd, spiegelbeeld van rechtsboven). Lucide `Sun`/`CloudSun` zijn compleet (8 stralen).
3. UV relatief: `dailyClearSkyUvMax(epoch, lat)` = `clearSkyUv` op de middagzon van die dag
   (sin h = cos(φ − δ)). Keuze uit zonshoogte i.p.v. de max van uv_clear, omdat (a) die altijd bestaat, ook voor
   dagen/uren zonder KNMI-uv_clear en voor de geschatte rijen; (b) per dag stabiel is — een max over geladen
   uv_clear-waarden zou verspringen naarmate rijen binnenkomen; (c) dezelfde formule al de heldere-hemel-waarde
   voor geschatte uren levert, dus fill ≤ plafond. Waar KNMI-uv_clear/meting het model overtreft, groeit de schaal
   mee (`max(scale, clear, value)`), dus nooit > 100 %. De kleur blijft de absolute WHO-klasse; de vage klassenband
   onder de vulling schuift mee (grenzen 3/6/8/11 als % van de dagschaal via `--uv-band-n`), zodat de band eerlijk
   blijft (eind augustus De Bilt ≈ 4,5 → groen tot 67 %, geel daarna). De zijbalk-UV-chip blijft absoluut (0–12).
   Unit-test: plafond = max over de dag (10-min raster), juni > 6, december < 1.
4. Wind — twee varianten (stills `web/tmp/shots/{na,variant-kompas-dauwpunt}/`):
   A `pijl` (standaard): Lucide `ArrowUp` 15 px in accent, gedraaid naar waar de wind héén waait (zoals de deeltjes
   op de kaart) + "3 Bft"; richting in letters in `aria-label`/`title` ("Wind uit W, 3 Bft, 4,2 m/s").
   B `kompas` (`?wind=kompas`): ring met `Navigation2`, Bft groot met windstreek eronder.
   **Gekozen: A.** Eén glyph die de richting draagt, rustig in de kolom; B zegt de richting twee keer (pijl + letter)
   en de ring is visuele ruis op 20 px. Op ≤ 360 px valt "Bft" weg (label noemt het nog) — daardoor past de tabel
   op 320 zonder horizontale scroll.
5. RV — geprobeerd: dauwpunt (Magnus, Alduchov & Eskridge) als tweede regel onder het %, met druppelicoon, oranje
   vanaf 16° (benauwd). Still in `variant-kompas-dauwpunt/`, achter `?rv=dauwpunt`. **Oordeel: niet duidelijk beter,
   tekst blijft standaard.** Informatief wel (benauwdheid zegt meer dan RV), maar het kleine "💧9°" leest als een
   tweede temperatuur en lijkt te veel op de luchttemperatuur onder Gevoel. Als de PO benauwdheid wil, is een
   eigen label ("benauwd") of een tint op de Gevoel-cel waarschijnlijk sterker — PO-keuze.

## 2026-09-25 09:05 aanvulling 2 uitgevoerd
6. Snug: paneelpadding 24→16 (desktop) / 12→8 (mobiel, liggend 10→8), eerste en laatste kolom krijgen allebei
   8 px (was 0 links, 6 rechts → scheef); celinhoud gecentreerd onder de gecentreerde koppen; de Weer-kolom krimpt
   tot zijn inhoud (`width: 1%`), de rest van de breedte verdeelt zich over de overige kolommen. Tabeltekst lijnt
   nu uit met de scrubber (16 + 8 = 24 desktop, 8 + 8 = 16 mobiel).
7. Historie: `historyInline` = `(min-width: 960px) and (pointer: fine)` (live via matchMedia-listener).
   - Desktop: geen toggle; historierijen staan boven de nu-rij. De zijbalk wordt een flexkolom (nav + scrubber vast,
     alleen `.table-scroll` scrolt) — anders zou "openen op de nu-rij" de scrubber uit beeld scrollen. Bijvangst:
     de sticky kop werkt nu echt (hij plakte vóór U23 aan een niet-scrollende `.table-scroll`).
     Openen op nu: ResizeObserver op scroller + tabel, eenmalig scrollen zodra de tabel scrollbaar is (de ref vuurt
     vóór DOM-insertie en de eerste rijen passen nog — twee valkuilen, beide doorgemeten: scrollTop 0 → 354–360).
     Historiedata lazy: IntersectionObserver op de verleden rijen, pas na het scrollen aangezet → geen extra bytes
     in de standaardsessie tenzij je omhoog scrolt (of de volledige reeks komt toch binnen — die bevat de historie al).
   - Touch (en smalle vensters): toggle blijft, nu kleine gecentreerde accent-tekstknop zonder driehoekje.
     Keuze: smal venster met muis (< 960) houdt ook de toggle — daar is de pagina zelf de scroller en zou de
     historie de nu-rij naar beneden duwen.
8. Nu-rij: `padding-left: 9px` weg; de 3 px-accentmarkering staat in de 8 px-goot die elke eerste cel heeft →
   niets springt in (tijden lijnen in alle rijen uit, zie stills).
- Breedtes na (CSS px, probe): desktop Weer 117 · UV 74 · Gevoel 87 · RV 72 · Wind 86 (437/437);
  Pixel 5 377/377; 320: 304/304 — vóór U23 had 320 horizontale scroll (375/296), Pixel 5 ook (375/369).

## 2026-09-25 09:26 gates run 1 (head 9d30fde) — e2e ROOD, oorzaak gevonden
- `pnpm typecheck` → TYPECHECK-EXIT: 0; `pnpm test` → TEST-EXIT: 0 (42 files, 245 tests); `pnpm build` → BUILD-EXIT: 0.
- `MOTREGEN_E2E_PORT=4362 MOTREGEN_E2E_DATA_PORT=8362 pnpm e2e` (load 15,1 bij start, poorten vrij, hostlock)
  → **E2E-EXIT: 1** — 30 passed, 26 skipped, 1 failed: desktop `perf.spec` passieve chunkbytes 846 660 > 800 000.
  Alle focus-tests groen.
- Oorzaak (gemeten met `tmp/debug4.mjs`, per chunk): de historie laadde in de passieve fase (alle `*-hist4`-bodies).
  De scroll-naar-nu gebeurde terwijl de nu-rij nog de eerste rij was (historie wordt later bóven nu ingevoegd) en
  de ResizeObserver hing aan de nu-rij-owner: bij het herberekenen van de rijen ruimde Solid hem op → geen herpin,
  de historierijen bleven in beeld en de historie-observer vuurde.
- Fix (cf99c9c): de nu-rij blijft bij elke groei van tabel/scroller vastgepind tot de gebruiker de tabel aanraakt
  (wheel/pointerdown/touchstart/keydown); cleanup op tabelniveau; pas bij dat loslaten gaat de historie-observer aan.
  Meting na fix: passief 879 908 B response-body — **identiek aan main** (zelfde script tegen een main-build op 4363);
  nu-rij op offset 0, historie `pending`; na wheel omhoog laadt de historie (6 extra hist4-requests).
  Nieuw: `e2e/table.spec.ts` (desktop: opent op nu, geen historiedata vóór scrollen, wel erna; touch: toggle).
- Gerichte run `pnpm e2e e2e/table.spec.ts e2e/perf.spec.ts` → E2E-TARGET-EXIT: 1 — desktop perf ✓, table ✓ ×2,
  mobile-4g perf ✓; **mobile-fast-3g perf ✘ op de logo-triple-tap** (2e triple-tap opende About i.p.v. de HUD).
  Dezelfde stap was groen in run 1; U23 raakt merk/About/tap-telling niet; T5b-LOG kent dezelfde flake onder
  CPU 4× (700 ms-venster), host-load stond op 12–13 met andere tracks op de lock. Volledige gate opnieuw → zie hieronder.

## 2026-09-25 10:32 procesaanpassing + eindstand (klaar voor review)
- PO-procesaanpassing ontvangen: e2e via twee slots (`web/scripts/e2e-slot.sh`), workers draaien alleen eigen/geraakte
  specs; de volledige suite draait de orkestrator op de rebased merge-kandidaat. Mijn tweede volledige run stond nog
  op de oude lock te wachten (niet gestart) → gestopt en vervangen door een gerichte run. (De andere wachtende
  `flock /tmp/motregen-e2e.lock` op de host hoorde bij U25 — niet aangeraakt.)
- Gerebased op origin/main 2cee6eb (bevat 211b57f), conflictvrij; `pnpm install --frozen-lockfile`.
  Head 2314cf7 → force-with-lease gepusht.

### Receipts (synchroon, head 2314cf7 op main 2cee6eb)
- `pnpm typecheck` → TYPECHECK-EXIT: 0
- `pnpm test` → TEST-EXIT: 0 (43 files, 255 tests)
- `pnpm build` → BUILD-EXIT: 0
- Gericht, onder slot: `MOTREGEN_E2E_PORT=4362 MOTREGEN_E2E_DATA_PORT=8362 pnpm e2e e2e/focus.spec.ts e2e/table.spec.ts e2e/perf.spec.ts`
  (load 15,2 bij start, poorten vrij) → **E2E-TARGET-EXIT: 0** — 14 passed, 22 skipped (één-profiel-tests), 3,8 min.
  Specs: `focus.spec` (gewijzigd: Weer ontpint, geen aria-pressed), `table.spec` (nieuw: desktop opent op nu en
  laadt historie pas na scrollen; touch-toggle), `perf.spec` (geraakt door zijbalklayout/laadgedrag; groen op
  desktop, mobile-4g én mobile-fast-3g — de triple-tap-flake van de vorige gerichte run kwam niet terug).
- Eerdere volledige run (vóór de pin-fix, head 9d30fde): E2E-EXIT 1, alleen desktop perf passieve bytes — zie 09:26.

### Samenvatting
- Koppenrij = modebalk (Lucide-icoon + woord; Weer default zonder aria-pressed, klik ontpint; Gevoel/Wind pinnen;
  UV/RV gewone koppen), actieve modus accent + kolomtint. Uur+Weer één cel; regen (≠ 0) onder het icoon; zonglyph
  zonder pijl, zonrij gecentreerd; ontbrekende zonstraal hersteld; UV-balk relatief aan de heldere-hemel-dagmax;
  windpijl (kompas-variant `?wind=kompas`), dauwpunt geprobeerd (`?rv=dauwpunt`, niet standaard).
- Tabel snug + symmetrische goot, nu-markering in de goot. Desktop: alleen de tabel scrolt, opent op nu, historie
  inline en lazy. Touch: kleine gecentreerde toggle. Tabel past nu op 320 px en Pixel 5 zonder horizontale scroll.
- Stills: `shots/voor/` (main), `shots/na/` (incl. `desktop-light-historie.png` na omhoog scrollen),
  `shots/variant-kompas-dauwpunt/`; probe: `probe.mjs` in deze map.

### Open voor PO/PM
1. Mobiel: de koppenrij scrolt onder de sticky scrubber weg (vóór U23 ook). "Altijd zichtbaar" als sticky koppen
   onder de scrubber vraagt een eigen tabelscroller op touch — bewust niet gedaan (touch-scrollprobleem, zie punt 7).
2. Dauwpunt: laten vallen, of benauwdheid anders tonen (label / tint op Gevoel)? Varianten-code kan weg na keuze.
3. Wind-kompasvariant: na akkoord op de pijl kan `?wind=kompas` weg.
4. Desktop < 960 px met muis houdt de uitklaprij (pagina is daar de scroller) — PO akkoord?
5. Synthetische data: historie-uren 09–11 tonen geen weericoon (geen wolkdata in hist4 voor die uren) — geen U23-regressie,
   was vóór U23 onzichtbaar omdat de historie ingeklapt stond.
6. Prefetch-marge van 320 px voor toekomstige rijen werkt op desktop niet meer (observer-root = viewport, rijen worden
   door de tabelscroller geclipt): rijen laden nu pas als ze in beeld scrollen. Klein; kan met root = scroller.

## 2026-09-25 10:40 afronding (MIP-12: geen losse ?-URL-parameters)
- Variantcode weg: `?wind=kompas` (WindReading-dial, `Navigation2`, `.wind-dial*`) en `?rv=dauwpunt` (`dewPoint`,
  `Droplet`, `.dew-point*`), incl. props `windForm`/`humidityForm`. Keuze blijft: pijl + Bft, gewoon RV-percentage.
  Stills van beide varianten blijven als PO-referentie in `shots/variant-kompas-dauwpunt/`; dauwpunt komt zo nodig
  terug als eigen track. Open punten 2 en 3 (10:32) zijn daarmee vervallen.
- Gerebased op origin/main 314fe3e (bevat U22-shell). Conflicten, alle opgelost als "main + alleen mijn wijziging":
  `icons.ts` (U22 haalde `Info` weg), `styles.css` 4 blokken (U22 verwijderde het 959-mobiel-themablok en het
  map-clock-containerblok, wijzigde `.search`- en `.sidebar-nav`-posities). Eerste rebasepoging commitde door een
  gemist vierde blok conflictmarkers → lokaal teruggezet naar de pre-rebase-head (233c117, niet gepusht) en opnieuw
  gedaan met rerere uit; daarna per commit gecontroleerd: 0 markers in alle 6 commits.
- Visuele controle na rebase (probe `na-rebase`, niet gecommit): desktop opent op de nu-rij onder de U22-shell,
  breedtes ongewijzigd (desktop 437/437, Pixel 5 377/377, 320: 304/304).
- Receipts op head c078030 (main 314fe3e): TYPECHECK-EXIT: 0 · TEST-EXIT: 0 (43 files, 257 tests) · BUILD-EXIT: 0.
- Gericht, onder slot: `MOTREGEN_E2E_PORT=4362 MOTREGEN_E2E_DATA_PORT=8362 pnpm e2e e2e/table.spec.ts e2e/focus.spec.ts`
  (startload 14,5, poorten vrij, head c078030) → **E2E-TARGET-EXIT: 0** — 11 passed, 22 skipped (één-profiel-tests), 1,8 min.
  (Een eerste poging werd na 10 min slotwachten door de tool-timeout afgebroken vóór Playwright startte — geen receipt.)
- Procesnoot orkestrator (ontvangen na deze run): load-wachtdrempel voor gerichte e2e voortaan < 22, starten zodra
  een slot vrij is, max één Chromium; startload blijft in de LOG.
- Stand: klaar. Volledige suite op de merge-kandidaat: orkestrator. Resterende open punten: 1, 4, 5, 6 van 10:32.
