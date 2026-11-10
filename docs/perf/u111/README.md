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
   venster, en de host was gedeeld (load 21–79 door andere builds). Op de telefoon van de PO maakten ze ook geen
   verschil, en `isolijnen=uit` evenmin (zie onder): de rem zit daar ergens anders, vandaar de bisectie.
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

## Telefoonmeting van de PO na de fixes (2026-11-10, Firefox 159)

Profielen `~/motregen-profiles/2026-11-10T09:36:51.993Z…` (voor, 4311), `…09:37:15.299Z…` (na, 4312) en
`…09:37:31.585Z…` (na, `isolijnen=uit`), samengevat door de orkestrator: **geen verschil**. `windsock-draw` ~20/s in
alle drie (gat p50 58 / 38 / 49 ms), `wind-step` ~20/s (p50 33 ms, p90 92–110 ms), afspeeltikken ~11/s. Op de
telefoon zijn de isolijnen dus niet de rem (in de rig wel: die overschat pixelwerk). Volgende stap: bisecteren.

## Bisectie op de telefoon (preview 4312, build 74df28d)

Knoppen (combineerbaar, `docs/dev-opties.md`): `zakken=uit`, `isolijnen=uit`, `deeltjes=uit` (WebGL-windlaag niet
opgezet), `regen=uit` (regenoverlay tekent niets; data en afspelen lopen door), `kaart=leeg` (basiskaart alleen met
achtergrond). In de rig gecontroleerd: elke combinatie laadt en speelt af.

1. Alles aan: `http://ageq-dev2:4312/?perf=start&modus=wind&dev`
2. Zonder deeltjes: `http://ageq-dev2:4312/?perf=start&modus=wind&dev&deeltjes=uit`
3. Zonder deeltjes en regen: `http://ageq-dev2:4312/?perf=start&modus=wind&dev&deeltjes=uit&regen=uit`
4. Alles uit behalve de kaart: `http://ageq-dev2:4312/?perf=start&modus=wind&dev&deeltjes=uit&regen=uit&zakken=uit&isolijnen=uit`
5. Zo nodig, ook de kaart leeg: link 4 plus `&kaart=leeg`

Elke link opent met het open dev-paneel; dat staat er in alle vijf, dus het telt overal gelijk mee.

## Bisectie ronde 1 (2026-11-10, PO-telefoon, Firefox 159)

PO: "alleen 4 was smooth". Samenvatting van de orkestrator (`.dev/tracks/u111-firefox-wind/bisect-1.md`):

| link | `windsock-draw`-gat p50 / p90 / max | `wind-step`-gat p50 / p90 | afspeeltikken |
| --- | --- | --- | --- |
| 1 alles aan | 49 / 95 / 150 ms | 37 / 104 ms | 12,6 /s |
| 2 `deeltjes=uit` | 15 / 93 / 183 ms | — | 11,2 /s |
| 3 + `regen=uit` | 34 / 110 / 228 ms | — | 11,1 /s |
| 4 + `zakken=uit` + `isolijnen=uit` | — | — | 19,9 /s |

De rem zit dus in de zakken en/of de isolijnen, niet in de WebGL-deeltjes.

### Wat de code zegt over het vermoeden "volle canvas-upload per frame"

1. **Canvasmaat.** Beide overlays zijn schermvullend op de volle DPR: de zakken een 2D-canvas van
   containermaat × DPR (402 × 844 CSS-px → 1206 × 2532 = 3,05 Mpx, 12,2 MB RGBA), de isolijnen (in Wind de
   Beaufortvlakken) een eigen WebGL2-canvas van dezelfde maat als de kaartcanvas (`LayerOverlay`). Wind en regen zijn
   nog twee zulke WebGL-canvassen.
2. **Aanraken per frame.** De zakken tekenen bij elke afspeeltik (nieuw veld) en daarnaast bij wuiven tot
   30 frames/s (`WINDSOCK_FLUTTER_FPS`); sinds b41397f wissen ze alleen hun eigen rechthoeken, maar de canvas als
   geheel verandert nog elk frame. De isolijnen tekenen per afspeeltik een nieuwe snede (vectorpass, vulpass,
   composite naar de canvas); een ongewijzigde snede slaan ze sinds b41397f over.
3. **Teruglezen.** `willReadFrequently`/`getImageData` zit alleen in het watermasker van de windlaag (eenmalig, eigen
   canvas, en in de worker), niet op het tekenpad van zakken of isolijnen. Geen `readPixels` per frame (alleen
   `fillCoverage` voor e2e).
