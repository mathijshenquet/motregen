# MIP-11: isolijnen als keyframes, voorgerekend (Rust of worker) en per snede meegegleden

Status: draft
Auteur: U13 (claude opus), 2026-09-24

## 1. Het probleem

Sinds U13 zijn de isolijnen vectoren: per tijdsnede traceert een worker de exacte contouren van
het bicubische B-spline-veld (Newton op T = L, kromming-adaptief verdicht) en tekent de GPU ze op
device-resolutie. Dat oogt goed en kost in rust niets. Tijdens afspelen of scrubben kost het wel
**~8 ms CPU per snede** (warm; Node en browser gelijk gemeten). Op 60 Hz is dat een halve core,
de hele tijd. De PO (2026-09-24): "laten we liever veel precomputen in Rust, dat scheelt veel
warme mobieltjes/macbooks — als het goedkoop over de wire kan."

## 2. Metingen (U13-LOG, echte uurframes van 2026-09-24)

- Veld `feels_like_c` op de wire: 355 kB + 410 kB + 73 kB = **838 kB voor 53 uurframes**
  (~15–17 kB per frame).
- Isolijnen van één snede (1 °C, lusjes < 60 km weg) als centripetale Catmull-Rom door
  Douglas-Peucker-steunpunten, int8-delta's op 1/64 cel + zstd:

  | max. afwijking | steunpunten | bytes (zstd) | × 53 uurframes |
  |---|---|---|---|
  | 0,02 cel (73 m) | ~9.000 | ~15,8 kB | ~840 kB |
  | 0,05 cel (182 m) | ~5.800 | ~11,7 kB | ~620 kB |
  | 0,10 cel (364 m) | ~4.000 | ~9,0 kB | ~480 kB |

  0,05 cel is op z6 ~0,25 CSS-px, op z9 ~2 px.
- Keyframes per kwartier (voor een vloeiende tween zonder clientwerk) zijn ×4: 2–2,5 MB extra.
  Dat is niet goedkoop.

## 3. De kern: de hitte zit in het per-frame hertraceren, niet in waar het traceren gebeurt

Keyframes per uur plus **meeglijden** lossen de hitte op, ongeacht wie de keyframes maakt.
Meeglijden werkt zo: zet de steunpunten van de twee omliggende uur-keyframes met één Newton-stap
op de snede T(x, y, t) = L en crossfade de twee op het tijdgewicht. Lijnen die in beide uren
bestaan vallen dan samen; een ring die binnen het uur ontstaat of verdwijnt, fadet in of uit.
Het veld is daarvoor nodig, maar dat staat al op de client (stadslabels, tabel, labels). Kosten
per snede: ~2 × 5k steunpunten × 1 sample ≈ **< 1 ms**, tegen ~8 ms nu.

- **Optie A — keyframes in de client-worker:** eenmalig 53 × ~8 ms ≈ 0,4 s CPU per sessie
  (in rust, vooruit), 0 extra bytes.
- **Optie B — keyframes in de Rust-ingest (PO-richting):** 0 trace-CPU op de client,
  **+480–620 kB (+57–74 % op feels_like)**. Voordelen: identieke lijnen overal; offline kan het
  zwaarder (ringen over de tijd volgen, labelankers vooruit kiezen, of fijnere lijnen uit het
  2,5-km-HARMONIE-grid vóór het downsamplen). Nadelen: stap (1/2/5 °C), blur en L_min liggen
  vast in de ingest; twee implementaties (Rust + TS); een extra chunktype in het mrf-contract.

## 4. Aanbeveling

Bouw eerst **A** (keyframes + meeglijden in de worker, client-side). Dat haalt vrijwel alle
hitte weg (8 → < 1 ms per snede, plus 0,4 s eenmalig) zonder bytes of contractwijziging. B
daarna alleen als de PO de offline voordelen wil (ringen volgen, native grid). Het meeglijden
aan de clientkant is dan precies dezelfde code, zodat A geen weggegooid werk is.

## 5. Open vragen (korte smaakkeuzes)

1. A eerst, of direct B (+~0,5 MB per run voor 0,4 s CPU per sessie)?
2. Precisie van de keyframes: 0,05 cel (op z9 bijverdichten in beeld) of 0,02 cel (~+35 % bytes)?
3. Bij B: isolijnen alleen voor stap 1 °C voorrekenen (2 en 5 zijn deelverzamelingen), of ook
   blur/L_min-varianten?
