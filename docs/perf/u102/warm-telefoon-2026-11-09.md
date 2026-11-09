# Warm op de telefoon: waar de 8 s tot "histogram compleet" heen gaan (U102, 2026-11-09)

Eén schone meting op ageq-dev2 (32 cores), 2026-11-09 13:32–13:33 lokale tijd: loadavg 0,80 vlak vóór de start;
bij de start van de gemeten bezoeken 2,31 (Weer) en 4,55 (Gevoel), voornamelijk de meting zelf. Telefoonprofiel
(renderer-quota 40 %, 4G), warm bezoek (eerst een koud bezoek in dezelfde context), 1 run per modus, met een Chrome
performance trace en `?perf`. Eigen build van deze branch, prod-data van dat moment.

Reproduceren:

```
cd web
pnpm perf:modes --profiles telefoon --modes weer,gevoel --repeat 1 --no-interactions --trace
pnpm exec tsx scripts/perf-trace-split.ts tmp/perf-modes/<stempel>/telefoon-warm-{weer,gevoel}-run1.json
```

| | Weer | Gevoel |
| --- | ---: | ---: |
| histogram compleet, warm (0 B over de lijn) | 7.988 ms | 7.848 ms |
| renderer-CPU-budget: 40 % quota × die tijd | 3.195 ms | 3.139 ms |
| **gebruikt door de renderer** | **3.092 ms (97 %)** | **3.031 ms (97 %)** |
| (a) mrf-decode RTCOR | 150 ms (5 %) | 141 ms (4 %) |
| (a) mrf-decode nowcast | 115 ms (4 %) | 79 ms (3 %) |
| (a) mrf-decode seamless | 56 ms (2 %) | 143 ms (5 %) |
| (a) mrf-decode HARMONIE | 164 ms (5 %) | 210 ms (7 %) |
| (a) mrf-decode overig (beweging, UV, wolken) | 9 ms (0 %) | 28 ms (1 %) |
| (b) hoofddraad | 1.114 ms (35 %) | 877 ms (28 %) |
| (b) thread-pool: V8 (JIT-compilatie, GC), scriptstreaming, raster | 999 ms (31 %) | 1.306 ms (42 %) |
| (b) compositor en overige renderer-draden | 397 ms (12 %) | 93 ms (3 %) |
| (b) andere workers (kaart, isolijnen) | 89 ms (3 %) | 154 ms (5 %) |
| (c) budget ongebruikt | 104 ms (3 %) | 108 ms (3 %) |
| (c) wandklok zonder enige lopende taak: wachtrij U52 / niet gevraagd (U49, laagtimers) / netwerk / idle | 4 / 8 / 0 / 0 ms | 4 / 24 / 0 / 0 ms |
| laatste histogramframe: bytes binnen → op een worker → klaar | 2.004 → 7.972 → 7.988 ms (RTCOR) | 2.143 → 7.824 → 7.848 ms (HARMONIE) |
| gemiddelde tijd van een histogramframe in de decodewachtrij | 3.898 ms | 2.954 ms |
| decodes vóór histogram compleet | 139 frames, 493 ms CPU | 144 frames, 601 ms CPU |
| … die de kaart in de eerste 10 s ook nodig had | 9 frames, 206 ms | 10 frames, 192 ms |
| … alleen voor het histogram | 72 frames, 248 ms | 11 frames, 34 ms |
| … voor tabel en andere lagen | 58 frames, 30 ms | 123 frames, 347 ms |
| histogramframes die de kaart ook nodig had | 6 van 78 | 7 van 18 |

Percentages zijn van het renderer-CPU-budget. CPU-tijd is threadtijd uit de trace (`tdur`) tot het moment dat het
histogram compleet is. Onder de quota delen alle renderer-draden samen 0,4 CPU, dus een taak die "loopt" kan ook op
quota staan te wachten. Daarom is CPU tegen het budget de maat, niet de wandklok van een taak. Het GPU-proces
(swiftshader, buiten de quota) kost daarnaast 748 ms (Weer) en 452 ms (Gevoel); op een echte telefoon doet de GPU dat.

- **Het is rekenwerk, maar niet vooral mrf-decode.** De renderer zit 97 % van de tijd aan zijn quota. Mrf-decode is
  daarvan 16 % (Weer) en 20 % (Gevoel). De rest is de hoofddraad, V8 op de thread-pool en de compositor. Ruim 80 %
  van de thread-pool-tijd heeft in deze trace geen naam onder V8-GC of scriptstreaming; waarschijnlijk is het
  JIT-compilatie, maar die categorie stond niet aan.
- **Het histogram wacht op de decodewachtrij, niet op het netwerk.** Het laatste histogramframe komt na ≈ 2 s uit de
  cache, staat dan 5,7–6,0 s in de wachtrij achter ≈ 140 andere decodes, en is daarna in 16–24 ms gedecodeerd. Die
  decodes duren lang, omdat ze de volle quota delen met de hoofddraad en V8. Echt stilstaan, terwijl er niets
  loopt, komt nauwelijks voor: < 30 ms.
