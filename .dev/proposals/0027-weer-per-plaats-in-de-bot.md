# MIP-27 — /weer <plaats>: het histogram van één plek in de Telegram-bot, zonder browser

Status: accepted (PO 2026-10-09 16:00) · 2026-10-09 · auteur: orkestrator (PM) · PO-idee 2026-10-09 ("/weer ams|amsterdam die het
histogram laat zien… liefst niet met Playwright-onzin")

## Wat
Een botcommando `/weer <plaats>` (ook `/regen <plaats>`) dat de regenverwachting voor één plek toont zoals
het histogram in de app: de staafjes −2 u … +12 u (radar → nowcast → HARMONIE, met de bronovergangen), de
"nu"-cursor, klasse-kleuren uit `core/rain-chart.ts`, en als bijschrift een zin ("Droog tot 18:40, dan
lichte regen tot 19:30") plus een knop naar de app op die plek (`presetUrl` + plaats).

## Hoe (native, geen Playwright)
1. **Plaats** → coördinaat: dezelfde plaatsencatalogus als de app (`core/places*.ts`, incl. afkortingen en
   fuzzy zoeken), gedeeld via het pad dat U71a voor `core/mrf.ts` aanlegt. Geen match → suggesties (3).
2. **Reeks**: per frame één cel uit het gedecodeerde raster op dat coördinaat (U71a decodeert de rasters al
   native; dit is één `texelFetch` per frame, dus ~85 reads per generatie per plaats). Zelfde regridding/
   bilineaire aflezing als `seriesValueAt` in `core/time-model.ts` zodat bot en app hetzelfde getal tonen.
3. **Beeld**: het histogram als SVG opbouwen (staafjes, assen, cursor, bronmarkering; dezelfde maten en
   kleuren als `HistogramScrubber`) en met `sharp` (al een afhankelijkheid) naar PNG rasteren. Verwachte
   kosten: < 20 ms per plaats, geen Chromium. Cache per (generatie, plaats) in `MOTREGEN_RENDER_CACHE`.
4. **Rol**: dit kan de poller zelf (ook op de VM: geen browser, een paar ms), dus zonder register/renderer-
   omweg — alleen de frames moeten lokaal zijn (de poller haalt nu al de manifest; chunks erbij is ~2 MB per
   generatie). Fallback als een chunk mist: tekst zonder beeld.

## Wolken erbij (PO 2026-10-09: "met wolkjes en regen histogram ook?")
Ja: dezelfde wolkendoorsnede als boven de scrubber in de app (`core/cloud-section.ts`: drie lagen hoog/
midden/laag uit HARMONIE, losse wolken met lucht ertussen, gesloten band vanaf 0,9), plus het regenhistogram
eronder — één beeld, zoals het venster in de app. De wolkenreeksen zijn per plaats dezelfde `seriesValueAt`-
aflezing als de regen; de tekencode is puur (spans → rechthoeken) en gaat één-op-één naar SVG. Kosten blijven
in de orde van ms. Alleen voor de HARMONIE-uren (radar/nowcast hebben geen wolken): links blijft die band leeg,
net als in de app.

## Afbakening
Regen + wolken (temperatuur/wind per plaats later). Geen stills/kaartuitsnede per plaats (dat is de app). Geen
pushmeldingen (MIP-22). Pariteit: dezelfde cijfers als de app op dezelfde plek/tijd, getest met één plaats.

## Decision
PO 2026-10-09: "ja bouw maar". Track U73; start parallel aan U71a, bouwt op diens gedeelde decode (`track/u71a-native-regenloop`
mergen zodra die op main staat).
