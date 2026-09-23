# Track U11 — Lucide-iconen — LOG

## 2026-09-23T17:00 — Start, vóór-meting
- Worker: Claude Opus 5.5 in herdr-pane. Spec: `.dev/specs/track-u11-lucide-icons.md`.
- Screenshotscript `shots.mjs` (deze map): desktop 1440×900 + Pixel 5, licht + donker, twee opgeslagen plaatsen (ster-markers + lijst), per variant `page`/`search`/`about`. Repro vanuit `web/`: `direnv exec .. node ../.dev/tracks/u11-lucide-icons/shots.mjs <url> <prefix>`.
- Vóór: tegen de integratie-instantie `http://100.108.127.86:4300/` (ageq-mthq resolvet naar IPv6, vite luistert op het tailnet-v4-adres) → exit 0, `shots/before-*`. Opvallend: `⌕` (zoeken) en `⌖` (mijn locatie) renderen in headless Chromium als tofu-blokjes — de glyphs zitten niet in elk systeemfont.
- Gates draaien buiten de Claude-sandbox (direnv/nix mag daarbinnen geen Unix-socket openen).
- Bundel vóór (`pnpm build`, exit 0): `index-*.js 1,198.41 kB │ gzip 332.22 kB`, css `108.60 kB │ gzip 18.30 kB`.

## 2026-09-23T17:15 — Iconen vervangen
- `pnpm add lucide-solid` → 1.47.0 (exit 0). **pnpm-lock wijzigt → `nix flake check` nodig bij merge (orchestrator).**
- `web/src/components/icons.ts`: één registry met per-icoon deep imports (`lucide-solid/icons/<naam>`), geen barrel: met de `solid`-exportconditie zou de barrel in de dev-server alle ~1700 icon-modules laden. Prod tree-shaket beide; deep imports zijn ook named-import-bruikbaar via `./icons`. Plus het maatsysteem: `BUTTON_ICON` (18 px, stroke 2) en `INLINE_ICON` (16 px, stroke 1,75).
- Vervangen: zoeken `Search`; thema `Sun`/`SunMoon`/`Moon` (SunMoon voor "systeem": leest als "automatisch licht/donker" en is apparaat-neutraal, Monitor zegt "desktop" op een telefoon); "Mijn locatie" `LocateFixed`; opslaan `Star` (outline); opgeslagen plaatsen in de lijst `Star` gevuld; verwijderen/sluiten `X`; about `Info`; play/pauze `Play`/`Pause` (gevuld, 16 px — alleen de glyph-regel + import in HistogramScrubber); UV-chip `Sun` (Lucide gekozen, niet de tekstglyph); kaart-★-markers: Lucide `Star` als SVG (één template in de component-root, `cloneNode` per marker — geen Solid-owner-lekken vanuit event handlers), wit omlijnd via CSS `stroke` + `paint-order`.
- Interpretatie "gevuld bij opgeslagen": de opslaanknop bestaat alleen voor níet-opgeslagen plaatsen (bestaand gedrag, niet veranderd), dus die is outline; gevuld = opgeslagen plaatsen in lijst en op de kaart.
- NIET vervangen (bewust): `WeatherIcon.tsx`, zon-glyph in de tabel, droplet-logo, de kaart-zonsymbool-laag (`text-field: '☀'`, maplibre-symbool, weer-inhoud), maplibre-zoomknoppen, tekstknoppen in PerfHud. Tijdsbereik (`Clock`) overgeslagen: dat zit in HistogramScrubber buiten de glyph-regel en U9 werkt daar parallel. Verversknop (`RefreshCw`): `Freshness.tsx` staat nog niet op main — volgt na merge van U10.
- `aria-hidden="true"` zet lucide zelf wanneer het icoon geen aria-/title-props krijgt; bestaande `aria-label`s op de knoppen ongewijzigd. Nieuwe unit-test in `LocationSearch.test.tsx` controleert iconset, aria-hidden en 18 px in knoppen.
- Tailwind-preflight zet `svg { display: block }` → inline iconen in de zoeklijst kregen een eigen regel; gefixt met `display: inline-block` (zie `after-*-search.png`).
- Aanraakdoelen ≥ 44 px onder `@media (pointer: coarse)`: `.round-action` 44 hoog/breed, mobiel themaknop 42→44 px, `.about-close`/`.remove-saved` 44 px, `.save-place` en `.about-button` via een onzichtbare `::after`-rand (uiterlijk ongewijzigd).
- Gates: `pnpm typecheck` exit 0; `pnpm test` exit 0 (31 files, 161 tests); `pnpm build` exit 0.
- Bundel na: `index-*.js 1,213.15 kB │ gzip 337.86 kB` (+14,7 kB raw, +5,6 kB gzip); css `108.68 kB │ gzip 18.27 kB`. Sourcemap-analyse: de iconen zelf zijn ~0,6 kB elk; de rest is lucide's generieke `Icon` die `Dynamic` + props-`spread` uit `solid-js/web` activeert (runtime die de app nog niet laadde). Inherent aan lucide-solid.
- Na-shots: lokale `pnpm preview --port 4306` met `MOTREGEN_DATA_ORIGIN=http://100.108.127.86:4300/data` (zelfde data als vóór) → exit 0, `shots/after-*`.
