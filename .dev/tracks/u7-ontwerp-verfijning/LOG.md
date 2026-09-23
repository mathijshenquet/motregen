# Track U7 — ontwerpverfijning (claude opus)

## 2026-09-23T15:30 — Start, vóór-screenshots

- Gelezen: AGENTS.md, spec, HistogramScrubber.tsx, App.tsx (splash, `.source`, temperatuurlaag), styles.css, core/temperature.ts, core/places.ts, core/basemap.ts, docs/perf.md, README.md. `pnpm install --frozen-lockfile` → exit 0.
- Screenshotscript: `shots.mjs` in deze map (Playwright, desktop 1440×900 + Pixel 5, nl-NL, Europe/Amsterdam). Repro vanuit `web/`: `direnv exec .. node ../.dev/tracks/u7-ontwerp-verfijning/shots.mjs <url> <prefix>`.
- `ageq-mthq` resolvet hier naar een IPv6-adres, maar de integratie-vite luistert alleen op 100.108.127.86:4300. Vóór-screenshots daarom tegen `http://100.108.127.86:4300/` → exit 0, `shots/before-*.png`.
- Waarnemingen vóór: (1) histogram: labels 7–9 px; x-as-labels staan ín de plot met 32 px lege strook eronder; de "Nu"-pil botst met de cursorpil; de dagchip "VANDAAG" plakt in de hoek. (2) `.source` ligt 2 px van de rand met 3 px radius, los van de kaarthoek. (5) Desktop: Groningen mist zijn temperatuur. Mobiel: alleen 6 labels in beeld.
