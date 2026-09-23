# U8b — isolijnen 1 °C, streep/stip, alleen lijnlabels, vloeiend (worker: claude opus)

## 2026-09-23 16:40 — meting vóór (waar zit de schok?)
- Opzet: `vite build --outDir tmp/dist-before` op main-tip a74a7c2, `vite preview` met
  `MOTREGEN_DATA_ORIGIN=http://100.108.127.86:4300/data` (echte KNMI-data), Playwright-script
  `web/tmp/measure.mjs` (ongecommit, tmp/ is ignored): wikkelt `Worker` om rondes van de
  isolijn-worker te tellen/timen, rAF-intervallen, 10–12 s afspelen met vastgezette focus.
- feels_like_c = HARMONIE, **uurframes** (24 stuks). Lineaire blend tussen twee uurframes is
  in de tijd alleen C0: elke lijn verandert op elk heel uur van richting/snelheid.
- Desktop (SwiftShader): 3,9 worker-rondes/s → **setData-gap p50 273 ms, p95 680 ms**;
  worker p50 25 / p95 178 / max 232 ms; aantal lijnen springt 44↔58 tussen rondes
  (ringen boven/onder MIN_RING-drempel en kwantisatie van de mix op 1/20).
  fps 9,2 (SwiftShader, geen GPU-gate).
- Mobiel (4× CPU-throttle; worker-CPU wordt niet gethrottled): 5,4 rondes/s, gap p50 110 /
  p95 413 ms, worker p50 51 / p95 101 ms; fps 10,5.
- Conclusie: de schok zit in (1) de update-cadans ~4/s i.p.v. per frame — elke setData is
  een sprong, (2) topologie (ringen die verschijnen/verdwijnen) per ronde, (3) de C0-knik
  per uur. (1)+(2) zijn inherent aan CPU-geometrie; (3) aan de lineaire tijdsblend.

## 2026-09-23 16:50 — keuze: GPU-variant (a) + temporele B-spline (PO-aanvulling)
- GPU: contouren in een fragmentshader, per frame continu → per definitie geen sprongen;
  topologie verandert dan alleen continu (lijnen krimpen tot punt). Variant (b) houdt
  sprongen per update (hooguit kleiner) en kost meer CPU op mobiel.
- Veld: per uurframe éénmalig blur + no-data-vullen (cache), per rAF een gewogen som van de
  frames in het tijdvenster op de CPU (47k cellen × ≤8 frames, sub-ms) → één RG16F-texture
  (waarde, geldig). Shader: bicubische B-spline-sampling (4 bilineaire taps) zodat de lijnen
  geen knikjes op celgrenzen hebben; AA-lijn via afgeleiden; pariteitstreep in de shader.
- Temporeel (PO-aanvulling): gewichten uit een kubische B-spline-kern over de uurframes met
  schaal `venster` uur (support 4·venster frames, genormaliseerd). venster 0 = oude lineaire
  blend. B-spline is C2 in de tijd → geen richtingsknik per uur; niet-interpolerend
  (lagere nauwkeurigheid, PO akkoord). Meten: knik (snelheidssprong op de uurgrens) en
  afwijking t.o.v. de exacte uurvelden, per venster.
- Labels: blijven uit de worker-geometrie (zelfde temporele gewichten), op een lagere cadans
  (knop), alleen de symbol-laag; de lijnlaag vervalt.
