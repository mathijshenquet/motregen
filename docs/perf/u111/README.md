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

## Ronde 3 (2026-11-10): `zakclip=uit` wordt standaard, content-hoofddraad, zuiniger paden

Uitslag r2 op de telefoon (orkestrator, `.dev/tracks/u111-firefox-wind/bisect-3.md`): `zakclip=uit` geeft ~40–50 %
meer frames (`windsock-draw` 15,8 → 22,2 /s, `wind-step` 15,6 → 23,3 /s, CanvasRenderer 452 → 331 ms/s), en de
maskerhotspot is weg. Chrome op dezelfde telefoon haalt ~70 frames/s.

### 1. Het gat zonder `clip()` is de standaard

Perf-mandaat: op 4× niet te zien (orkestrator en ik hebben zelf gekeken, `zakclip-aan-vs-uit.jpg`). Het oude pad blijft
als `?dev&zakclip=aan`. Het gat is één functie, `sockCutPath(badge)` in `wind-sock-draw.ts`; bij de merge met U113 wordt
dat `badgePath(…, cut)` (pil of grotere schijf), en `sockRect()` moet dan de eenheidsbox omvatten.

Anders dan in ronde 2 gaat een zak niet meer standaard via de kladcanvas. Het CanvasRenderer-profiel van
`android-r2-zakclip-uit` (script `gecko-hotspots.ts --thread=CanvasRenderer`) liet zien dat die kladcanvas zelf duur
is: `fBindFramebuffer` 18,5 % (twee framebufferwissels per zak per frame), `raw_fTexImage2D` 10 % en ~25 % in ongesymboliseerde
libc-adressen (vermoedelijk memcpy: de kladcanvas per zak opnieuw geüpload), tegen ~27 % voor `DrawPath`/`Stroke`. Nu veegt elke zak het gat direct
op de grote canvas weg. Alleen een zak waarvan de rechthoek een eerder getekende zak van dezelfde frame raakt, gaat
nog via de kladcanvas (zelden: de indeling houdt zakken uit elkaar), zodat vegen nooit een andere zak raakt.
Pixelcheck (referentie is nu het nieuwe standaardpad): de check zonder vlaggen is exact gelijk (vuile rechthoeken
tegen een volle tekening), `--sabotage` faalt, en `--zakclip` (het oude clip-pad) geeft hetzelfde beeld als in ronde 2
(rand van het gat ~900 px, max Δ ~115; elders ~330–360 px met Δ > 2, max Δ 13–14).

### 2. Content-hoofddraad (GeckoMain van het Web Content-proces)

Met `web/scripts/gecko-hotspots.ts` (gewogen met `threadCPUDelta`, native frames via Mozilla's symbolicatieserver,
JS-namen via de sourcemaps van build `tmp/u111-r2`; dezelfde build als de opnames). Let op: dit script kiest het
tabblad van de app op de `motregen:`-UserTiming-markers. `gecko-symbolicate-request.mjs` kiest de GeckoMain met de
meeste samples en pakte in `android-r2-zakclip-uit` een leeg Web Content-proces (pid 20804, 7 ms CPU) in plaats van
het tabblad (pid 21016).

Eigenaar per sample (de binnenste JS-frame; zonder JS-frame is het Gecko):

| | `zakclip=uit` (447 ms/s) | `zakclip=uit&zakcanvas=los` (538 ms/s) |
| --- | --- | --- |
| Gecko (stijl, layout, displaylist, verf) | 231 ms/s · 52 % | 233 ms/s · 43 % |
| onze JS | 176 ms/s · 40 % | 254 ms/s · 47 % |
| MapLibre-JS | 27 ms/s · 6 % | 37 ms/s · 7 % |
| andere JS (buiten de bundel) | 12 ms/s · 3 % | 13 ms/s · 2 % |

Top 15 inclusief, JS (`zakclip=uit`):

