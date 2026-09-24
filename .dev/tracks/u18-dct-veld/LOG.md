# Track U18 — gevoelstemperatuurveld als laagfrequente DCT — LOG (append-only)

## 2026-09-24 ~15:10 — start, oriëntatie
- Worker: claude opus in herdr-worktree `track/u18-dct-veld` (vanaf main d800119).
- Consumenten van `feels_like_c` in de client (App.tsx): isolijn-volume + tracer (`preparedIsolineField`,
  blur 2 → `prepareField`), isolijnlabels (`showIsolines` → IsolineWorker), stadslabels
  (`temperature.ts`), én het urenoverzicht (`readPointSeries`/`readCachedPointSeries`, rauwe cel).
  → Bytes besparen kan alleen als óók de tabel uit het DCT-veld leest; anders laadt de tabel de
  bitmapframes toch en komt de DCT-chunk er alleen bovenop. Ontwerpvraag, zie meting.
- **Feit dat de business case verschuift**: prod-uurframes `feels_like_c` op het 6-km-grid zijn
  **~15 kB/frame** (07Z l1-24: 14.923 B gem., l25-48: 16.960 B, hist4: 13.814 B), niet ~47 kB — dat
  getal is van het oude 2-km-grid (lokale 0923-chunks 625×675: 48.144 / 47.742 B).
- Meetcorpus (scratchpad, niet gecommit): prod 07Z (48 frames) + 03Z hist4 (6 km); lokaal 0923T06 en
  0923T10 (2 km, voor de meting 3×3-blokgemiddeld naar 6 km zoals de ingest). = 4 runs.

## 2026-09-24 ~15:45 — meting K (4 runs, 100 uurframes) + ontwerpkeuze
Script: `.dev/tracks/u18-dct-veld/measure.py` (uv, weggooi; `uv run --with numpy --with scipy --with zstandard
python measure.py <dir>`; extra arg → rest-meting). Referentie = wat de isolijnen nu tekenen: blur2 (U13-
boxblur, no-data-respecterend) van het rauwe 6-km-veld. `dct` = IDCT direct, `+blur2` = de ongewijzigde
client-pijplijn (blur 2) op het DCT-veld. NL = box 3,3–7,3° O × 50,7–53,6° N. Stad = 40 stadsankers,
tegen de rauwe cel (wat tabel/stadslabels nu tonen). Codering i16, stap 0,2 (ortho-DCT-eenheden).
```
K   B/frame | isolijnveld t.o.v. blur2-ref.            | stad t.o.v. rauwe cel
            | dct: rms  NL-max | +blur2: rms  NL-p99 NL-max | rms   max   gelijk afgerond °
16     356  |   0.462  5.54   |   0.462  1.40  5.55      | 1.07  3.94  34 %
24     717  |   0.335  4.06   |   0.334  0.92  3.98      | 1.02  4.54  35 %
32    1144  |   0.249  3.08   |   0.246  0.65  3.09      | 0.96  4.21  38 %
48    2252  |   0.158  1.91   |   0.139  0.37  1.83      | 0.86  4.19  42 %
64    3669  |   0.139  1.73   |   0.076  0.20  1.06      | 0.69  3.20  52 %
96    7244  |   0.190  2.71   |   0.021  0.05  0.20      | 0.45  2.57  67 %
```
(f16 i.p.v. i16: zelfde fout, 2× de bytes, K=64 7.724 B. i16 met vaste stap 0,05/0,1 laat de DC-coëfficiënt
overlopen — onbruikbaar; daarom stap = max(0,2, max|c|/32767) per frame.) Masker bitpacked+zstd: 28 B.
Layout (K=64): rij-major met gesplitste bytevlakken 3.624 B < diagonaal 3.669 < interleaved 3.842.
Bitmap nu: 6-km-frame ~15,5 kB.
- **Rest-codering** (DCT + (rauw−DCT) op 0,3 °C als u8, exact tot 0,15 °C): K=32/48/64 → 13,99/13,89/14,08 kB.
  Geen winst t.o.v. de bitmap (15,5 kB): het 6-km-veld heeft echt hoogfrequente inhoud (kust). Verworpen.
- **Keuze K=64**: rms 0,076 °C en max 1,06 °C t.o.v. vandaag (criterium ≤0,25 / ≤~2) met de ongewijzigde blur;
  K=48 haalt het net (0,139 / 1,83) maar de stadslabels worden daar slechter (42 % gelijk). 3,7 kB/frame = 24 %
  van de bitmap. K=32 valt af op de kust (max 3,1 °C).
