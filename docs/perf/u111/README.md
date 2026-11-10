# U111 — windmodus in Firefox op Android

PO 2026-11-10: lange frames op de windpagina (met windzakken) op zijn Android-telefoon, vooral in Firefox.
Spec: `.dev/specs/track-u111-firefox-wind.md`. Gemeten op ageq-dev2, 2026-11-10.

## Uitkomst in het kort

1. In beide PO-opnames speelt de app af (autoplay). Firefox haalt dan ~10 afspeeltikken/s, Chrome ~28. Zowel
   zakken, deeltjes als isolijnen tekenen in Firefox minder vaak, dus de hele pagina zit krap, niet één laag.
2. In de Firefox-rig verdubbelt `?dev&isolijnen=uit` de framerate tijdens afspelen (p50-gat 33 → 17 ms);
   `?dev&zakken=uit` helpt tijdens afspelen niet en stil een beetje. Ablatie: de vector- en vulpass per nieuwe
   snede zijn ongeveer ⅓ van de isolijnkosten, de composite en present van de eigen overlaycanvas per tik ⅔.
3. Twee fixes zonder zichtbaar verschil (pixelgelijk bewezen):
   - **zakken**: per tekening alleen de rechthoeken wissen waar een zak stond of komt, in plaats van de hele canvas;
   - **isolijnen**: de overlay raakt zijn canvas niet aan als hij dezelfde snede opnieuw zou tekenen (`drawKey`).
     In de Firefox-opname van de PO tekende ~36 % van de composites een ongewijzigde snede (198 blits bij 126 traces).
4. In de rig zijn die fixes **niet meetbaar**: software-WebRender rastert en composiet elk frame toch het hele
   venster, en de host was gedeeld (load 21–79 door andere builds). Of ze op de telefoon tellen (GPU-WebRender,
   canvas-uploads), laat alleen een meting op de telefoon zien.
5. Niet gedaan: de zakken op DPR 2 begrenzen (zichtbaar zachter, zie `zakken-dpr3-vs-dpr2.png`), de isolijnen
   minder vaak tracen tijdens afspelen (tracet bewust op de exacte tijd, PO 2026-09-25), de zakken in WebGL tekenen.

## Metingen

### Telefoon van de PO (uit de spec, `~/motregen-profiles/`, vóór U111)

| | Chrome 156 | Firefox 159 |
| --- | --- | --- |
| gat tussen `windsock-draw`, p50 / p90 / max | 14 / 34 / 87 ms | 45 / 111 / 164 ms |
| JS per `windsock-draw`, p50 | 0,8 ms | 1 ms |
| `isoline-trace` (worker) | 431× · p50 13,9 ms | 126× · p50 15 ms |
| afspeeltikken (`rain-frame-committed`) | ~28/s | ~10/s |
| `isoline-blit` / `isoline-trace` | — | 198 / 126 |

### Firefox-rig (xvfb, softwareraster, 402 × 844 CSS-px, DPR 3, windmodus, live data)

Varianten op de build vóór de fixes (eef3466), twee keer om en om, load 22–39:

| variant | spelend: gat p50 · fps | stil: gat p50 · fps |
| --- | --- | --- |
| basis | 33 ms · 21–33 fps | 17–34 ms · 26–57 fps |
| `zakken=uit` | 34 ms · 21–31 fps | 17 ms · 55–59 fps |
| `isolijnen=uit` | 17 ms · 52–54 fps | 17 ms · 34–46 fps |
| beide uit | 17 ms · 43–46 fps | 17 ms · 57–58 fps |

Isolijn-ablatie (tijdelijke vlag, `ablatie-isolijnen.diff`), spelend, load 10–27:

| | fps (2 runs) |
| --- | --- |
| basis | 12 · 32 |
| `nopass`: wel traces, geen opslag of pass van nieuwe snedes | 39 · 41 |
| `notrace`: geen nieuwe traces, wel composite per tik | 42 · 43 |
| `isolijnen=uit` | 58 · 55 |

Voor (eef3466) en na (b41397f), drie keer om en om, load 21–37. CPU = hele browserprocesboom per frame:

| | spelend: fps · CPU ms per frame | stil: fps · CPU ms per frame |
| --- | --- | --- |
| voor | 27 / 31 / 34 fps · 91 / 68 / 68 ms | 52 / 18 / 56 fps · 34 / 63 / 28 ms |
| na | 24 / 28 / 28 fps · 92 / 80 / 76 ms | 54 / 48 / 42 fps · 33 / 38 / 37 ms |

Verschil binnen de ruis. Na de fix is `isoline-blit` gelijk aan `isoline-trace` (vóór ~12 % meer blits).
JS per `windsock-draw` is in de rig 5–8 ms (software), voor en na gelijk.

### Chrome-rig

Headless Chromium met SwiftShader haalt op DPR 3 bij load 60–79 maar 3–13 fps, voor en na; geen bruikbare maat.

## Beeld gelijk

- `scripts/windsock-dirty-check.ts`: na vijf pannen (13–14 zakken) is een tekening met vuile rechthoeken
  pixelgelijk aan een gedwongen volle tekening (0 verschillende kanalen), licht en donker. Negatieve controle
  `--sabotage` (oude rechthoeken vergeten) faalt met 185 000–270 000 verschillende kanalen.
- `zakken-voor-na-licht.jpg` (12:25) en `zakken-voor-na-donker.jpg` (22:25): links voor, rechts na, zelf bekeken;
  de zakken zijn gelijk.

## Wat nog moet: meten op de telefoon

Op ageq-dev2 draaien (zolang deze sessie leeft) twee previews van deze track met live data:

- voor: `http://ageq-dev2:4311/?perf=start&modus=wind` (eef3466, met de A/B-knoppen);
- na: `http://ageq-dev2:4312/?perf=start&modus=wind` (b41397f);
- A/B: `&dev&zakken=uit`, `&dev&isolijnen=uit`.

Laat `isolijnen=uit` op de telefoon ook de grote winst zien, dan is de volgende stap structureel: de overlays
(isolijnen, regen, wind) samen op één WebGL-canvas, zodat Firefox per frame één canvas presenteert in plaats van
drie. Dat is een groter ontwerp en eerst een voorstel.

## Reproduceren

```sh
cd web
pnpm exec tsc -b && pnpm exec vite build --outDir tmp/u111-na --emptyOutDir
# buiten de Claude-sandbox (loopback tussen sandbox-commando's werkt daar niet)
MOTREGEN_DATA_ORIGIN=https://motregen.nl/data pnpm exec vite preview --outDir tmp/u111-na --host 0.0.0.0 --port 4312 --strictPort
xvfb-run -a pnpm exec tsx scripts/wind-frame-gaps.ts http://127.0.0.1:4312 --variants=basis,zakken=uit,isolijnen=uit --repeat=2
xvfb-run -a pnpm exec tsx scripts/windsock-dirty-check.ts http://127.0.0.1:4312 --theme=donker
xvfb-run -a pnpm exec tsx scripts/windsock-shot.ts http://127.0.0.1:4312 uit.png --query=t=%2B12u
```

`MOTREGEN_DATA_ORIGIN` moet op `/data` eindigen: de proxy haalt dat voorvoegsel eraf.
