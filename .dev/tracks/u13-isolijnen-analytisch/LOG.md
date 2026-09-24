# U13 — isolijnen analytisch (claude opus) — LOG (append-only)

## 2026-09-24 — start
- Spec: `.dev/specs/track-u13-isolijnen-analytisch.md`. Branch `track/u13-isolijnen-analytisch`
  vanaf main (eac6b5d). Eerst de fade-bug, dan het onderzoek A/B/C met meting.
- Gelezen: `isoline-layer.ts` (contour-shader: afstandsveld (s−L)/|∇s|, bicubisch = 4
  trilineaire fetches × 2 tijd = 8), `isoline-field.ts` (opvullen), `isolines.ts`
  (defaults: blur 2, fade gradiënt 0,02–0,06 °C/km, gekalibreerd U8c p50 op lijnpixels 0,08).

## 2026-09-24 ~11:10 — fade-bug: reproductie op de integratie-instantie
- Probe `web/tmp/probe.mjs` (niet gecommit, tmp/ is ignored): http://100.108.127.86:4300/?dev&perf=1
  (MagicDNS geeft IPv6 dat niet werkt; het tailnet-IPv4 wel), 1440×900 DPR 2, focus via
  de koptekst, afspelen gepauzeerd, `Vervagen` uit ↔ gradiënt, zelfde snede.
- Firefox headless heeft op deze host geen GL-driver ("Exhausted GL driver options"); werkt met
  Mesa llvmpipe uit nixpkgs onder Xvfb (`web/tmp/ff.sh`, `web/tmp/ffenv.sh`).
- **Resultaat: in beide headless browsers werkt de gradiënt-fade zichtbaar**, op de defaultzoom,
  z6, z9 en DPR 1 (Chromium/SwiftShader, Firefox/llvmpipe; ~100k px verschil per paar,
  `web/tmp/shots/repro-pair*.png`, `pair-z9.png`). De |∇T|-schaal in de shader klopt dus
  wiskundig op alle zoom/DPR-combinaties die ik kan draaien.
- |∇T| van vandaag uit het grid (uurframe 8, blur 2, centrale differenties, cel = 6 km·cos φ):
  alle cellen p50 0,029 °C/km; op lijnpixels (gewogen met |∇T|, lijnlengte/opp. ∝ |∇T|)
  p10/p25/p50/p75/p90 = 0,022/0,031/0,055/0,095/0,146 °C/km. Default 0,02–0,06 raakt dus
  ~de helft van de lijnlengte.
- Verschil met de PO-situatie (echte GPU, macOS): software-rasterizers filteren exact in
  float; echte GPU's filteren texels met ~8 bit subtexelgewichten, en het volume is RG16F
  (ulp 0,008 °C rond 13 °C). De bicubische B-spline-truc is 4 hardware-trilineaire fetches;
  dFdx van dat veld is op echte hardware getrapt/ruizig, en dat is precies de afgeleide die
  zowel de lijnbreedte als |∇T| voedt. Niet reproduceerbaar zonder GPU hier → structurele
  fix: veld exact evalueren (texelFetch, float32, analytische ∇T in cellen × km/cel), en een
  HUD die |∇T| p10/p50/p90 van de zichtbare lijnen toont zodat de PO het op zijn machine ziet.

## 2026-09-24 ~11:20 — PO-correctie punt 1 (gequeued)
- "De gradiënt-fade WERKT zoals gebouwd, maar het criterium is fout: te veel lijnen verdwijnen in
  vlak gebied. Weg moeten de kleine, snel wegpinchende lusjes." → gradiënt-fade default **uit**
  (knop blijft). Te vergelijken: (a) topologisch, gesloten contouren korter dan L_min km
  uitfaden; (b) lijnsnelheid met hogere drempels; (c) laagdoorlaat van het analytische veld.
  Default (a) of (c) op basis van screenshots + video.
- Mijn repro hierboven bevestigt "werkt zoals gebouwd"; de GPU-precisie-hypothese blijft als
  aantekening, maar de exacte evaluatie komt er toch (punt 2).
- Plan: route C (vectorlijnen) maakt (a) triviaal — per snede de contouren op de CPU trekken
  uit de exacte B-spline, lengte per gesloten lus is dan gewoon bekend, en de fade is een
  continue functie van die lengte (een krimpende lus vervaagt vóór hij verdwijnt; geen
  masker-texture nodig). (c) meet ik offline: lusjes-telling vs blur/DCT-K.

## 2026-09-24 ~12:00 — meting A/B/C + keuze
Offline op 9 echte uurvelden (blur 0, 209×225, 1 °C; `web/tmp/experiment.ts`), medianen per frame:
```
variant              ringen  <40km  <60km  <80km  totaalkm   rms°C  max°C (t.o.v. blur 0)
blur0 bilineair         653    540    585    609     46321    0.00   0.00
blur0 B-spline          271    191    221    237     35778    0.11   1.04
blur2 B-spline (nu)      60     23     35     42     24905    0.23   2.71
blur4 B-spline           34     11     16     20     22127    0.28   3.38
DCT K=16                  8      1      2      2     17292    0.49   5.18
DCT K=32                 33      7     14     18     22844    0.35   3.75
DCT K=64                135     68    102    115     30888    0.24   2.51
```
- (c) laagdoorlaat/DCT: haalt lusjes alleen weg door het héle veld te verschuiven (K=32 ≈ blur 4
  qua ringen, maar rms 0,35 °C en tot 3,8 °C: in vlak gebied verschuiven lijnen tientallen km).
  Per pixel K² = 1024 termen (K=32) → onbruikbaar zonder IDCT naar een fijn grid, en dan is het
  weer een bitmap. Winst van B zit alleen in bytes (~4 kB f16/frame i.p.v. ~47 kB) →
  **ingest-voorstel, niet gebouwd**: DCT-coëfficiënten publiceren kan later als payload-dieet.
