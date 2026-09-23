# U9 — histogram-polish LOG (append-only, newest last)

## 2026-09-23 16:40 — opzet
- Worker: Claude Opus 5.5 (herdr-pane), spec `.dev/specs/track-u9-histogram-polish.md`.
- Data: vaste snapshot van prod (`https://motregen.nl/data`, manifest `now` 14:30Z,
  generated 14:33Z) in `data/` (gitignored), zodat iteraties onderling vergelijkbaar
  zijn. Geserveerd met caddy (`Caddyfile`, :8391, Range-ondersteuning).
- Locatie met regen: Texel (4,76 E; 53,04 N) — gekozen door rtcor/nowcast/harmonie-
  chunks te decoderen en per cel te tellen hoeveel frames > 0,3 mm/u hebben (radar:
  bui 14:30–14:55 lokale tijd tot ~3 mm/u; model: lichte bui rond 20u).
- Repro (vanuit `web/`, buiten de sandbox):
  - `SNAPSHOT_ROOT=$(realpath ../.dev/tracks/u9-histogram-polish/data) direnv exec .. caddy run --config ../.dev/tracks/u9-histogram-polish/Caddyfile --adapter caddyfile`
  - `direnv exec .. pnpm build && MOTREGEN_DATA_ORIGIN=http://127.0.0.1:8391 direnv exec .. pnpm preview --host 127.0.0.1 --port 4391`
  - `direnv exec .. node ../.dev/tracks/u9-histogram-polish/shots.mjs http://127.0.0.1:4391/ <prefix>`
- `shots.mjs`: desktop 1440×900 + Pixel 5, licht + donker; opnames: loading
  (chunks 2,5 s vertraagd), scrubber (tijdens autoplay), future/past (cursor gepind op
  62 %/16 % van de plot, gepauzeerd), focus (toetsenbordfocus), alles (horizon Alles).

## 2026-09-23 16:55 — iteratie 0: vóór-opnames (`shots/i0-before/`)
Wat ik zie:
1. De drie intensiteitsbanden (roze/blauw/grijs over de volle breedte) overheersen:
   ~80 % van de plot is gekleurd vlak zonder data. Legenda-lawaai (ZWAAR/MATIG/LICHT).
2. Balken: eenkleurig cyaan, dun (5-min-frames ~4 px), geen relatie met de
   kaartkleuren (kaart: blauw → turkoois → geel → oranje → paars). Lichte regen
   (0,06–0,5 mm/u) is een paar pixels hoog.
3. Cursorpil staat bóven de plot en overlapt `mm/u` en de `15`-ticklabel en de
   VANDAAG-chip (mobiel, cursor links). Zwarte pil + zwarte Nu-pil = twee zware
   vormen die concurreren.
4. Bug (mobiel): na tikken op de pil blijft `:hover` hangen → pil toont `▶` in
   plaats van de tijd (`pixel5-dark-past.png`).
5. Bronstrook onder de plot: bij Alles op mobiel wordt het `OBSER NOWMODEL` (afgekapt,
   tegen elkaar). Drie gekleurde lijnen + hoofdletterlabels = legenda-lawaai.
6. Skeleton: 12 hoge lichtblauwe blokken + gecentreerde tekst in een kader — drukker
   dan de echte grafiek.
7. Middernachtlijn (2 px, donker) en uur-rasterlijnen vrij hard, vooral donker thema.
8. Horizonpillen (28 px hoog) en cursorpil (hoekig bovenaan) zijn geen familie.

## 2026-09-23 17:10 — iteratie 1 (`shots/i1/`, desktop-licht + pixel5-donker)
Veranderd: intensiteitsbanden weg → twee gestippelde hulplijnen (2,5 en 7,5 mm/u) en
woordlabels Licht/Matig/Zwaar als y-as; balken in pixelruimte (geen vervormde
`preserveAspectRatio="none"` meer) met afgeronde top (rx, onderkant weggeclipt),
kleur = kaart-colormap op de gekwantiseerde index (`rainColor`, colormap verhuisd naar
`core/rain-chart.ts`, `rain-layer` her-exporteert); verleden licht getint + balken
72 %; Nu = dunne lijn + omlijnde pil; cursor = 2 px lijn + pil boven de plot, geklemd
binnen de plotbreedte; sticky-hover-bug: ▶ alleen onder `@media (hover: hover)`;
skeleton = tekst + sweep-lijntje op de basislijn; pending-frames = stipjes op de
basislijn; bronstrook dun, labels verbergen (sr-only + title) als ze niet passen.
Screenshots nu keyboard-gestuurd gepind op 14:45 (radar-bui) en 20:00 (model).
Wat ik zie:
- Veel rustiger; kleur leest als de kaart (groen/geel in de radarbui, blauw bij 20u).
- Actieve horizonpil (zwart) en cursorpil (zwart) concurreren om aandacht.
- 5-min-balken erg dun (~2,5 px + 1 px gat), vooral in het getinte verleden.
- Uurlijnen in donker nog vrij aanwezig.
- Tijd is leesbaar, maar de waarde op de cursor zie je nergens (alleen aria).