| # | % | ms/s | functie |
| --- | --- | --- | --- |
| 1 | 16,9 | 76 | `showWindsocks` (App.tsx) |
| 2 | 16,6 | 74 | `LayerOverlay.draw` (overlay-canvas.ts) |
| 3 | 15,5 | 69 | `WindsockLayer.draw` (wind-socks.ts) |
| 4 | 14,7 | 66 | `WindsockLayer.setField` (wind-socks.ts) |
| 5 | 9,4 | 42 | `time` (playback.ts) |
| 6 | 9,4 | 42 | `now` (App.tsx) |
| 7 | 9,3 | 41 | `runUpdates` (solid-js) |
| 8 | 9,3 | 41 | `renderPlaybackCursor` (App.tsx) |
| 9 | 9,2 | 41 | `drawRainFrame` (App.tsx) |
| 10 | 9,0 | 40 | `completeUpdates` (solid-js) |
| 11 | 8,9 | 40 | `runTop` (solid-js) |
| 12 | 8,5 | 38 | `LayerOverlay.drawNow` (overlay-canvas.ts) |
| 13 | 8,5 | 38 | `updateComputation` (solid-js) |
| 14 | 8,1 | 36 | `triggerRepaint`-callback (overlay-canvas.ts) |
| 15 | 7,8 | 35 | `batch` (solid-js) |

Top 15 inclusief, Gecko-fasen (`zakclip=uit`): RefreshDriver tick 83,1 % (371 ms/s) · `js::RunScript` 49,0 % ·
Animation and video frame callbacks 43,6 % · **Paint 37,8 % (169 ms/s)** · `nsLayoutUtils::PaintFrame` 37,2 % ·
`PVsync::Msg_Notify` 30,5 % · FrameRequestCallback 24,2 % · promise callback 21,7 % · `nsDisplayList::PaintRoot`
21,0 % · WebRender display list 18,7 % (84 ms/s) · DisplayList building 16,0 % (71 ms/s) ·
`ViewportFrame::BuildDisplayList` 13,2 % · Layout-flush 8,0 % (36 ms/s). Hoogste zelf-tijd: ongesymboliseerde libc-adressen
(~14 %, vermoedelijk memcpy/memset), `nsIFrame::BuildDisplayListForChild` 3,4 %, `ComputedStyle::IsFixedPosContainingBlock`,
`RetainedDisplayList::DeleteAll`, `AbsoluteColor::to_color_space`/`Servo_InterpolateColor` (CSS-kleuranimatie of
-overgang die elke frame loopt) en `SVGPathElement::HasValidDimensions`.

Lezing:
1. Ruim de helft van de hoofddraad is Gecko zelf, vooral **Paint: per frame een nieuwe displaylist** (~170 ms/s, bij
   ~22 frames/s ~7,5 ms per frame). Een canvas die verandert, vraagt geen nieuwe displaylist; DOM die elke frame
   verandert wel. Kandidaten: de afspeelcursor en klok (`renderPlaybackCursor`), de DOM-labels van isolijnen en
   temperaturen, en een CSS-kleuranimatie (`Servo_InterpolateColor`). Volgende stap: in de profiler de markers
   "Styles"/"Reflow" en hun oorzaak (cause stack) bekijken.
2. Onze JS is ~40 %; de zakken zelf (`WindsockLayer.draw`) 69 ms/s, de overlays van wind, regen en isolijnen
   (`LayerOverlay.draw`) 74 ms/s, de Solid-updates per afspeeltik ~40 ms/s. MapLibre is klein (6 %).
3. Met `zakcanvas=los` rastert Skia de kleine canvassen **in het contentproces** (`blit_trapezoid_row`,
   `aaa_fill_path` in de zelf-top): de CanvasRenderer daalt, de hoofddraad stijgt evenveel. Kleine canvassen zijn
   dus geen uitweg.

### 3. Kandidaat voor het padtekenen: `?dev&zakpaden=zuinig`

Een bitmapcache van de hele zak zou de golf moeten afronden: vorm, kracht en golf hangen continu van de tijd af, en
afgeronde stappen zie je. Wel vast per frame is de badge. `zakpaden=zuinig` doet daarom twee dingen: de vijf banden als
twee vullingen (oranje en wit elk één pad), en de schijf van de badge (schaduw, wit, inktrand: drie paden) uit een
bitmapcache per maat en kwart canvaspixel subpixelfase. Het getal blijft live (uit een cache schoof Gecko de glyphs
tot een canvaspixel op, Δ 227). Per zak per frame zijn dat 8 in plaats van 14 padopdrachten (incl. de tekst).

