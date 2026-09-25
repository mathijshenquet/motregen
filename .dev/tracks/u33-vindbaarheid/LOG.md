# U33 vindbaarheid — worker LOG (append-only)

## 2026-09-25 10:25 — start
- Spec gelezen; branch track/u33-vindbaarheid @ 478f2fe. Plan: voormeting Lighthouse SEO op
  huidige build, dan index.html-metadata + noscript, robots.txt, og-image (screenshot via
  Playwright), Caddy X-Robots-Tag op /data/* en /stats/* (site-niveau header, dekt ook
  de 404-handle), docs/deploy.md Search Console-TXT, gerichte e2e, gates.

## 2026-09-25 10:35 — implementatie + gates
- Omgeving: worktree had geen node_modules en een geblokkeerde .envrc → `direnv allow`, `pnpm install
  --frozen-lockfile`, `pnpm synthgen` (mrf.test.ts leest public/data; zonder synthgen faalt die suite
  met ENOENT — omgevingszaak, geen regressie). Alle gates via `direnv exec ..` (Chromium uit devenv).
- index.html: titel, description (één zin), canonical, OG + Twitter (summary_large_image), theme-color
  licht #eaf1f3 / donker #07131a (= body-achtergronden in styles.css), noscript-alinea (radar/nowcast/
  HARMONIE-AROME, KNMI). robots.txt: Allow /, Disallow /data/ en /stats/, geen sitemap.
- og-image.png: `pnpm tsx scripts/og-image.ts` (screenshot van https://motregen.nl/ op 1200×630, paneel/
  zoekbalk/klok verborgen, merkkaart met druppel linksboven op de Noordzee, attributie blijft zichtbaar).
  Vandaag geen regen in beeld, wel windsporen en pin. Opnieuw maken = script opnieuw draaien.
- Caddy: site-niveau `@noindex path /data/* /stats/*` + `header @noindex X-Robots-Tag "noindex"` —
  header-directive staat vóór handle in Caddy's volgorde, dus ook de `respond 404` onder /data/* en een
  toekomstige /stats/-handle krijgen hem. NixOS-test: manifest, /data/missing (404) en /stats/ hebben de
  header, / niet; robots.txt wordt geserveerd.
- docs/deploy.md: sectie "Google Search Console" (Domein-property, TXT `@` in Cloudflare, dig-check).
- Lighthouse 12.8.2 SEO, headless Chromium (devenv), `pnpm preview` van dist:
  voor (478f2fe) 0.83 — faalt: meta-description, robots-txt (SPA-fallback gaf index.html);
  na 1.00 — geen falende audits.
- Receipts (synchroon, exitstatus gelezen):
  TYPECHECK-EXIT: 0 · TEST-EXIT: 0 (42 files, 246 tests) · BUILD-EXIT: 0 ·
  E2E-EXIT: 0 (`pnpm e2e e2e/seo.spec.ts`, load 13.6: 2 passed, 4 skipped = niet-desktop profielen)
- Repro: `cd web && pnpm synthgen && pnpm typecheck && pnpm test && pnpm build && pnpm e2e e2e/seo.spec.ts`;
  `nix flake check -L` in de root.
- Commit aa19323, draft-PR https://github.com/mathijshenquet/motregen/pull/58. nix flake check loopt.

## 2026-09-25 10:50 — slot
- FLAKE-EXIT: 0 (`nix flake check -L` op aa19323; VM-test `motregen-deployment` echt gedraaid, 110 s,
  X-Robots-Tag-asserties zichtbaar in de testoutput; ingest-cargotests ok).
- Alle receipts: TYPECHECK 0 · TEST 0 (246) · BUILD 0 · E2E 0 (seo.spec.ts 2/2) · FLAKE 0 · Lighthouse SEO 0.83 → 1.00.
- Open voor de PO: TXT-waarde uit Search Console in Cloudflare plakken (stappen in docs/deploy.md);
  og-image eventueel opnieuw maken op een regenachtige dag (`pnpm tsx scripts/og-image.ts`).
- Niet gedaan: volledige e2e-suite (orkestrator-taak per conventie). `web/.mcp.json` (untracked, niet van
  deze track) buiten de commit gelaten.
