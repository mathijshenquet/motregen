# MIP-29 — Media renderen in de ingest; de Telegram-bot wordt een dunne poller

Status: draft · 2026-10-10 · auteur: orkestrator (PM) · aanleiding: PO-vragen na het vastlopen van de bot
("waarom moet Node het video maken coördineren? dat kan toch de ingestor doen?", "waarom niet gewoon Rust?")

## Probleem
De bot is een Node-proces dat (a) Telegram beantwoordt én (b) per generatie alle media maakt. Voor (b) gaat elk
frame door het Node-geheugen: chunks ophalen (over HTTP van de eigen origin), uitpakken, naar een Rust-worker,
terug, overlays erop, door naar ffmpeg. Gevolg op prod (2026-10-10): een lek van ~100 MB/uur aan ArrayBuffers,
de cgroup remde, en omdat renderen en antwoorden één proces zijn was de bot 7 uur doof.
Node is er om historische redenen: de bot begon met Playwright-screenshots van de web-app (MIP-21/25) en de
native renderer (MIP-26) is in dezelfde TypeScript gebouwd om `web/src/core` te hergebruiken (decode, palet,
isolijnen, tijdmodel, plaatszoeker). Een inhoudelijke reden om pixels door Node te sturen is er niet.

## Voorstel
1. **De ingest rendert.** Zodra een generatie klaar is heeft de ingest alle velden al gedecodeerd in geheugen.
   Daar de loops en stills maken (de rasterkern is al Rust: `bot/native-raster.rs`, `native-field-raster.rs`),
   rechtstreeks naar ffmpeg/JPEG op schijf, plus een `media.json` per generatie (bestanden, tijden, bijschriften).
2. **De bot raakt geen pixels aan.** Hij leest `media.json`, meldt de media één keer per generatie bij Telegram
   aan en beantwoordt commando's met de `file_id`'s. Aanmelden kan per URL (Telegram haalt het bestand zelf bij
   Caddy op; limiet 5 MB foto / 20 MB video — onze loops zijn ~2 MB), dus de bot hoeft de bestanden niet te openen.
3. **Bot in Rust** (fase 2, optioneel): long polling is HTTPS + JSON; handlers, register, `/weer` en plaatszoeker
   zijn ~1500 regels. Winst: één taal, één binary-familie, vast geheugen van enkele tientallen MB.

## Kosten en risico
- Port van de compositie die nu in TS zit (~2600 regels: klok/labels-overlay, isolijnen + labels, windstreepjes,
  isobaren, drukletters, `/weer`-grafiek). Pariteit met de app wordt dan niet meer door gedeelde code bewaakt maar
  door de bestaande pariteitsrig (U71a/b) — die moet in CI.
- Tekstatlassen komen nu uit Chromium (pixelgelijk aan de app). In Rust: eigen tekstrendering (font + hinting
  wijkt licht af) of de atlassen eenmalig bij de build maken. Dat is de grootste onzekerheid.
- De ingest wordt zwaarder; rendering moet de data-publicatie nooit ophouden (aparte taak/proces ná publicatie).

## Fasering
- F0 (loopt): noodverband OOM-kill + herstart; bot leest data van schijf; lek zoeken met duurtest (U75).
- F1: bot ontkoppelen van pixels zonder port: renderer als los kortlevend proces per generatie (start, rendert,
  eindigt) — een lek kan dan per definitie niet oplopen en de poller blijft klein. Klein werk, direct effect.
- F2: rendering naar de ingest (Rust), `media.json`, aanmelden per URL.
- F3: bot in Rust.

## Decision
(open — PO)
