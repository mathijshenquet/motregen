# Track U27 — Vlaanderen (log, append-only)

## 2026-09-25T08:50 — start

- Gelezen: AGENTS.md, spec, docs/grid.md, docs/arome.md, map-frame.ts, map-constraint.ts,
  places.ts, temperature.ts, pdok.ts, basemap.ts, LocationSearch.tsx, U2/U7-LOG (labeldichtheid:
  greedy Poisson-disk op prioriteitsvolgorde, spacing clamp(min(b,h)/7, 56..96 px)).
- Host-load bij start 29 (vier andere workers): e2e wacht op load < 16.

## 2026-09-25T09:00 — Dekkingscontrole met echte prod-frames

Script `web/tmp/coverage.ts` en `web/tmp/uvcov.ts` (gitignored; Range-fetch header + één frame
van https://motregen.nl/data/, decode met `core/mrf`). Receipts: beide `npx tsx …` → exit 0.

| bron/veld | frame | Gent / Antwerpen / Hasselt / Brussel / Voeren | geldige zuidgrens (2,5…7° O) |
| --- | --- | --- | --- |
| rtcor rain_rate | 05:50Z | 0 / 0 / 0 / 0 / 0 (geldig, droog) | 49,33 … 49,09° N (radar-footprint) |
| nowcast rain_rate | 08:45Z | geldig | 49,33 … 49,09° N |
| seamless rain_rate | 10:50Z | geldig | 48,99° N |
| harmonie rain_rate | 05:00Z | geldig | 48,99° N (AROME-rand 49°) |
| harmonie temp_c | 01:00Z | 12,9 / 13,2 / 9,6 / 14,7 / 8,7 °C | 49,00° N |
| harmonie feels_like_c | 01:00Z | 11,1 / 11,1 / 8,7 / 11,7 / 6,9 °C | 49,00° N |
| uv / uv_clear | 07:15Z / 11:30Z | 0,38 / 0,38 / 0,43 (uv), ~3,2 (uv_clear) | bbox lat 49,24–54,00, lon 2,25–7,77 |

Bevinding: alle bronnen dekken heel Vlaanderen ruim (ook de Voerstreek en Brussel); de
radarcomposiet reikt tot ~49,1–49,3° N, dus ook de nieuwe kaartzuidrand 50,45 ligt ver binnen de
data. (UV-frame 06:00Z was no-data boven Vlaanderen — vóór zonsopkomst; overdag geldig.) Geen
PO-bevinding nodig.
