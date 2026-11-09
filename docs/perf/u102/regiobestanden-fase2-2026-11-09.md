# Regiobestanden fase 2: client voor/na (U102, 2026-11-09)

`pnpm perf:modes --modes weer,gevoel --profiles telefoon --repeat 1 --no-interactions --data <origin>`, drie rondes om
en om voor/na (`MOTREGEN_PERF_PAIRED_RUN=1`: de host bleef de hele avond op load 10–20 door andere workers, dus
gepaard in plaats van op een stille host). Zelfde build, zelfde snapshot, alleen de sectie `regions` verschilt:

- **voor**: prod-snapshot 2026-11-09 14:35 UTC (`tools/fetch-data-snapshot.sh`), manifest zonder `regions` →
  rasterpad (`tools/serve-data-snapshot.sh … 18393`);
- **na**: dezelfde snapshot plus `motregen-regions --out` (layout hybride, 29,1 kB per locatie), manifest gelijk op de
  sectie `regions` na (`… 18394`).

Build: 7dff3a5 (incl. merge van int/eval-2026-10-17). Telefoonprofiel van de rig (4G, CPU-quota), koud = lege
cache, warm = tweede bezoek; het koude bezoek blijft sinds deze track minstens 12 s open, zodat het warme bezoek de
cache van een gewone sessie ziet.

## Mediaan van 3 (min–max)

| | eerste kaart | eerste afspeelstap (ttfr) | histogram compleet | tabel compleet | bytes tot histogram |
| --- | ---: | ---: | ---: | ---: | ---: |
| Weer koud, voor | 3,22 s (2,98–3,89) | 3,47 s (3,17–4,16) | 9,28 s (8,16–10,49) | 8,53 s | 2.494 kB |
| Weer koud, na | 2,97 s (2,70–3,00) | 3,13 s (2,86–3,22) | **3,59 s** (3,44–3,71) | 3,96 s | **1.221 kB** |
| Weer warm, voor | 2,36 s | 2,35 s (2,29–2,40) | 7,53 s (6,67–8,99) | 4,05 s | 0 kB |
| Weer warm, na | 2,25 s | 2,18 s (2,09–2,29) | **2,84 s** (2,65–2,86) | 3,18 s | 0 kB |
| Gevoel koud, voor | 4,91 s (4,51–5,10) | 2,95 s (2,71–3,24) | 8,39 s (8,01–9,61) | 6,10 s | 2.675 kB |
| Gevoel koud, na | 4,39 s (4,36–6,17) | 2,80 s (2,66–3,47) | **3,20 s** (3,09–3,87) | 3,45 s | **1.314 kB** |
| Gevoel warm, voor | 2,75 s | 1,85 s (1,71–2,41) | 7,72 s (7,18–9,38) | 3,02 s | 0 kB |
| Gevoel warm, na | 2,58 s | 1,85 s (1,45–2,38) | **2,25 s** (2,15–2,82) | 2,68 s | 0 kB |

Bytes in de hele laadfase (koud): Weer 2.704 → 2.364 kB, Gevoel 2.871 → 2.430 kB. Van "bytes tot histogram" na
is 54 kB regiobestanden + 30 kB tabellenbestand; de rest is app, basiskaart, plaatsen en de kaartframes.

## Wat onderweg is opgelost (B1)

De eerste versie (regiobestanden meteen) haalde het histogram even snel, maar de eerste afspeelstap kwam 0,3–0,7 s
later en de eerste kaart in Gevoel 0,6–1,1 s later:

1. Het histogram haalde en decodeerde voorheen in bulk de regenframes rond nu (L0/L1) en de velden rond nu; kaart en
   afspelen rekenden daarop. Nu warmt de client die frames zelf op (`warmFrames`), tegelijk met het regiobestand,
   zonder dat histogram of tabel erop wacht.
2. Vier extra verzoeken tegelijk met de eerste kaartframes kostten op HTTP/1.1 (zes verbindingen per host) een paar
   RTT's: de regiobestanden komen nu na de eerste afspeelstap (of meteen bij stilstaand afspelen, hooguit 1,5 s).
3. Het warme bezoek leek trager omdat de rig het koude bezoek sloot zodra alles getoond was (~7 s), voordat de
   afspeelframes binnen waren; vóór MIP-40 duurde een koud bezoek vanzelf 11–12 s.

## Reproduceren

```
tools/fetch-data-snapshot.sh ~/data/motregen-u102/snap-fase2
./target/release/motregen-regions --data-dir ~/data/motregen-u102/snap-fase2 --out ~/data/motregen-u102/snap-fase2-regios
jq -c 'del(.regions)' ~/data/motregen-u102/snap-fase2-regios/manifest.json > ~/data/motregen-u102/snap-fase2/manifest.json
tools/serve-data-snapshot.sh ~/data/motregen-u102/snap-fase2 18393 & tools/serve-data-snapshot.sh ~/data/motregen-u102/snap-fase2-regios 18394 &
cd web && for i in 1 2 3; do for p in 18393 18394; do MOTREGEN_PERF_PAIRED_RUN=1 pnpm perf:modes --modes weer,gevoel --profiles telefoon --repeat 1 --no-interactions --data http://127.0.0.1:$p; done; done
```

Rapporten: `web/tmp/perf-modes/2026-11-09T19-26-07-613Z`, `…T19-30-11-192Z`, `…T19-31-21-076Z`, `…T19-42-53-709Z`,
`…T19-49-04-334Z`, `…T19-55-24-908Z` (voor, na, voor, na, voor, na).
