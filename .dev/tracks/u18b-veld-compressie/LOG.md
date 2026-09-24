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

## 2026-09-24 ~19:15 — gebouwd, gates, live, bewijs
Commits: d13e988 (mrf `pred`: codec + container + tests + `examples/pred_measure.rs`), b938e96 (ingest/client/
synthgen/validator/docs; U18's DCT teruggedraaid = revert 4f4d7bc + 73084f9), 17ecfdb (pred_measure t.o.v. opnieuw
gecodeerde bitmap), 3913c78 (bijvangst: content-size op pred-members).
- **Codec** (`crates/mrf/src/pred.rs`, `web/src/core/pred.ts`, spec in docs/mrf.md §Predictive frames): member =
  zstd(masker bitpacked ‖ range-gecodeerde residuen). Voorspeller ⌊(2a+2b−c+d+2)/4⌋, context = activiteit (7) × rest
  van 4, 64 symbolen met escape, adaptieve frequenties (+32, halveren boven 2^16), 32-bit range-coder met LZMA-carry.
  Decoder weigert korte/te lange/buiten-tabel-streams (exacte consumptie). Geen nieuwe dependency; Cargo.lock
  ongewijzigd → geen `nix flake check`.
- **Formaat**: header `"pred": {"v": 1}`; `mrf::decode`/`HeaderIndex::decode_frame` en de client-worker leveren
  transparant de cellen. Ingest: `feels_like_c` met pred (`PREDICTIVE_FIELDS`), `pred` zit in de URL-hash.
  `feels_like_dct` weg; de kaart leest weer `feels_like_c` (zelfde frames als de tabel, gedeelde LRU).
- **Keuze "één veld, geen dubbele publicatie"**: bitmap en pred zijn dezelfde cellen, dus er is niets om tijdelijk
  naast elkaar te houden; de client van deze branch leest beide vormen. Kanttekening: een open tabblad met een
  oude bundle kan na de datawissel `feels_like_c` niet decoderen (lengtefout) tot herladen → client vóór of met de
  ingest deployen (contract-changelog zegt het ook).
- **Bijvangst**: pred-members met pledged content-size (zstd::bulk). Kost 77 B over 109 frames; fzstd alloceert dan
  het member i.p.v. 8 MiB. Bitmapmembers bewust niet: daar kost het +1,06 % (zstd stemt parameters af op de
  bronlengte; gemeten stream 1.703.337 → bulk/pledged 1.721.421 B op 109 frames). Lengtecontrole blijft (decoder
  checkt W·H en exacte streamconsumptie).

Gates op 3913c78 (synchroon): `cargo fmt --check` FMT-EXIT 0; `cargo clippy --workspace -- -D warnings`
CLIPPY-EXIT 0 (ook `--all-targets` 0); `cargo test --workspace` CARGO-TEST-EXIT 0; Cargo.lock ongewijzigd;
`pnpm typecheck` TYPECHECK-EXIT 0; `pnpm test` TEST-EXIT 0 (40 files, 220 tests); `pnpm build` BUILD-EXIT 0;
`MOTREGEN_E2E_PORT=4354 MOTREGEN_E2E_DATA_PORT=8354 direnv exec .. pnpm e2e` E2E-EXIT 0 (20 passed, 13 skipped;
load 3,9 → 14,3; poorten vooraf vrij). (Zonder `direnv exec` faalt e2e op `caddy: command not found`.)
Live: `RUST_LOG=info target/release/motregen-ingest --once --data-dir <scratch>/live2/data` (cwd ~/motregen voor
.env) DAEMON-EXIT 0 (1 m 30 s); `uv run --project spec spec/validate_manifest.py <scratch>/live2/data`
VALIDATE-EXIT 0 (27 chunks, geen `feels_like_dct` meer).

**Exactheid.** Rust round-trip-assert op 109 corpusframes + 53 live frames (pred_measure); TS-decoder op de
Rust-gecodeerde live l1-24-chunk: 24/24 frames byte-gelijk aan `mrf decode` (`web/tmp/u18b-live.ts`); vitest
`serves predictive feels_like_c frames byte-identical to the bitmap for every point` (MrfClient-workerpad, incl.
no-data-rand en 0/254-extremen); golden frame Rust = TS. Puntfout 0, isolijnverschuiving 0.