- (a) lengte-criterium: raakt precies de ringen (blur 2: 35 van de 60 < 60 km), de rest van het
  veld blijft onaangetast. → **gekozen**, via route C (vector): de ringlengte komt gratis.
- (A) exacte bicubische evaluatie zit in C: controlepunten = de uurvelden, snede = tijdgewogen
  controlepunten (tensor-B-spline in x,y,t: een snede is weer een bicubische B-spline).
- C-kosten (CPU per nieuwe tijdsnede, Node desktop, `web/tmp/prof.ts`): eerste versie 14 ms
  (marching squares scande per niveau het hele rooster). Na CSR-bucketing van cellen per niveau,
  allocatievrije sampler en één Newton-stap: **4,9 ms mediaan (p90 7,7) heel rooster**,
  **0,34 ms voor een z8-venster**. ~9k punten/snede; verdichting tot tol 0,05 cel +15 % punten.
- PO-vraag (12:00): "isolijnen in rust berekenen, tijdcoherent?" → plan: tracer in een worker,
  met cache op gekwantiseerde tijd en vooruitrekenen in rust; main thread alleen upload.
- PO-verduidelijking: "rust = backend" (isolijnen in de Rust-ingest vooruitrekenen). **Voorstel,
  niet gebouwd** (spec: ingest alleen als voorstel): ingest publiceert per uur keyframe-geometrie
  (polylines, int16-delta's op 1/16 cel ≈ 36 kB/uur bij ~9k punten), of een (x,y,t)-isosurface.
  Client zou dan alleen snijden/meeglijden. Nadelen: bytes (sub-uurstappen × 48 u is te veel,
  dus toch client-interpolatie), stap/blur/L_min vast in de ingest, en de client heeft het veld
  toch nodig (labels, tween). Pas zinvol als de mobiele meting laat zien dat de client-worker
  (~5 ms/snede desktop) afspelen niet bijhoudt.

## 2026-09-24 ~12:30 — PO: hostregels (load ~30)
- Elke Playwright/Chromium-run onder `flock /tmp/motregen-e2e.lock`, nooit twee tegelijk, vóór
  zware runs pollen tot `cut -d" " -f1 /proc/loadavg` < 16 (genoteerd hier), lopende runs niet
  killen. Main mergen vóór de gates (main heeft de flock in de pnpm-e2e-scripts).

## 2026-09-24 ~13:30 — gebouwd: vectorisolijnen (C op A) + lusjes-criterium (a)
- `isoline-contours.ts`: snede = tijdgewogen controlepunten (`blendSlice`), knoopwaarden van de
  bicubische B-spline ([1 4 1]/6), cellen per niveau in één pass gebucket (CSR), marching
  squares alleen op die cellen, elk grof punt met één Newton-stap exact op T = L, koorden
  recursief gesplitst tot de afwijking < tolerantie (kromming-adaptief), ringlengte in km en
  |∇T| per punt. `ringFade`: smoothstep(½·L_min, L_min, lengte) voor gesloten ringen, open
  lijnen nooit. `buildSegments`: instance-data, volledig vervaagde ringen vallen weg.
- `isoline-tracer.ts` + worker: worker houdt kopieën van de uurvelden, krijgt per snede alleen de
  tijd (latest-wins, hooguit 1 onderweg + 1 wachtend); synchrone fallback zonder Worker (tests).
- `isoline-layer.ts` vectorpad: instanced quad per segment in schermpixels, capsule-afstand in
  de fragmentshader (ronde koppen, naadloos onder `blendEquation(MAX)`), stippel over de echte
  booglengte (i.p.v. de 16-hoekbakken-truc), rooster→mercator affien in float64 in de matrix
  (vertexcoördinaten 0–225 → exact in float32). Offscreen op device-resolutie (was ½ CSS-px),
  daarna dezelfde blit. Rust: geen setTime → geen request → 0 passes. Tolerantie in cellen volgt
  de zoom in machten van 2 (hertrace alleen bij een bucketgrens).
- Defaults: `vector: true`, `ringKm: 60`, `tolerancePx: 0.25`, `fade: 'uit'`. Knoppen:
  Vectorlijnen (vector/raster), Lusjes < (0–150 km), Verdichting (px), bestaande Bicubisch,
  Vervagen (gradiënt blijft, nu per punt ook in vector). HUD-rij "Isolijnen vector":
  sneden/s · ms worker · segmenten · lusjes vervaagd/totaal.
- Labels spawnen niet meer op ringen < ringKm (labelgeometrie in de worker filtert ermee).
- Spline-wiskunde (`sampleSlice`, `projectToLevel`, `sliceWeights`, `smoothstep`) verhuisd naar
  `isoline-spline.ts` (geen maplibre-import, bruikbaar in worker/Node).
- Eerste shots (Chromium/SwiftShader, DPR 2, preview :4333 met prod-data, load 14,9 onder
  flock): `web/tmp/shots/v1-pair-raster-vector.png` — vector is scherp (device-px), zelfde
  geometrie als de raster; `v1-pair-lusjes.png` — Veluwe-ringetje weg, ring bij Keulen half,
  verder niets veranderd. HUD in die run: 62 ringen, 27 vervaagd bij 60 km, ~9,7k segmenten.
- Open: worker-traceMs las ~50 ms in SwiftShader onder hostload (Node: 5 ms) → aparte meting.
