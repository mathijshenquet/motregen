# U54 laadchoreografie — LOG (append-only)

## 2026-10-07 19:05 — stap 0/1: meetpunten en referentie-rig gebouwd, nog geen geldige meting

Doel: `ttfp` (main) en `ttfp-ref` (Buienradar) meten vóór er iets verandert; daarna profiel
`po-android` en de autonome lus (spec-aanvulling 18:50).

Gebouwd (geen waarneembare verandering in de app, alleen meten):
- `web/src/core/perf.ts`: `firstRainMs`, `basemapReadyMs`, `ttfrMs` (= beide binnen), `ttfhMs`
  (= `window-ready:rain_rate`), `ttfpMs` (eerste wissel van het linker regenframe tijdens
  afspelen), `blankVisibleMs`; elk als `milestone:*`/`blank-visible` in de trace en in de HUD.
- `web/src/core/screen-truth.ts` + unit: slot = geladen / fog / leeg. Main tekent geen fog, dus
  elk zichtbaar regenslot zonder waarde telt als leeg. Alleen scrubber-regenslots; tabelrijen
  volgen na U58.
- `web/src/App.tsx`: drie haakjes (render → basemap klaar, rain-commit met frame + playing,
  effect voor lege slots). Bewust klein gehouden wegens U58.
- Rig: scenario `koud-spelend` (geen `?t`, dus de app speelt vanzelf — `koud` staat stil door
  de preset en kan geen ttfp meten); rapport met ttfp/ttfr/ttfh/blank-visible/LoAF eerste 12 s.
- `pnpm perf:mobile --scenario referentie-buienradar --repeat 3`: eigen Playwright-config
  (`playwright.reference.config.ts`), echte netwerk, zelfde Pixel 5-emulatie en CDP-profiel.
  Detectie: wissel van `img.leaflet-image-layer` (radar-png's, 1 beeld/s) + tijdlabel als
  tweede getuige; toestemmingsmuur wordt direct weggeklikt (gunstig voor Buienradar).
- `web/scripts/rig-host.ts`: loadavg-drempel 8 (wachten vóór de run, loadavg per run in het
  rapport, drukke runs buiten de mediaan) en een eigen vast poortpaar per worktree
  (4400–4899 / 8400–8899) i.p.v. de gedeelde 4392/8392.

Let op, semantiek: `ttfrMs` wacht nu ook op de basemap-tiles (MIP-19 §Meetkant). In de rig
kwamen de tiles vóór de regen, dus daar verandert het getal niet; `perf.spec`-budgetten nog
niet opnieuw bekeken.

Voorlopige getallen — NIET geldig als meting (host op loadavg 13–18, drie tracks draaiden rigs):
- Buienradar mobile-4g, koud ×3: ttfp-ref 3653 / 3495 / 3501 ms, eerste radarbeeld ≈ 2,5 s.
  De radar loopt al terwijl de toestemmingsmuur er nog staat.
- motregen main mobile-4g `koud-spelend`: run 1 time-out (poortbotsing/load), run 2 ttfp 2900 ms,
  run 3 ttfp 4514 ms met onvolledige responses. Spreiding te groot om iets te concluderen.
- PO-opname 16:27:59 (Android Chrome, koud): decode p50 22 ms (221 decodes, 5,5 s),
  basemap-tile p50 721 ms, 22 lange frames / 4,26 s in de eerste 12 s, `window-ready:rain_rate`
  4026 ms.

Receipts: `pnpm typecheck` exit 0; `pnpm test` exit 0 (69 bestanden, 456 tests; buiten de
sandbox, na `pnpm synthgen`).

Volgende stap: meten op een rustige host (loadavg ≤ 8) ×3, mediaan; dan `po-android`.