## 2026-09-23 17:35 — iteratie 2 (`shots/i2/`, desktop-donker + pixel5-licht)
Veranderd: waarde-uitlezing bij de cursor (stip op de balktop + `1,8 mm/u`, klapt
om voorbij 70 %); horizonkeuze als rustige segmented control (actief = verhoogd wit
segment i.p.v. zwarte pil) — cursorpil is nu het enige donkere element; balk-
tussenruimte schaalt met de pitch (0,5/1/1,5 px); uurlijnen zachter.
Wat ik zie: uitlezing werkt en leest prettig; focusring (2 px accent) duidelijk om
het hele oppervlak. Maar in licht zijn gele/lichtgroene balken op wit bijna
onzichtbaar (geel op wit ≈ 1,5:1).
Vondst: afspelen zet de cursor al per rAF-frame (fractionele cursor) → een CSS-
transitie tijdens afspelen voegt alleen naijlen toe. Tween nu alleen bij
toetsenbordstappen (140 ms ease-out), pointer-scrubben blijft direct.

## 2026-09-23 17:50 — iteratie 3 (`shots/i3/` licht, `shots/i3-synth/` zware regen)
Veranderd: in licht thema `filter: brightness(.86) saturate(1.35)` op de balkgroep
(één laag, kaarttint blijft herkenbaar); daglabels alleen als het segment tot de
volgende dag breed genoeg is, en boven de balken met een zachte achtergrond;
scrubber-lokale `--muted: #58707a` in licht (AA: 5,2:1 op wit, 4,8:1 op de tint; het
globale #637b85 haalde 4,47/4,13); aria-valuetext → `vandaag 14:45, 1,8 mm/u,
licht, observaties` (+ test); unit-test dat `rainColor` exact de kaart-stops raakt.
Synth (zware bui, byte 226 ≈ 50 mm/u, 5,637 E 51,764 N; caddy :8392 op
`web/public/data`, `PLACE=… PINS=18:00,16:00`): roze/paars/rood/oranje komen door,
uurlijkse modelbalken met afgeronde top zien er goed uit. Gevonden en opgelost:
VANDAAG/MORGEN-labels botsten bij Alles, en hoge balken tekenden over VANDAAG.
Loading (licht): alleen tekst + sweep-lijn, as en bronstrook blijven staan — rustig.

## 2026-09-23 18:10 — code-review eigen diff + fijn scrubben
- Vondst: `<For>` over een steeds nieuw `bars()`-array maakte bij elke waarde-update
  (progressief laden: per frame) álle rects opnieuw → de fade-in zou steeds opnieuw
  flitsen. Nu `<Index>` + `<Show>`: alleen een slot dat pending → geladen gaat krijgt
  een nieuw element en fadet in.
- Fijn scrubben met dempen (touch/pen): slepen is relatief t.o.v. een anker; zodra de
  vinger > 48 px verticaal van het aanzetpunt afwijkt gaat het tempo naar ¼ (her-anker
  bij omschakelen → geen sprong); de pil krijgt dan een accentring. Muis ongewijzigd.
  Test: `damps touch scrubbing to a quarter…` (2 → 2,5 bij 200 px in fijn-modus).

## 2026-09-23 18:40 — iteratie 4 (`shots/i4/`, `shots/i4-synth/`) — volledige set
Alle vier varianten × prod-snapshot en synth. Geen regressies; maar bij Alles/+24u
toonde de bronstrook alleen nog "Model" (mijn verbergregel voorkomt overlap maar
verliest informatie).

## 2026-09-23 18:45 — PO-bijsturing (mid-track)
"neem ook even de +3u +8u +24u pills en light/darkmode mee, misschien zijn
observaties/nowcast/model ook niet ideaal, die overlappen ook als je naar 24u gaat."

## 2026-09-23 19:05 — iteratie 5 (`shots/i5/`, `shots/i5-synth/`)
Veranderd:
- Bronnen: strook onder de plot is nu alleen een 3 px gekleurde lijn per zone
  (title-tooltip, `role="img"` met aria-label "Databronnen: …"), géén tekst meer →
  kan niet overlappen bij welke horizon ook. De bron van het cursormoment staat als
  één bijschrift met kleurstip links in de toolbar (`● Observaties` / `● Nowcast` /
  `● Model`), en in de aria-valuetext.
- Pillen: één `.segmented`-familie (30 px segmenten, raakvlak ≥ 44 px via ::after)
  voor horizon én thema. Thema in de sidebar: cyclusknop → segmented
  `☀ Licht | ◐ Systeem | ☾ Donker` (App.tsx: markup + `themeChoices`-tabel; buiten
  de oorspronkelijke scope "App.tsx alleen props", op expliciet PO-verzoek). De
  ronde themaknop op de kaart (mobiel) blijft een cyclusknop.
Wat ik zie: toolbar leest rustig, bijschrift wisselt mee met scrubben; +24u op
Pixel 5 heeft geen overlap meer; thema-segment en horizon-segment zijn zichtbaar
familie; donker thema consistent.
Tests: bronstrook-titels + bijschrift-test i.p.v. zichtbare labels.

## 2026-09-23 19:25 — gates (synchroon, op `5937b49`)
Vanuit `web/`, elk commando los met `; echo "X-EXIT: $?"`:
- `direnv exec .. pnpm typecheck` → TYPECHECK-EXIT: 0
- `direnv exec .. pnpm test` → 31 files, 162 tests passed, TEST-EXIT: 0
- `direnv exec .. pnpm build` → BUILD-EXIT: 0
- `MOTREGEN_E2E_PORT=4301 MOTREGEN_E2E_DATA_PORT=8301 direnv exec .. pnpm e2e` → 9 passed
  (4,0 min), E2E-EXIT: 0

## Eindvergelijking (vóór → na)
| variant | vóór | na |
| --- | --- | --- |
| desktop licht, cursor in radarbui | `shots/i0-before/desktop-light-past.png` | `shots/i5/desktop-light-past.png` |
| desktop donker, model 20u | `shots/i0-before/desktop-dark-future.png` | `shots/i5/desktop-dark-future.png` |
| Pixel 5 licht, +8u tijdens afspelen | `shots/i0-before/pixel5-light-scrubber.png` | `shots/i5/pixel5-light-scrubber.png` |
| Pixel 5 donker, Alles | `shots/i0-before/pixel5-dark-alles.png` | `shots/i5/pixel5-dark-alles.png` |
| laden (skeleton) | `shots/i0-before/desktop-light-loading.png` | `shots/i5/desktop-light-loading.png` |
| hele pagina | `shots/i0-before/desktop-light-page.png` | `shots/i5/desktop-light-page.png`, `…dark-page.png` |
| zware regen (synth) | — | `shots/i5-synth/desktop-dark-past.png`, `pixel5-light-24u.png` |

Samenvatting: gekleurde bandvlakken → hulplijnen + woord-as; balken in kaartkleuren
met ronde top, zichtbare lichte regen, fade-in alleen voor binnenkomende frames;
verleden zacht getint; cursorpil geklemd, tijd altijd leesbaar (sticky-hover-bug
weg), waarde-uitlezing bij de cursor; skeleton = tekst + sweep; bronnen als lijn +
cursorbijschrift (geen overlap); horizon + thema als één segmented-familie; AA-
contrast voor klein grijs in licht; aria-valuetext menselijk; fijn touch-scrubben.

Open / voor PO:
- De ronde themaknop op de kaart (mobiel) is nog een cyclusknop; sidebar is nu
  segmented. Gelijktrekken kan, maar op de kaart kost een 3-delig segment ruimte.
- Schaal: de Zwaar-band beslaat een derde van de hoogte, ook op droge dagen
  (bestaand ontwerp, niet aangeraakt).
- Opnames zijn met swiftshader traag (~4–8 min per volledige set); het script
  pint de cursor via het toetsenbord omdat pointer-paden de renderer bezig hielden.