Beeldverschil (`windsock-dirty-check.ts --zuinig`, vijf pannen, licht en donker; de check faalt bewust op zijn
grens): 5 000–5 800 px met Δ > 2 op ~78 000 inktpixels (6–7 %), max Δ 101–121. Daarvan ligt ~80 % op de rand van de
schijf: de kwartfase en de cache verschuiven het antialias daar (met 16 fasen halveert dat, maar dan 16× zoveel
cachebitmaps); de rest zit op de bandnaden (de banden van één kleur gaan nu in één keer, dus een andere kleur ligt
bovenaan op de naad). Op 4× uitvergroot zie ik in licht en donker geen verschil: `zakpaden-basis-vs-zuinig.jpg`
(links basis, rechts zuinig). Niet onzichtbaar volgens de pixelcheck, dus een PO-keuze als de telefoon er baat bij
heeft.

Rig (build r3, alle lagen aan, één run, load 20–41): alle varianten laden en spelen af (`windsock-draw` en `wind-step`
> 0); de spelend-fps (basis 20, `zakclip=aan` 44, `zuinig` 41, `zuinig&zakcanvas=los` 18) volgen vooral de load (basis
viel op load 36–42) en zeggen niets over de telefoon.

### 3a. Voorgetekende zakken: `?dev&zakpaden=bitmap` (PO-aanvulling 11:55 UTC)

`src/core/windsock-predrawn.ts`. Met de standaardkromming (`geen`) is een zak ten opzichte van zijn richting een functie
van de kracht, twee golffasen (`sin(reis) + 0,35·sin(1,7·reis + 2,3·fase)`, dus niet periodiek in één fase), de trage
vlaag en het uitdempen. Per stand (kracht per ⅛ Bft, golf 16 standen, tweede golf 8, uitdempen per ¼) gaan twee
bitmaps lui in een cache van 240 standen, minst recent gebruikt eruit, met thema en DPR in de sleutel: de zak zonder
schaduw, en de schaduw apart (die valt op het scherm altijd 1,3 px omlaag; in de gedraaide bitmap zou hij meedraaien).
De vlaag wordt een draaiing van de hele zak (zijn waarde halverwege). Per zak per frame: twee `drawImage` met de
draaiing in de transform, het gat vegen (de badge staat op de mast, dus het gat is rond en draait niet mee), de schijf uit
de schijfcache en het getal live. Uit een bitmap schoof het getal tot een canvaspixel op (zie `zuinig`), daarom geen
bitmap per tekst.

Cache in de rig (treffers/missers na ~25 s, alle lagen aan, afspelen en stil):

| | treffers / missers | treffers |
| --- | --- | --- |
| `zakpaden=bitmap` (exacte golf) | 645 / 2 885 · 1 845 / 4 675 · 2 072 / 4 688 · 2 595 / 5 025 | 18–34 % |
| `zakpaden=bitmap&zakgolf=regelmatig` | 6 126 / 624 · 6 349 / 631 | 91 % |

Met de exacte golf heeft een zak per krachtstap 16 × 8 = 128 standen, en tijdens afspelen loopt de kracht continu: de
cache zit na seconden vol en de meeste frames tekenen de zak opnieuw in twee bitmaps, dus méér werk dan direct.
`zakgolf=regelmatig` maakt de tweede golf een harmonische (2× in plaats van 1,7×, met een vaste fase per zak), zodat een
zak per krachtstap 16 standen heeft. Dat maakt het wuiven regelmatiger; de opmerking in `windsock-flow.ts` noemt de
1,7× juist tegen "een metronoom". Dat is dus een PO-keuze.

Beeldverschil (`windsock-dirty-check.ts --bitmap`, vijf pannen; met `--wuivend` zonder reducedMotion en met bevroren klok,
zodat getest en referentie dezelfde wuifstand hebben; de controle `--wuivend` zonder bitmap is exact gelijk):