4. **Transforms.** Alle overlays staan absoluut in `.maplibregl-canvas-container`, zonder CSS-transform. De zakcanvas
   krijgt `opacity` (1 in Wind, alleen lager tijdens de overgang). Wel opvallend, buiten deze bisectie: de regencanvas
   heeft overdag in Wind `mix-blend-mode: multiply`; in links 3 en 4 is die canvas verborgen.

Het vermoeden past dus bij de code: twee schermvullende canvassen op DPR 3 die tijdens afspelen elk frame
veranderen. Of Firefox Android de 2D-canvas op de CPU rastert en heel uploadt, en of de WebGL-canvas bij presenteren
gekopieerd wordt, kan alleen een Gecko-profiel (Renderer, Compositor, canvas-draden) laten zien
(`gecko-android-agent.md`).

### Drie kandidaat-knoppen (build 4312, `docs/dev-opties.md`)

1. `zakcanvas=los`: elke zak een eigen kleine 2D-canvas. Die groeit alleen (een trillende zak krijgt dus geen nieuwe
   canvas) en verschuift alleen als het anker een canvaspixel verschuift; de zak valt op dezelfde subpixelfase.
   Samen 16,6–17,8 % van de schermpixels, dus per frame ~6× minder canvasoppervlak naar de compositor.
   Beeld: `windsock-dirty-check.ts --los` (vijf pannen, licht en donker) vindt alleen antialiasverschil op de omtrek,
   40–100 pixels met voorvermenigvuldigd Δ > 2 (max Δ 18–56 van 255) op ~80 000 inktpixels, en niets buiten een zak;
   `--los --sabotage` (één canvas een pixel verschoven) faalt met ~2 100 pixels. Twee schermbeelden van de hele
   pagina met en zonder de knop hebben geen pixel met een verschil boven 2 van 255 (`zakcanvas-los-vs-een.jpg`).
2. `zakdpr=2`: de zakcanvas op DPR 2 (44 % van de pixels). Zichtbaar zachter (`zakken-dpr3-vs-dpr2.png`); toont alleen
   of het pixelvolume van de zakken de rem is.
3. `isolijndpr=2`: de isolijncanvas en zijn passes op DPR 2; de lijnen houden dezelfde CSS-dikte (lijnbreedte en
   vultarget rekenen met de begrensde DPR). Iets zachter (`isolijndpr3-vs-2.jpg`, 2× uitvergroot). Toont of het
   pixelvolume van de isolijnen de rem is.

Niet gebouwd: één gedeelde canvas voor zakken en isolijnen (de zakken zijn 2D, de isolijnen WebGL; delen vraagt de
zakken in WebGL, en dat tekenwerk is net in U113 in beweging) en zakken als MapLibre-symbolen (de vorm verandert per
frame). Volgende stap als de telefoon met `zakcanvas=los` of `zakdpr=2` vloeiend wordt.

### Firefox-rig met de knoppen (build 2d13546, basis `deeltjes=uit&regen=uit`, twee runs om en om, load 2–16)