- **De kaart heeft weinig van die decodes nodig.** Van de decodes vóór "histogram compleet" waren er 9–10 voor de
  kaart (het framepaar rond nu en de afspeelbuffer); de rest is histogram (Weer: 72) of tabel en andere lagen
  (Gevoel: 123).

Uitvoer van `perf-trace-split.ts` per modus:

### telefoon 4G, warm, weer: histogram compleet na 7.988 ms (loadavg 2.31 bij de start)

Renderer-CPU-budget = 40 % × 7.988 ms = 3.195 ms; gebruikt 3.092 ms (97 %).

| deel | CPU-tijd | % van het budget |
| --- | ---: | ---: |
| (a) mrf-decode rtcor | 150 ms | 5 % |
| (a) mrf-decode nowcast | 115 ms | 4 % |
| (a) mrf-decode seamless | 56 ms | 2 % |
| (a) mrf-decode harmonie | 164 ms | 5 % |
| (a) mrf-decode overig (onbekend) | 9 ms | 0 % |
| (b) hoofddraad | 1.114 ms | 35 % |
| (b) thread-pool (V8: JIT-compilatie en GC, scriptstreaming, raster) | 999 ms | 31 % |
| (b) compositor en overige renderer-draden | 397 ms | 12 % |
| (b) andere workers (kaarttegels, isolijnen …) | 89 ms | 3 % |
| (c) budget ongebruikt | 104 ms | 3 % |

- Wandklok zonder enige renderertaak in uitvoering: wachtrij (U52) 4 ms, nog niet gevraagd (U49-budget, laagtimers) 8 ms, netwerk/cache 0 ms, idle 0 ms.
- Decodes vóór histogram compleet: 139 frames, 493 ms CPU. Kaart (frame rond nu, afspeelbuffer, of door de kaart gevraagd in de eerste 10 s): 9 frames, 206 ms; alleen histogram: 72, 248 ms; overig (tabel, andere lagen): 58, 30 ms.
- Van de 78 histogramframes had de kaart er 6 in de eerste 10 s ook nodig.
- Laatste histogramframe (rtcor, laag L1): gevraagd na 2.004 ms, bytes binnen na 2.004 ms, op een worker na 7.972 ms, klaar na 7.988 ms. Een histogramframe stond gemiddeld 3.898 ms in de decodewachtrij.
- GPU-proces (swiftshader, buiten de quota): 748 ms CPU.
- Decodes zonder gevonden frame (bron "onbekend"): motion 20×, cloud_high 2×, uv_clear 7×, uv 4×, rain_rate 1×, cloud_low 1×; 0 zonder workertaak.

### telefoon 4G, warm, gevoel: histogram compleet na 7.848 ms (loadavg 4.55 bij de start)

Renderer-CPU-budget = 40 % × 7.848 ms = 3.139 ms; gebruikt 3.031 ms (97 %).

| deel | CPU-tijd | % van het budget |
| --- | ---: | ---: |
| (a) mrf-decode rtcor | 141 ms | 4 % |
| (a) mrf-decode nowcast | 79 ms | 3 % |
| (a) mrf-decode seamless | 143 ms | 5 % |
| (a) mrf-decode harmonie | 210 ms | 7 % |
| (a) mrf-decode overig (onbekend) | 28 ms | 1 % |
| (b) hoofddraad | 877 ms | 28 % |
| (b) thread-pool (V8: JIT-compilatie en GC, scriptstreaming, raster) | 1.306 ms | 42 % |
| (b) compositor en overige renderer-draden | 93 ms | 3 % |
| (b) andere workers (kaarttegels, isolijnen …) | 154 ms | 5 % |
| (c) budget ongebruikt | 108 ms | 3 % |

- Wandklok zonder enige renderertaak in uitvoering: wachtrij (U52) 4 ms, nog niet gevraagd (U49-budget, laagtimers) 24 ms, netwerk/cache 0 ms, idle 0 ms.
- Decodes vóór histogram compleet: 144 frames, 601 ms CPU. Kaart (frame rond nu, afspeelbuffer, of door de kaart gevraagd in de eerste 10 s): 10 frames, 192 ms; alleen histogram: 11, 34 ms; overig (tabel, andere lagen): 123, 347 ms.
- Van de 18 histogramframes had de kaart er 7 in de eerste 10 s ook nodig.
- Laatste histogramframe (harmonie, laag L0): gevraagd na 2.143 ms, bytes binnen na 2.143 ms, op een worker na 7.824 ms, klaar na 7.848 ms. Een histogramframe stond gemiddeld 2.954 ms in de decodewachtrij.
- GPU-proces (swiftshader, buiten de quota): 452 ms CPU.
- Decodes zonder gevonden frame (bron "onbekend"): motion 18×, uv_clear 7×, rain_rate 4×, uv 4×; 0 zonder workertaak.