| | Δ > 2, van ~79 000 inktpixels | max Δ | waarvan schijfrand |
| --- | --- | --- | --- |
| stil (`--bitmap`) | 20 500–22 000 px (26–27 %) | 193–212 | ~4 200 px |
| wuivend (`--bitmap --wuivend`) | 21 100–22 800 px (27–28 %) | 215–230 | ~4 200 px |
| wuivend, regelmatig | 22 400–24 000 px (28–30 %) | 229–234 | ~4 200 px |

Het meeste zit niet in de golf maar in het draaien (`drawImage` herbemonstert elke rand bilineair) en de krachtstap (⅛ Bft
is tot ~0,3 CSS-px lengte). Stilstaand op 4× zie ik in licht en donker geen duidelijk verschil
(`zakpaden-basis-vs-bitmap.jpg`, links basis, rechts bitmap). De beweging zelf heb ik niet als film bekeken: bij zwakke
wind (0,45 Hz) zijn 16 golfstanden ~7 sprongen per seconde, en dat kan schokken. Op de telefoon kijken.

Rig (rAF-tempo, load 14–26, ruis): de JS per zaktekening werd niet lager (p50 basis 3–4 ms, bitmap 5–16 ms, regelmatig
4–5 ms), en het tempo spelend lag binnen de ruis van de basis. De rig rastert in software en telt rAF; beslissen kan alleen
op getoonde frames op de telefoon.

### 3b. Schets: stijve segmenten in WebGL (niet gebouwd)

1. Niet in de canvas van de deeltjes: die ligt onder de regen (de zakken liggen erboven), en met `deeltjes=uit` is hij er
   niet. Wel een eigen `LayerOverlay` met een `SockLayer` (custom layer, WebGL2) als bovenste canvas, op dezelfde plek als
   nu de 2D-canvas. Dat is één WebGL-canvas, zonder 2D-commando's die de CanvasRenderer moet afspelen.
2. Geometrie op de CPU zoals nu (`windsockShape`, exact, geen kwantisering): per zak de 21 aspunten, daaruit per band een
   quad (vier hoeken op de bandgrenzen links en rechts). Per frame één instancebuffer (14 zakken × 5 banden × 4 hoeken,
   ~2 kB) en één instanced draw voor banden, rand en schaduw. Een fragmentshader tekent de rand als afstandsveld tot de
   omtrek (wit 3,2 px, inkt 1,1 px, schaduw 1,3 px omlaag), met antialias over één apparaatpixel. Voor de voegen tussen
   segmenten werkt een omtrek per zak (een strip langs `left` en `right`) beter dan losse quads.
3. Badge: een tweede instanced draw met cirkels als afstandsveld. De cijfers komen uit een glyph-atlas (0–9 en
   eenheden, één keer met de 2D-canvas gerasterd en geüpload).
4. Het gat: geen vegen nodig, de cirkelafstand in de bandshader zet de alfa binnen `cutRadius` op 0.
5. Risico's: het antialias wijkt af van Skia (pixelcheck tegen het 2D-pad), en de cijfers uit een atlas schuiven net als
   bij `zuinig`. Schatting 1–2 dagen inclusief pixelcheck.

### 4. `?perf=start&auto`

`?perf=start&auto` (of `&auto=<naam>`) stuurt de koude-startopname na afloop zelf naar de profielsink (dezelfde POST
als Versturen). De variant gaat mee in `metadata.label`: de waarde van `auto`, anders de overige parameters
(`zakclip=aan`); `prof-sink.ts` zet die in de bestandsnaam. Gecontroleerd met `scripts/perf-auto-check.ts` tegen een
eigen sink: "Verstuurd als 2026-11-10T11:49:12.597Z-linux-x86_64-zakclip-aan.json". De sink op 4331 draait nog de
oude `prof-sink.ts`; tot een herstart staat het label alleen in de metadata.

### 5. De fps-teller in de app telt rAF