- **Kanttekening voor de PO — puntwaarden.** Tegen de rauwe cel wijkt het DCT-veld op stadsankers rms 0,69 °C af,
  max 3,2 °C (kuststeden); maar 52 % van de afgeronde stadslabels blijft gelijk. Daarom:
  * urenoverzicht (puntwaarde) blijft op de bitmap `feels_like_c` — exact, onveranderd;
  * kaart (isolijnen, isolijnlabels, stadslabels) gebruikt het DCT-veld als het in het manifest staat (spec).
  Gevolg: stadslabel op de kaart en tabelwaarde voor dezelfde stad kunnen tot ~3 °C verschillen aan de kust.
  Bytes: passief (tabel laadt 18 u bitmap, kaart gebruikt dezelfde frames nu) +~4 DCT-frames ≈ +15 kB; winst zit
  in scrubben/afspelen: per uur buiten het passieve tabelvenster 3,7 kB i.p.v. 15,5 kB (48 u: ~30 frames ≈ −350 kB).
  De "30 KiB/frame" uit de PO-quote kwam van het oude 2-km-grid; op 6 km is het ~12 kB/frame.
- `temp_c_dct`: niet gebouwd — de kaart toont alleen gevoelstemperatuur (U5), er is geen consument.
- **Formaat** (contract-additief): nieuw veld `feels_like_dct`, eigen chunk per dagdeel/hist naast de bitmap;
  mrf-header krijgt optioneel `"dct": {"k": 64}`; `quant` = de gewone temperatuurtabel (waarmee de client
  hergekwantiseerd). Frame na zstd: f32 stap | no-data-masker bitpacked (MSB eerst, 1 = no-data, rij-major) |
  K² i16 rij-major (ky, kx) als lage bytes dan hoge bytes. DCT-II orthonormaal, no-data eerst gevuld met de
  (BFS-)naaste geldige cel. Eigen DCT in Rust (matrixvorm met cos-tabellen, K·H·W ≈ 3 M MAC's) — geen
  `rustdct`, dus geen Cargo.lock-wijziging.
- **Client**: de zstd-worker doet voor DCT-chunks ook de IDCT en kwantiseert terug op de header-`quant`
  (255 = no-data uit het masker) → een frame dat er voor alle kaartconsumenten uitziet als een bitmapframe,
  gecachet in de bestaande frame-LRU. Daardoor blijven isolijnen/labels/stadslabels code-ongewijzigd; alleen
  de tijdlijnbron wisselt (feature-detectie: `feels_like_dct` in het manifest → kaart; anders bitmap).

## 2026-09-24 ~16:30 — gebouwd (73084f9, 4f4d7bc), main gemerged (1728445), gates + metingen
- **Rust**: `mrf::dct` (eigen DCT-II ortho in matrixvorm, BFS-naaste-buur-vulling, stap max(0,2, max|c|/32767),
  bitmasker, gesplitste bytevlakken); optionele `dct`-sleutel in `Header`/`ChunkMeta`, framelengte gevalideerd;
  ingest publiceert `feels_like_dct` (K=64) per dagdeel en hist naast `feels_like_c`; K zit in de chunknaam-hash.
  Tests: round-trip glad veld, volle K ≈ exact, byte-determinisme, no-data-masker, warme DC zonder overloop,
  golden frame (gedeeld met TS: byte-pariteit Rust ↔ TS-encoder), container-round-trip, ingest-chunks.
  Geen nieuwe dependency → Cargo.lock ongewijzigd → `nix flake check` niet nodig.
- **Client**: `web/src/core/dct.ts` (IDCT + terugkwantisering + encoder voor synthgen); de zstd-worker levert voor
  DCT-chunks direct een bitmapframe. App: `feelsLikeMapTimeline` (DCT als aanwezig, `?gevoelveld=bitmap` forceert
  bitmap) voor isolijnen, isolijnlabels en stadslabels; tabel onveranderd op `feels_like_c`. Tijdens de e2e gevonden:
  (1) losse DCT-frame-Ranges → warme reload 4.362 B i.p.v. 0 (Chromium sparse cache, U15-les) → DCT-chunk altijd
  als één payload-Range; (2) DCT-frames in de gedeelde 512-LRU drukten tabelframes eruit (locatieklik viel terug
  naar skeleton) → eigen LRU van 64; (3) scrubben haalde elk uur apart (63 requests) → bij volledig laden alle
  DCT-payloads. focus.spec ververst nu ook `feels_like_dct`. Synthgen levert DCT-chunks (bestaande chunks byte-gelijk).
- **Gates op 1728445** (synchroon): `pnpm typecheck` TYPECHECK-EXIT 0; `pnpm test` TEST-EXIT 0 (40 files, 223);
  `pnpm build` BUILD-EXIT 0; `MOTREGEN_E2E_PORT=4344 MOTREGEN_E2E_DATA_PORT=8344 pnpm e2e` E2E-EXIT 0
  (20 passed, 13 skipped; load 13,4 → 13,7). Poort 4342 was bezet door de U17-preview (pid van track-u17-ui-polish,
  niet aangeraakt) → 4344/8344. `cargo fmt --check` 0, `cargo clippy --workspace -- -D warnings` 0 (ook
  `--all-targets`), `cargo test --workspace` 0.
- **Live** (`RUST_LOG=info target/release/motregen-ingest --once --data-dir <scratch>/live/data`, key uit `.env`):
  DAEMON-EXIT 0 (1 m 41 s); `uv run --project spec spec/validate_manifest.py <live>` VALIDATE-EXIT 0 (30 chunks,
  `feels_like_dct` erin; validator checkt nu `dct`); `mrf inspect` op de 3 DCT-chunks 0. Run 09Z: DCT
  90.129 / 92.660 / 20.372 B (l1-24 / l25-48 / hist5) tegen bitmap 364.439 / 406.526 / 69.266 B → 3,8 kB i.p.v.
  15,5 kB per frame. TS-decoder op die live frames (`web/tmp/u18-live.ts`): rms 0,087 °C, max 0,92 °C t.o.v.
  blur2(bitmap), na terugkwantisering, 53 frames.
- **Bytes (e2e, synth)**: passief main 762.274 B → U18 781.936 B (+19,7 kB; budget 800.000); scrub 16 → 18
  requests/106 frames; warm 0 B beide. Live-projectie: passief +~90 kB (DCT l1-24-payload), volledig laden +~203 kB.
- **Decodetijd per frame** (Chromium, leeg tabblad, live l1-24, `web/tmp/u18-split.mjs`): desktop zstd 7,1 + IDCT 4,5
  + kwantisering 0,9 ms; mobiel (CPU 4×) 30,3 + 17,6 + 3,6 ms. In de worker, één keer per uurframe, gecachet.
  Node: 0,8 + 3,5 + 0,9 ms.
- **Visueel** (`web/tmp/shots/u18-{z6,z9}-{dct,bitmap}.png`, live 09Z, 11:40, isolijnen gepind, 1280×800):
  z6 topologie grotendeels gelijk; kleine ringen (Amsterdam, IJsselmeerkust) vallen weg bij DCT. z9 Zeeland: de
  16°-lijn volgt bij de bitmap de Westerschelde/Walcheren-kust, bij DCT niet — lijnen liggen tot ~10–15 km anders.
  Het veld wijkt maar ~0,1–0,9 °C af, maar in vlakke gradiënten schuift een lijn daardoor ver.

## Bevindingen voor orchestrator/PO
1. **In de huidige laadpolitiek bespaart het DCT-veld géén bytes; het kost bytes.** De tabel leest `feels_like_c`
   als puntwaarde en laadt bij scrub/"Alles"/diepe idle alle bitmapchunks toch helemaal (fase `complete`). Het
   DCT-veld komt er dus bovenop: live +~90 kB passief, +~203 kB volledig. Winst vraagt dat ook de tabel het
   bitmapveld niet meer nodig heeft:
   - (B) tabel op DCT: −~640 kB per volledige sessie live, maar puntfout rms 0,7 °C, max 3,2 °C (kuststeden; 52 %
     afgerond gelijk). Afgeraden.
   - (F) gevoel in de client afleiden uit velden die de tabel al laadt (`temp_c`, windpaar 6 km, `rel_humidity`
     16 km) met de MIP-10-formule; `feels_like_c` niet meer publiceren → kaart DCT, tabel formule. Niet gemeten:
     de fout van een formule op gemiddelde invoer (RH 16 km!). Voorstel, niet gebouwd.
   - (C) niet mergen/uitzetten tot er een besluit ligt; de code is additief en kan ook achter de
     feature-detectie blijven staan (ingest publiceert, client negeert via bv. een default `?gevoelveld=bitmap`).
2. **Kustprecisie**: z9 laat zien dat K=64 op 6 km de land-zeegrens niet volgt; de meetcriteria (rms ≤ 0,25,
   max ≤ 2 °C) worden gehaald, maar lijnen schuiven op zicht. PO-oordeel op de shots nodig.
3. **Los van U18 — fzstd-allocatie**: onze zstd-members hebben geen content-size; fzstd alloceert dan per frame
   een venster van 8 MB. Met een vooraf gemaakte outputbuffer: 47 kB-frame 7,6 → 1,0 ms, DCT 6,3 → 0,3 ms, maar
   1,7 MB-regenframe 12,6 → 20,1 ms (`web/tmp/u18-zstd.mjs`). Kan ook in de ingest (pledged size → content-size
   in de header). Niet gebouwd: met buffer meldt fzstd te korte output niet meer (lengtecontrole valt weg).