**Bytes live (run 10Z, dezelfde cellen als bitmap-tweeling):** l1-24 365.977 → 229.579, l25-48 407.517 → 256.232,
hist4 55.176 → 35.353 B. Volledig 828.670 → 521.164 B (62,9 %, −308 kB); passief (l1-24 + hist) 421.153 → 264.932
(−156 kB). T.o.v. U18-branch (bitmap + DCT, +90 kB passief / +203 kB volledig): −246 kB passief, −511 kB volledig.
**Bytes e2e (synth):** passief 737.527 B (main 762.274, U18 781.936); warm 0 B; scrub 16 requests / 106 frames
(U18 18); sessie 1.951.119 B; tweede klik 0 requests.
**Tijd:** encode 1,4 ms/frame incl. zstd-19 (Rust release). Decode Chromium (`web/tmp/u18b-split.mjs`, live l1-24):
desktop zstd <0,1 + pred 2,1 ms; CPU 4× 0,1 + 8,7 ms. Zonder content-size was zstd 6,1 / 28,2 ms. Ter vergelijking
de bitmap van vandaag (U18-meting): 7,1 / 30,3 ms. Node: pred 1,9 ms.
**Shots** (`web/tmp/shots/u18b-{z6,z9}-{pred,bitmap}.png`, live 10Z, 13:05, isolijnen gepind, 1280×800; zelfde
build, twee dataservers): tabellen tekst-identiek; pixelverschil 2,0 % (z6) / 1,4 % (z9), het diffmasker
(`u18b-z9-diff.png`) laat alleen windparticles (stochastisch) en de geanimeerde tijdindicator zien. Isolijnen,
isolijnlabels en stadslabels pixel-identiek. U18's DCT-shots (kustlijnen tot ~10–15 km verschoven) liggen in
de U18-worktree `web/tmp/shots/`.

## Bevindingen voor orchestrator/PO
1. **PO-vraag beantwoord**: één veld voor kaart én tabel, fout 0 (niet ≤ 0,3 °C maar exact), kustlijnen op hun
   plek, `feels_like_c`-bitmap en `feels_like_dct` allebei weg. Prijs: 62 % van de bitmapbytes, niet de 24 % van de
   DCT. Onder ~60 % kom je alleen met hulpvelden (formule-residu, 43 %) of verlies (bijna-verliesvrij ±0,3 °C,
   39–45 %). Dat zijn allebei PO-keuzes, niet gebouwd.
2. **Grotere winst ligt in de andere uurvelden** (zelfde codec, alleen `PREDICTIVE_FIELDS` uitbreiden; gemeten op
   live 10Z met pred_measure): `temp_c` 62,7 %, `wind_u_ms` 60,4 %, `wind_v_ms` 63,6 %, `rel_humidity` 68,5 %,
   `radiation` 62,3 %, `cloud_frac` 89,5 %. Samen per volledige live sessie ~−1,1 MB. **Niet voor regen**: de
   HARMONIE-regenchunk wordt 167 %, want ijle velden winnen met zstd-runs en deze codec heeft geen run-modus. Voorstel
   vervolgtrack: `PREDICTIVE_FIELDS` → temp/wind/RV/straling + e2e-budgetten bijstellen. Klein werk; het vraagt wel
   een contractbesluit, omdat oude clients die velden dan niet meer lezen.
3. **Bitmap-members met content-size**: −6 ms/frame decode (desktop; ~−25 ms bij 4×) tegen +1 % bytes. Beslissing
   voor de orchestrator. Vervalt grotendeels als punt 2 doorgaat.
4. Chunk-URL-hash dekt metadata, geen encoderbytes: live1 (zonder) en live2 (met content-size) hebben dezelfde URL
   met andere bytes. Onschuldig, want pred is nooit gedeployed. Bij een toekomstige encoderwijziging op een
   gedeployed veld: `CHUNK_FORMAT_GENERATION` ophogen.
5. Branch staat op U18 + main van 1728445; main is sindsdien verder (U17/U19). Niet opnieuw gemerged; PR #48 is
   gestapeld op #46 (U18). Merge-advies: U18b in plaats van U18 (U18b draait U18's DCT terug).