Laptop-agent (SurfaceFlinger): `?perf=1` toont 51,6 fps waar het scherm 24,0 frames krijgt. De teller
(`PerfMonitor.frameTick`) telt `requestAnimationFrame`-callbacks. Gecko roept rAF aan op het tempo van de refresh driver,
ook als de compositor of de GPU dat frame niet op het scherm krijgt. Getoonde frames kan een pagina niet zien. Erger:
de teller liep altijd, ook zonder `?perf` (`installPerfMonitor` startte hem bij het laden). Zo'n eeuwige rAF-lus houdt
de refresh driver op schermtempo (120 Hz op de Pixel 9), wat `overlay-canvas.ts` juist vermijdt. Nu loopt de teller
alleen tijdens het meten (`?perf` of de HUD zichtbaar, `setDetailedEnabled`), en heet hij in de HUD "rAF/s", met de
uitleg in een tooltip. `e2e/focus.spec.ts` zet het meten aan voordat hij de fps logt. Ook de rig (`wind-frame-gaps.ts`)
telt rAF; zijn "fps" is dus geen getoond frame.

### Telefoonlinks ronde 3

1. Basis (nieuwe standaard): `http://ageq-dev2:4312/?perf=start&modus=wind&dev`
2. Oude clip: `http://ageq-dev2:4312/?perf=start&modus=wind&dev&zakclip=aan`
3. Voorgetekend (3a): `http://ageq-dev2:4312/?perf=start&modus=wind&dev&zakpaden=bitmap`
4. Voorgetekend, regelmatige golf: `http://ageq-dev2:4312/?perf=start&modus=wind&dev&zakpaden=bitmap&zakgolf=regelmatig`
5. Zuinige paden: `http://ageq-dev2:4312/?perf=start&modus=wind&dev&zakpaden=zuinig`

Zonder `perf` (getoonde frames met SurfaceFlinger, zoals de laptop-agent meet): dezelfde links zonder `perf=start&`.
Gecko-profielen: `gecko-android-agent.md` (`android-r3-<variant>.json.gz`).

## Ronde 4 (2026-11-10): DOM-rust op de content-hoofddraad

### Wat er per frame in de DOM verandert (Firefox-rig, Wind, spelend, 10 s, `scripts/wind-dom-churn.ts`)

Alleen echte wijzigingen; build 6c9f00e (vóór), 58 rAF/s:

| element | wat | per s | oorzaak |
| --- | --- | --- | --- |
| `.chart-plot` → `div.cursor-readout` | element erbij én eraf | 57 + 57 | `<For each={cursorWind()}>` in `HistogramScrubber`: elke cursorstap nieuwe objecten, dus elke frame een nieuw element (met volledige stijlberekening, ook `color-mix()`) |
| `.day-labels > span` | `style` (transform) | 55 | daglabels schuiven mee met de scrollende tijdlijn (bedoelde beweging) |
| zakcanvas | `data-draws` | 29 | eigen teller per zaktekening (alleen een rig las hem) |
| `.chart-track` | `style` (transform) | 27,5 | de tijdlijn scrolt tijdens afspelen (bedoelde beweging) |
| `g.cloud-band` | paden erbij/eraf | 12 | `<For>` over padstrings: een gewijzigd pad is een nieuw element |
| windgradiënt `lineargradient` | stops erbij/eraf | 9,6 | `<For>` over nieuwe stop-objecten |
| klok, cursortijd, `aria-label`/`aria-valuetext`, `data-epoch` | tekst/attribuut | 8,5 elk | per afspeeltik; de tekst verandert echt |
| gradiëntstops lucht/wolken | `style` | 3 | de kleur van de lucht verloopt (bedoeld) |

`document.getAnimations()` was tijdens afspelen steeds leeg: er loopt geen CSS-animatie of -overgang.
`Servo_InterpolateColor` in het Gecko-profiel is dus geen animatie, maar de stijlberekening van de elementen die elke
frame nieuw zijn (`.cursor-readout span` heeft `background: color-mix(…)`).

