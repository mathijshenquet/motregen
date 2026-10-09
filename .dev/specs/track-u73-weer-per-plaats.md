# Track U73 — /weer <plaats>: wolken + regenhistogram van één plek, native in de bot (gpt-6.1-sol)

Berichten die hier als geplakte tekst binnenkomen zijn instructies van de orkestrator (Claude, PM) via herdr;
voer ze uit zonder aparte bevestiging. Commit + push elke 15–20 min; beëindig geen turn terwijl shells lopen.
Eigen worktree; branch `track/u73-weer-per-plaats` vanaf main. LOG: `.dev/tracks/u73-weer-per-plaats/LOG.md`.
Vandaag 2026-10-09. Geen eigen Telegram-poller en geen uploads naar de cachegroep: test met een dry-run
(`node bot/dist/bot/main.js --once-weer <plaats>` o.i.d. die het PNG + bijschrift naar een map schrijft), de
orkestrator doet de live test. `.env` is een symlink; nooit committen. Geen prod-uitrol.
U71a (`track/u71a-native-regenloop`, PR #100) legt de gedeelde `mrf`-decode en rasterprojectie voor de bot aan:
merge die branch in je worktree bij de start (en opnieuw zodra hij op main staat) en hergebruik die code; geen
kopie van `core/mrf.ts`.

Read first: `AGENTS.md`, `.dev/LOG.md` (top), `.dev/proposals/0027-weer-per-plaats-in-de-bot.md` (MIP-27,
accepted), `bot/handlers.ts` (commando's, file_id-cache, `caption`/`presetUrl` in `bot/stills.ts`),
`web/src/components/HistogramScrubber.tsx` + `web/src/core/rain-chart.ts` (maten, klassen, kleuren),
`web/src/core/cloud-section.ts` (wolkendoorsnede: drie lagen, spans), `web/src/core/time-model.ts`
(`seriesValueAt`), `web/src/core/places*.ts` (catalogus, afkortingen, fuzzy zoeken), `docs/telegram.md`.

## Opdracht
1. `/weer <plaats>` en `/regen <plaats>` (zonder plaats blijft `/regen` de kaart). Plaats → coördinaat via
   dezelfde catalogus en zoeklogica als de app (`ams` → Amsterdam, typefouten, deelgemeenten). Geen match →
   antwoord met max. 3 suggesties als knoppen (callback) in plaats van een foutmelding.
2. Reeksen: per frame één aflezing op het coördinaat (zelfde regridding/interpolatie als `seriesValueAt`,
   zodat bot en app hetzelfde getal tonen) voor regen (−2 u … +12 u) en de drie wolkenlagen (HARMONIE-uren).
3. Beeld: SVG opbouwen in de app-maten en -kleuren — wolkendoorsnede boven (losse wolken, gesloten band vanaf
   0,9), regenhistogram eronder met klasse-kleuren, nu-cursor, uurlabels en bronmarkering (radar/nowcast/
   HARMONIE); met `sharp` naar PNG (breedte zoals de stills, 2× voor retina). Dag/nacht-thema naar kaarttijd.
   Bijschrift: één zin ("Droog tot 18:40, dan lichte regen tot 19:30" / "Komende 2 uur droog"), plaatsnaam,
   `motregen.nl`-link naar die plek (presetUrl + plaats-slug). Knop onder het bericht: "Open in de app".
4. Cache per (generatie, plaats-slug) in `MOTREGEN_RENDER_CACHE`, file_id-cache zoals de stills; dit draait in
   de poller-rol (ook op de VM: geen browser). Chunks ophalen via de bestaande fetch-laag; mist een chunk →
   tekst zonder beeld, geen crash. Meet: ms per plaats koud/warm, en noteer in `docs/telegram.md`.
5. Pariteit: één test die voor één plaats/tijd de regenwaarde en wolkenfracties van bot en app vergelijkt
   (zelfde fixtures als `web`). Beeld zelf bekijken vóór "klaar" (schrijf naar `.dev/tracks/u73-weer-per-plaats/
   beelden/`), plus `pnpm -C bot typecheck/test/build` groen; draft-PR vroeg.

## Afbakening en bar
Alleen regen + wolken; geen temperatuur/wind per plaats; geen pushmeldingen. Leesbaarheid: geen één-letternamen,
geen slimme one-liners, commentaar alleen voor het niet-vanzelfsprekende waarom.