De rig haalt nu in alle varianten de vsync-grens (p50-gat 17 ms, 54–59 fps); het verschil zit in de CPU van de
hele browserprocesboom per frame en in de JS per zaktekening. Eén run (#2 los + isolijndpr) viel samen met een
loadsprong naar 16 en telt niet mee.

| variant | spelend: CPU ms per frame | stil: CPU ms per frame | JS per `windsock-draw`, p50 |
| --- | --- | --- | --- |
| basis | 32,1 · 32,8 | 8,4 · 10,8 | 5–7 ms |
| `zakcanvas=los` | 30,7 · 32,1 | 7,4 · 7,1 | 3 ms |
| `zakdpr=2` | 31,7 · 29,8 | 12,2 (load 7) · 7,6 | 3–6 ms |
| `isolijndpr=2` | 31,8 (load 14) · 24,3 | 13,3 (load 15) · 8,1 | 5–8 ms |
| `zakcanvas=los&isolijndpr=2` | 23,8 · (verstoord) | 7,7 · (verstoord) | 3 ms |

Lezing: in de rig (softwareraster) scheelt `isolijndpr=2` tijdens afspelen ~25 % CPU per frame, en `zakcanvas=los`
halveert ongeveer de JS per zaktekening, maar scheelt tijdens afspelen nauwelijks CPU. De rig overschat pixelwerk
(zie boven): de telefoon beslist.

### Telefoonlinks ronde 1 (basis: `deeltjes=uit&regen=uit`)

1. Basis (zakken en isolijnen): `http://ageq-dev2:4312/?perf=start&modus=wind&dev&deeltjes=uit&regen=uit`
2. Alleen zakken: `…&deeltjes=uit&regen=uit&isolijnen=uit`
3. Alleen isolijnen: `…&deeltjes=uit&regen=uit&zakken=uit`
4. Fix A, losse zakcanvassen: `…&deeltjes=uit&regen=uit&zakcanvas=los`
5. Fix B, zakken op DPR 2: `…&deeltjes=uit&regen=uit&zakdpr=2`
6. Fix C, isolijnen op DPR 2: `…&deeltjes=uit&regen=uit&isolijndpr=2`
7. Fix A + C: `…&deeltjes=uit&regen=uit&zakcanvas=los&isolijndpr=2`
8. Alles aan met fix A: `http://ageq-dev2:4312/?perf=start&modus=wind&dev&zakcanvas=los`
9. Alles aan met fix B: `http://ageq-dev2:4312/?perf=start&modus=wind&dev&zakdpr=2`
10. Alles aan met fix C: `http://ageq-dev2:4312/?perf=start&modus=wind&dev&isolijndpr=2`

## Bisectie ronde 2: Gecko-profielen van de telefoon (2026-11-10)

Vier profielen (preset Graphics, build 74df28d), samengevat door de orkestrator met `web/scripts/gecko-threads.mjs`
(`.dev/tracks/u111-firefox-wind/bisect-2.md`). CPU per draad in ms per s opname:

| draad | 1 alles | 2 alleen zakken | 3 alleen isolijnen | 4 alleen kaart |
| --- | --- | --- | --- | --- |
| gpu/CanvasRenderer | 407 | 500 | 97 | niet in de top |
| Web Content/GeckoMain | 354 | 339 | 379 | 343 |
| gpu/Renderer (WebRender) | 106 | 155 | 169 | 185 |

De rem is de draad CanvasRenderer in het GPU-proces, waar Firefox de 2D-canvascommando's afspeelt
(`CanvasTranslator` → `DrawTargetWebgl`). Bij alleen de zakken gaat daar 32 % naar `Stroke`, 26 % naar
`GenerateComplexClipMask` (Skia rastert per tekening in software een AA-clipmasker), 8 % naar `PushClip` en ~30 %
naar het uploaden van masker en paden. Dat is `context.clip(outside, 'evenodd')` in `wind-sock-draw.ts`: het gat
rond de badge.

### Knoppen ronde 2

1. `zakclip=uit`: dezelfde uitsparing zonder `clip()`. Eerst de zak, dan het gat wegvegen met `destination-out`,
   dan de badge. Vegen raakt ook wat er al stond, dus op de grote canvas gaat elke zak eerst via een kleine
   kladcanvas (`drawImage` op gehele canvaspixels); met `zakcanvas=los` staat elke zak al op een eigen canvas.
   Beeld (`windsock-dirty-check.ts --zakclip [--los]`, vijf pannen, licht en donker): alleen antialias verschilt.
   Op de rand van het gat ~900 px per beeld (max Δ ~120 van 255: clip dekt elke laag apart af, vegen het geheel één
   keer, dus de rand van de zak is daar een fractie lichter), daarbuiten ~400 px met Δ > 2 (max Δ 17–49) op
   ~77 000 inktpixels. Die tweede grens heb ik na de eerste meting op 1 % gezet (gemeten 0,47–0,57 %; een AA-clip
   laat Skia ook elders via de clipblitter tekenen). Met `--sabotage` faalt de check (53 000 resp. 2 200 px).
   Op 4× uitvergroot zie ik geen verschil: `zakclip-aan-vs-uit.jpg` (boven licht, onder donker; links clip,
   rechts vegen).
2. `zak2d=software`: de zakcanvassen met `getContext('2d', { willReadFrequently: true })`. Firefox tekent ze dan
   met Skia in het contentproces, niet in het GPU-proces; dan uploadt hij de hele canvas per frame. Een meting, geen
   fix: toont of het afspelen in de CanvasRenderer zelf de rem is.
3. `zakdpr=2` en `isolijndpr=2` blijven, alleen om te meten.

De Firefox-rig draait op softwareraster (llvmpipe, software-WebRender); of Firefox daar canvas-2D via
`DrawTargetWebgl` in het GPU-proces tekent, heb ik niet nagegaan. De rig controleert vooral dat elke variant laadt en
afspeelt; zijn CPU-cijfers zeggen weinig over de CanvasRenderer van de telefoon.

Rig (build ec907c9, alle lagen aan, twee runs om en om, load 10–31, dus ruis): elke variant laadt en speelt af.
Spelend fps en JS per `windsock-draw` (p50):

| variant | spelend fps (2 runs) | JS per zaktekening |
| --- | --- | --- |
| basis | 44,6 · 20,2 | 5–6 ms |
| `zakclip=uit` | 27,3 · 41,6 | 3–4 ms |
| `zakclip=uit&zakcanvas=los` | 13,2 · 37,5 | 3–6 ms |
| `zak2d=software` | 12,4 · 11,7 | 11–12 ms |
| `zakclip=uit&zak2d=software` | 21,7 · 23,2 | 4–5 ms |

Alleen `zak2d=software` springt eruit: de canvas tekent dan synchroon in het contentproces, dus de JS-tijd per
tekening verdubbelt. Op de telefoon kan dat nog steeds goedkoper zijn dan de CanvasRenderer, vandaar de meting.

### Telefoonlinks ronde 2 (alle lagen aan)

1. Basis: `http://ageq-dev2:4312/?perf=start&modus=wind&dev`
2. `http://ageq-dev2:4312/?perf=start&modus=wind&dev&zakclip=uit`
3. `http://ageq-dev2:4312/?perf=start&modus=wind&dev&zakclip=uit&zakcanvas=los`
4. `http://ageq-dev2:4312/?perf=start&modus=wind&dev&zak2d=software`
5. `http://ageq-dev2:4312/?perf=start&modus=wind&dev&zakclip=uit&zak2d=software`

Gecko-profielen van dezelfde vijf: `gecko-android-agent.md` (`?perf=1`, `android-r2-<variant>.json.gz`).

Voor de merge met U113: daar wordt het gat een pil of grotere schijf (`badgePath(…, cut)`). Het weggeveegde gat moet
dezelfde vorm volgen, en `sockRect()` moet de eenheidsbox (`sockUnitBox`) omvatten.

## Gecko-profiel van Firefox Android via USB (macbook)

De eerdere profielen in `~/motregen-profiles/macbook-firefox/` zijn van desktop-Firefox op de macbook (macOS),
niet van de telefoon. Voor de telefoon:

1. Telefoon: Android-ontwikkelaarsopties aan (Instellingen › Over de telefoon › zeven keer op het buildnummer),
   daarin *USB-foutopsporing* aan. In Firefox voor Android: Instellingen › *Externe foutopsporing via USB* aan.
2. Telefoon met USB aan de macbook; op de telefoon "USB-foutopsporing toestaan" bevestigen.
3. Macbook, desktop-Firefox: open `about:debugging#/setup`, kies *USB-apparaten inschakelen*; de telefoon verschijnt
   links, klik *Verbinden* en open hem.
4. Op de apparaatpagina: *Prestaties profileren*. Zet de preset op **Graphics** (die neemt naast de hoofddraad ook
   Compositor, Renderer, RenderBackend, SceneBuilder en de canvas-draden mee). Interval 1 ms is goed.
5. Open op de telefoon een bisect-link, maar met `?perf=1` in plaats van `?perf=start` (de UserTiming-fasen komen dan
   in het profiel, zonder de eigen opname van de app erbij). Wacht tot hij afspeelt, klik *Opname starten*, laat
   ~15 s lopen, klik *Opname vastleggen*.
6. De Firefox Profiler opent op de macbook. Kies *Uploaden* niet; gebruik het menu › *Downloaden* (`.json.gz`) en
   zet het bestand in `~/motregen-profiles/` op ageq-dev2, bijvoorbeeld `android-wind-alles-aan.json.gz` en
   `android-wind-alles-uit.json.gz`.

Minimaal links 1 en 4. Lezen kan met `web/scripts/firefox-profile.ts` (fasen) en in de profiler zelf: de tracks
Compositor en Renderer laten zien of Firefox zijn tijd buiten JS in compositing en canvas-uploads kwijt is.

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