Daarbij, in het Gecko-profiel van de zaktekening (`gecko-hotspots.ts --under="draw (src/core/wind-socks.ts"`,
`android-r2-zakclip-uit`): **`get Window.innerWidth` 46 % van de zaktekening (32 ms/s)**, met daaronder
`PresShell::DoFlushPendingNotifications Layout` 31 ms/s en een Reflow van 15 ms/s. `draw()` las
`mapLabelSize(window.innerWidth, window.innerHeight)`; met de vuile DOM hierboven dwingt dat binnen de promise-callback
van `setField` een synchrone stijl- en layoutflush af, vóór de refresh driver die zelf nog eens doet. Verder 21 % in de
kladcanvas (sinds ronde 3 weg) en 13,5 % in de labelindeling (`queryRenderedFeatures`, vier keer per s).

### `?dev&domrust` (standaard aan; `uit` = het oude gedrag)

1. `Rows` in `HistogramScrubber`: met `domrust` `<Index>` in plaats van `<For>` voor de cursorwaarden (wind, temperatuur),
   de gradiëntstops (wind, temperatuur) en de wolkenpaden. De elementen blijven staan; alleen `top`, tekst of `d` wisselen.
   De `tween`-overgang (`top .14s`) op de wind- en temperatuurwaarden kon met `<For>` nooit lopen (nieuw element); met
   `domrust` laat ik die klasse daar weg, zodat het beeld gelijk blijft.
2. `viewportMapLabelSize()` (`map-labels.ts`): innerWidth/innerHeight gecachet tot `resize`, voor de zakken en de
   temperatuurgetallen.
3. Geen `data-draws` per zaktekening (`scripts/windsock-perf.ts` leest de teller nu via `__motregenWindsocks()`).

Na (build r4, `domrust` aan): de cursorwaarde houdt één element (`top` 27/s, mee met de scroll), de stops en
wolkenpaden worden niet meer vervangen, `data-draws` is weg. Over blijven de bedoelde beweging (tijdlijn, daglabels) en
de per tik echt wijzigende teksten. Beeld: telefoonbeeld gepauzeerd met `deeltjes=uit` (de windstreepjes hangen van de
klok af), `domrust` aan tegen uit: donker byte-identiek; licht in een tweede paar byte-identiek (in het eerste paar
verschilde alleen het bronlabel van de kaart, en de opname met `domrust` aan verschilde daar ook van zichzelf: timing).

Niet veranderd:
- De tijdlijn en de daglabels die tijdens afspelen schuiven: dat is beweging, al via `transform`. Gecko bouwt daarvoor
  wel elke frame een displaylist; alleen een compositoranimatie (WAAPI) zou dat wegnemen, en dat vraagt een herbouw
  van het scrollen.
- De klok en de `aria-valuetext` per afspeeltik: die veranderen echt, en schermlezers lezen ze.
- `showWindsocks`/`setField` per tik: bewust. De zakken volgen de kaarttijd continu (menging tussen twee uren),
  zodat ze vloeiend draaien. De ~140 ms/s uit ronde 3 telt dubbel: `showWindsocks` (76 ms/s) bevat `setField`
  (66 ms/s), en die bevat de tekening zelf. Daarvan was 46 % de layoutflush (nu weg), 21 % de kladcanvas (weg sinds
  ronde 3) en 13,5 % de labelindeling.

Rig (rAF/s, load 18–95): geen bruikbaar verschil. Beslissen op SurfaceFlinger.

### `?dev&camera=<lon>,<lat>,<zoom>`

Zet de kaart bij het laden vast, zonder kaartbegrenzing, locatiefix, centreren op de pin of minimale zoom, en schrijft
geen kaartstand of plaats naar de opslag. `scripts/camera-check.ts` (eerst een bezoek zonder knop met geolocatie
Groningen en opgeslagen stand, dan met `camera=5.29,52.13,7`): Firefox en Chromium allebei `{lng 5.29, lat 52.13,
zoom 7}`, opslag ongewijzigd. De pin blijft op de onthouden plaats; alleen de camera staat vast.

### Telefoonlinks ronde 4 (zonder `perf`, voor SurfaceFlinger)

1. Basis (domrust aan): `http://ageq-dev2:4312/?modus=wind&dev&camera=5.29,52.13,7`
2. Oud gedrag: `http://ageq-dev2:4312/?modus=wind&dev&camera=5.29,52.13,7&domrust=uit`

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
