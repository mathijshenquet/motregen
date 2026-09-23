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
