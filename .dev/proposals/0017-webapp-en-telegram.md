# MIP-17 — Deelbare links, installeerbare webapp en Telegram (Mini App + inline-bot)

Status: accepted (PO 2026-10-07: "het lijkt me top om een miniapp te hebben naast de inline
modus"; "ga maar aan de slag"; bot-token staat in `.env` als `TG_BOT_KEY`)

## Het probleem

1. Motregen is nu een tabblad; op Android en macOS voelt het niet als een app (geen icoon,
   geen standalone-venster, geen snelle warme start).
2. De vriendengroep van de PO deelt nu Buienradar-stills via een eigen Telegram-bot
   (plaatje + knoppenraster Regen/Wind/Pollen en tijdstappen). Ze willen hetzelfde, beter, uit
   motregen.
3. Maarten: "query parameters om de selectie te presetten" — er is nu geen enkele URL-staat.

## Eerder werk

- Geen PWA-manifest, geen service worker (`web/index.html` heeft alleen OG/theme-color).
- `?dev` is de enige URL-parameter (MIP-12); locatie en modus leven in `localStorage`.
- e2e draait Playwright/Chromium op de dev-host: dezelfde infra kan headless stills renderen.
- MIP-13: gebruiksbaken zonder identifiers; een bot ziet chat-id's — dat valt buiten dat
  contract en krijgt een eigen regel.
- Telegram: Mini Apps (`WebApp`-JS, `initData`, themaparameters, launch-knop in de bot),
  inline-modus (`@bot query` in elke chat, `answerInlineQuery` met foto's), callback-knoppen
  om een bericht in place te verversen (`editMessageMedia`).

## Aanbeveling

Gestapeld, elk stuk zelfstandig bruikbaar:

1. **URL-presets** (fundament): `?modus=weer|lucht|gevoel|wind`, `?t=<ISO>|+2u|-1u`,
   `?plaats=<naam>` of `?lat=..&lon=..`. Presets winnen van `localStorage`, worden niet
   teruggeschreven (een gedeelde link verandert niemands favoriet), en de knop "Deel" (About
   of klok) maakt de huidige staat tot zo'n link.
2. **PWA**: `manifest.webmanifest` (naam, iconen uit de druppel, `display: standalone`,
   themakleur), service worker die alléén de app-shell cachet (nooit manifest/chunks/tiles)
   met "nieuwe versie"-melding. Installeerbaar op Android Chrome, macOS Safari 17+ (Dock) en
   Chrome-desktop. Geen stores; TWA/Capacitor pas als een store-vermelding ertoe doet.
3. **Telegram Mini App**: de PWA in Telegram's webview, met `initData`-check, themakleuren
   en de presets uit (1) als deep link (`startapp`-parameter). De bot heeft `/start` met een
   launch-knop.
4. **Inline-bot met stills** (het Hannebot-gevoel): `@motregenbot` in elke chat → foto met
   bijschrift "za 14:10 · Gevoelstemperatuur" en knoppenraster (modus × tijdstap) dat het
   bericht in place ververst, plus een knop "Open in motregen" (Mini App met presets).
   Rendering: headless Chromium op de box rendert de echte app in een vaste staat en
   screenshot; omdat de kaart nationaal is, één render per (modus, tijdstap) per
   ingest-verversing, vooraf en gecachet (verwachte kosten: ~1–2 s per still, tientallen
   per verversing). Pollen pas als de kolom bestaat (U38/MIP-14).

## Open vragen

1. Bot-hosting: op de prod-box als systemd-service naast de ingest (voorstel), of op
   ageq-mthq. Token via `secrets.env` zoals de ADS-sleutel.
2. Still-formaat: kaart + kleine tabel (zoals Hannebot) of alleen kaart met tijd + modus.
3. Privacy-regel voor de bot: alleen chat-id in het geheugen voor lopende berichten, niets op
   schijf (voorstel); About krijgt één regel.
4. Lokatie in stills: nationaal (geen locatie) — de Mini App is de weg naar "mijn plek".

## Besluit

PO 2026-10-07: Mini App naast de inline-modus; volgorde 1 → 2 → 3 → 4. Open vragen: de
track stelt defaults voor, de PO beoordeelt op de eerste werkende bot.

## Changelog

- 2026-10-07: aangemaakt en geaccepteerd (PO, chat).
