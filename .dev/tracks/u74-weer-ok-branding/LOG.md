# U74 — branding "weer ok?" + beide domeinen (LOG, append-only)

## 2026-10-09 22:30 — start, inventaris
Spec: `.dev/specs/track-u74-weer-ok-branding-live.md`, MIP-28. PO-aanvulling 22:25 via orkestrator: **bot/ blijft
ongemoeid** (starttekst, bijschriften, knoppen houden motregen-branding); alleen de zichtbare naam in de web-app
plus `domains` in nix. Geen tagline-wijziging.

Inventaris (`grep -rnI motregen web bot nix`), zichtbare naam → "weer ok?":
- `web/index.html`: `<title>`, `apple-mobile-web-app-title`, `og:site_name`, `og:title`, `twitter:title`,
  `og:image:alt`, `<noscript>`-alinea.
- `web/src/core/page-meta.ts`: `defaultTitle`, paginatitels "Wind Utrecht — …".
- `web/scripts/page-routes.ts`: Caddy-template voor de padpagina-titel en de noscript-vervanging.
- `web/vite.config.ts`: PWA-manifest `name`/`short_name`.
- `web/src/App.tsx`: splash-woordmerk, `navigator.share`-titel.
- `web/src/components/AboutDialog.tsx`: kop; `About.tsx`: aria-label/title van de merkknop.
- `web/public/og-image.png` + `web/scripts/og-image.ts`: er staat tekst in de kaart → opnieuw genereren.
- `droplet.svg` en de PWA-iconen: geen tekst → ongewijzigd.

Bewust NIET gewijzigd:
- canonical, `og:url`, `og:image`-URL, sitemap, robots, `shareUrl` (presets.ts): blijven `https://motregen.nl`.
- interne identifiers: localStorage-sleutels `motregen-*`, laag-/bron-id's, `window.__motregen*`, cachenamen,
  pluginnamen, basemap-stijlnaam, `REPOSITORY_URL`, perf-marks.
- `bot/` volledig (PO 22:25). nix-`description`-velden van systemd-units (niet gebruikerszichtbaar).

Functioneel meegenomen voor "beide domeinen serveren": de service-worker-allowlist in `App.tsx` kende alleen
motregen.nl; weerok.nl zou anders zijn SW steeds deregistreren (geen PWA/offline op het tweede domein).
