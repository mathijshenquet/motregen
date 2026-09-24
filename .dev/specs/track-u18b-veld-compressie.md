# Track U18b — compact gevoelstemperatuurveld met verwaarloosbare fout (claude opus)

Read first: `AGENTS.md`, `.dev/specs/track-u18-dct-veld.md` en `.dev/tracks/
u18-dct-veld/LOG.md` (K-meting, gebouwde DCT-pijplijn `mrf::dct`/`web/src/
core/dct.ts`, bevindingen: DCT K=64 rms 0,09 °C maar puntfout tot 3,2 °C in
kuststeden en lijnen tot ~10 km verschoven aan de kust; DCT spaart pas bytes
als ook de tabel het veld gebruikt), `docs/mrf.md`, `docs/fields.md`,
`crates/mrf/src/`, `web/src/core/mrf.ts`, `web/scripts/synthgen.ts`.
Your LOG: `.dev/tracks/u18b-veld-compressie/LOG.md` — committed, append-
only, timestamped. Branch `track/u18b-veld-compressie` vanaf
`track/u18-dct-veld` (bouwt op U18's code; main is erin gemerged). Eigen
worktree.

## PO (2026-09-24)

"Kunnen we een andere representatie vinden met kleinere fout? Overal
gebruiken (kaart én tabel) lijkt me ideaal, maar 3–4 °C afwijking is echt
veel." Doel: één compact veld voor kaart en tabel, puntfout ≤ de
kwantisatiestap (0,3 °C), lijnen aan de kust op hun plek, en `feels_like_c`
als bitmap dan niet meer nodig.

## Opdracht

1. **Meting eerst, offline op ≥ 3 live runs** (hergebruik U18's scripts), per
   variant: bytes/frame na zstd-19, puntfout (rms/max t.o.v. de bitmap ná
   kwantisatie), isolijnverschuiving aan de kust (Walcheren-z9-set van U18),
   encode-tijd ingest, decode-tijd client (desktop + 4× CPU):
   - (R) **DCT K + gekwantiseerd residu**: residu = veld − IDCT, op de
     tabelstap gekwantiseerd (int8, 255 = no-data), zstd; K ∈ {16, 32, 64}.
     Exact op tabelniveau per constructie.
   - (P) **lossless predictief**: 2D-voorspelling per cel (Paeth / gemiddelde
     van links+boven / LOCO-I-MED), residu van de gekwantiseerde indices,
     zstd; plus variant met temporele voorspelling t.o.v. het vorige
     uurframe (let op: elk frame moet zelfstandig decodeerbaar blijven, of
     per dagdeel-chunk als keten met random access per frame — motiveer).
   - (W) **wavelet** (CDF 5/3 integer, verliesvrij, of 9/7 met kwantisatie)
     alleen als R en P het doel niet halen.
   Referentie: huidige bitmap (~15,5 kB/frame) en U18's DCT K=64 (3,8 kB).
2. **Bouw de winnaar** in `mrf` (Rust, eigen implementatie, geen nieuwe
   dependency als het kan; header-sleutel naast `dct`), ingest publiceert
   het als vervanging van `feels_like_c` **én** `feels_like_dct` (één veld
   voor alles; tijdelijk beide publiceren tot de client is omgezet is ook
   goed — kies, motiveer), client-decoder in de zstd-worker levert een
   bitmapframe voor kaart én tabel (`readForecastPointSeries` ongewijzigd
   in gedrag). Synthgen mee. Feature-detectie zoals U18.
3. **Bewijs de winst end-to-end**: passief en volledig laden in e2e (synth)
   en live-projectie; warm 0 B; puntreeksen in de tabel byte-identiek aan de
   bitmap (test); screenshots z6/z9 Zeeland bitmap vs nieuw.
4. Bijvangst U18 (optioneel, apart commit): zstd pledged content-size in de
   ingest zodat fzstd geen 8 MB-venster per frame alloceert (decode 7,6 →
   1,0 ms); alleen als de lengtecontrole behouden blijft.

## Gates

Rust: `cargo fmt --check`, `cargo clippy --workspace -- -D warnings`, `cargo
test --workspace`; Cargo.lock ongewijzigd (anders `nix flake check -L`). Web:
`pnpm typecheck`, `pnpm test`, `pnpm build`, `MOTREGEN_E2E_PORT=4354
MOTREGEN_E2E_DATA_PORT=8354 pnpm e2e` (hostlock, load < 16, één Chromium,
poorten vooraf vrij checken) green. Live daemon `--once` + `spec/
validate_manifest.py`. Synchrone exit statussen in LOG. Previews: eerst
`pnpm build` of eigen `--outDir`. Draft-PR vroeg. Geen codex.
