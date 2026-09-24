# Track U18b — compact gevoelstemperatuurveld met verwaarloosbare fout — LOG (append-only)

## 2026-09-24 ~17:00 — start
- Worker: claude opus in herdr-worktree `track/u18b-veld-compressie` (vanaf `track/u18-dct-veld` f830a5d).
- Doel (PO): één compact veld voor kaart én tabel, puntfout ≤ 0,3 °C (de tabelstap), kustlijnen op hun plek,
  daarna `feels_like_c` als bitmap overbodig.
- Meetcorpus: U18's scratch (live 07Z l1-24/l25-48 + 03Z hist4; live 09Z l1-24/l25-48 + 04Z hist5) plus een
  verse `--once`-run van nu (3e live run). Lokale 2-km-runs van 0923 laat ik weg (niet het productiegrid).

## 2026-09-24 ~17:45 — meting (offline, 8 chunks, 5 runs) + keuze
Scripts (uv, weggooi, gecommit naast deze LOG): `measure.py` (alle varianten; `--near` ook bijna-verliesvrij,
`--cross` formule-residu), `ctxlab.py`/`flab.py`/`xlab.py` (contextmodellen). Repro:
`uv run --with numpy --with zstandard --with scipy python measure.py <dir> [--near|--cross]`.
Corpus: live 07Z (l1-24, l25-48) + 03Z hist4; live 09Z (l1-24, l25-48) + 04Z hist5; verse `--once` om 12:33Z
(HARMONIE 12Z nog niet uit → 09Z opnieuw; nieuw: 05Z hist4). = runs 03/04/05/07/09Z, 109 uurframes.
"ctx-coder" = exacte bitkost van een adaptief frequentiemodel per context (+masker via zstd) — wat een eigen
range-coder haalt tot op een paar bytes; "int8" = residu als byte + zstd-19.
```
variant (alle verliesvrij, index-exact t.o.v. bitmap)       B/frame   t.o.v. bitmap
bitmap (productie, zstd-19)                                   15.482     100 %
R  DCT16/32/64 + residu (int8, zstd)                    15.135/14.983/15.286   97–99 %   (U18 zag dit ook)
R  DCT64 + MED(residu)                                        15.349     100 %
P  links / (a+b)/2 / a+b−c / Paeth / MED, int8 zstd     12.907/11.806/12.601/11.866/11.536   75–84 %
P  MED, 255 als waarde (geen masker), int8 zstd               11.590      75 %
P  MED + ctx-coder (7 activiteitscontexten)                   10.118      65 %
P  (2a+2b−c+d)/4 + ctx-coder (activiteit × rest-van-4)         9.582      62 %
T  MED op framedelta (keten), int8 zstd / ctx-coder     10.444 / 9.165   68 / 60 %
X  residu t.o.v. MIP-10-formule op temp/RV/wind-frames, int8 zstd 9.023  58 %
X  idem + ctx-coder (tekens buren × rest-van-index)             6.725      43 %
NL MED bijna-verliesvrij |fout| ≤ 1 index (0,3 °C), int8/ctx     6.889 / 5.988   45 / 39 %   (niet exact)
(ref) U18 DCT K=64 (kaart, puntfout tot 3,2 °C)                  3.669      24 %
```
Puntfout/isolijnverschuiving: 0 voor alle verliesvrije varianten (index-exact per constructie; Walcheren-set
hoeft niet: het veld ís de bitmap). W (wavelet) niet gemeten: een verliesvrije 5/3 is ook een voorspeller +
entropiecoder; de P-familie zit al op de contextmodelvloer (~62 %), een transform voegt hier niets toe.

Bevinding: het 6-km-veld op 0,3 °C heeft ~1,6–2 bit/cel echte, onvoorspelbare inhoud (kust, windruis). Verlies-
vrij is ~38 % besparing het plafond zonder hulpvelden; DCT's 24 % kwam precies van het weggooien van wat de PO
wil houden.

**Keuze: P, voorspeller (2a+2b−c+d)/4 + eigen adaptieve range-coder, 28 contexten → ~9,6 kB/frame (62 %).**
- R valt af (geen winst). T valt af: 60 i.p.v. 62 % voor het opgeven van random access per frame (kaart-scrub
  haalt losse uren). X (43 %) is het beste getal maar koppelt het decoderen van gevoel aan vier andere frames
  (temp, RV-16 km, u, v) en vraagt een bit-identieke formule (exp/pow) in Rust én JS; de loader/framecache moet
  dan afhankelijkheden kennen. Te veel risico voor 19 procentpunt; als vervolgstap genoteerd.
- zstd op het MED-residu (75 %) is de simpelste optie; de eigen coder wint nog 13 procentpunt (~2 kB/frame,
  live ~100 kB per volledige sessie) voor ~150 regels per taal. En de codec is veldonafhankelijk: dezelfde
  frame-codering past op `temp_c`, wind, RV, straling — daar zit de grotere data-dieetwinst (niet in deze track).
- Bijna-verliesvrij (39–45 %) haalt de PO-formulering "fout ≤ 0,3 °C" maar niet de spec-eis "tabel byte-
  identiek"; niet gebouwd, optie voor de PO.
- **Formaat**: de codering is een frame-eigenschap van de chunk, geen nieuw veld: `feels_like_c` blijft het veld
  (zelfde waarden, zelfde tabel), de header krijgt `"pred": {"v": 1}`, mrf decodeert transparant naar cellen.
  `feels_like_dct` wordt niet meer gepubliceerd; de kaart leest weer `feels_like_c`. Eén veld voor alles, geen
  tijdelijke dubbele publicatie (de bitmap en de nieuwe chunk zijn dezelfde data; de client leest beide).
