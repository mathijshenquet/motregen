# U31 — gebruiksbaken (client, MIP-13) — worker LOG (claude opus 5.5)

## 2026-09-25 — start
- Spec, MIP-13, App.tsx, manifest-refresh.ts, About.tsx, Freshness.tsx, HistogramScrubber, ForecastTable gelezen.
- Ontwerp: `core/usage.ts` framework-vrij: `UsageSession` (booleans + enums), `mark()`, `sessionBody()`,
  `installUsageBeacon()` (visibilitychange→hidden én pagehide als vangnet, eenmalig), `sessionManifestUrl()`
  (alleen eerste manifest `?s=1`). Beacon als string (text/plain → geen CORS-preflight/Blob-type-gedoe).
- Interpretaties: "pin gesleept" — er bestaat geen sleepbare pin; de pin verplaatsen gebeurt door op de kaart
  te tikken → veld `pinMoved` = locatie via kaarttik gekozen. "hover" = Gevoel-kolomkop met muis (bron 'table').
  `range` = null als bereikknop nooit gebruikt, anders laatste keuze; `theme` = huidige themakeuze bij verzenden.
