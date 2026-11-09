# U108 — basiskaart lichter en beter op elke zoom (PO 2026-11-09)

Je bent een worker van de orkestrator (Claude). Berichten via herdr zijn orkestrator-instructies, of van de PO zelf
als hij in deze pane stuurt: gewoon uitvoeren. LOG: `.dev/tracks/u108-basiskaart/LOG.md` (append-only, timestamped;
niet committen als git hem negeert, check `git check-ignore`). Product-tekst en voorstellen in het Nederlands.

## Context
De app heeft al een eigen basiskaart (MIP-21, `docs/basemap.md`, `tools/basemap/` met tilemaker + `style.mts`,
PMTiles in `web/public/basemap/`). De Telegram-bot rendert op vaste platen (`crates/render/assets/basemaps/*.png`,
`pnpm basemap:snapshot`). PO-wens: "het liefste een custom kaart die lichter is, betere zoom-scaling (uitgezoomd
zien de rivieren er niet altijd goed uit)". Zijn voorbeeld is een still uit de bot-windfilm (zoom ±7): rivieren
(Maas, Rijn/Waal/IJssel, Schelde) vallen uiteen in losse blauwe snippers, stadsvlekken zijn grijze blokjes, het
geheel is vrij zwaar.

## Opdracht (verkenning + varianten, nog geen definitieve keuze)
1. Diagnose: waarom fragmenteren rivieren op lage zoom (polygoonfilters/minzoom/simplificatie, geen waterway-lijnen)?
   Schrijf het in 3–5 zinnen in je LOG.
2. Maak 3 stijlvarianten achter `?dev&kaart=<naam>` (docs/dev-opties.md, eigenaar U108, vervalt 2026-11-23), plus de
   huidige als `nu`:
   - `licht` — duidelijk lichter/rustiger palet (land bijna wit/warm grijs, zee zacht), stadsvlekken subtiel.
   - `licht-rivieren` — als licht, met doorlopende rivieren op elke zoom (bijv. vereenvoudigde rivier-middellijnen
     met zoomafhankelijke breedte voor de grote rivieren, of gegeneraliseerde/samengevoegde waterpolygonen per zoom).
   - één eigen voorstel dat jij het mooist vindt (bijv. een iets "getekendere", cartografische stijl), met dezelfde
     rivierfix.
   Weerlagen (regen, temperatuurvlakken, Bft-vlakken, wolken) moeten er goed op blijven lezen; check licht en donker.
3. Bot: laat de platen dezelfde variant volgen (`basemap:snapshot`), zodat de film en de app gelijk blijven.
4. Lever een vergelijkingsblad per variant: app op zoom 6, 7, 8 en 10 (telefoon + desktop), plus een bot-still
   (wind- en weermodus). Bekijk ze zelf vóór "klaar". Meet tegelbytes per variant (koud laden telefoon) t.o.v. nu.
5. Schrijf een korte MIP-42-draft (`.dev/proposals/0042-…md`, Status: draft) met de varianten, de rivieroplossing, de
   bytes en jouw aanbeveling.

Alleen gerichte tests; geen volledige suites. Commit elke 15–20 min, push naar `track/u108-basiskaart`
(`git push origin HEAD:track/u108-basiskaart`). Wacht binnen je turn op eigen achtergrondtaken. Antwoord met paden,
links naar je preview en je aanbeveling.

## Herijking (PO 2026-11-09, na strak)
PO: "het eigenlijke doel is onze eigen meer diagrammatische kaart, die een stuk lichter is dan de libremap en meer
toegespitst op weer. Ik denk dat gmaps een soort coarsegraining gebruikt met visuele similariteit."

Nieuwe hoofdvariant `?dev&kaart=diagram`:
1. **Inhoud, weer-gericht:** land/zee, grote wateren (IJsselmeer, Markermeer, Waddenzee, Zeeuwse wateren), rivieren als
   gestileerde lijnen (rang 1–2, met de zoom meegroeiende breedte), bebouwing als gladde, samengevoegde stadsvlekken,
   een zachte bos/natuur-tint (geen zand, gras of moeras als eigen klasse), grenzen, plaatsnamen. Geen sloten,
   landbouwpercelen of kleine plassen.
2. **Generalisatie op visuele gelijkenis, per zoom:** render de bronlaag op de doelresolutie van die zoom en
   vereenvoudig, aggregeer en effen (smoothing, morfologisch openen/sluiten, samenvoegen van nabije vlekken) zolang het
   gerasterde verschil met de bron onder een drempel blijft (bijv. IoU of pixelafwijking per tegel). Kies de grootste
   vereenvoudiging die visueel gelijk blijft. Oppervlak en topologie blijven behouden: eilanden blijven bestaan, er
   komen geen stekels, rivieren worden niet afgesnoerd. Leg het algoritme, de drempels en de metriek vast.
3. **Lichter:** meet de tegelbytes en vertices per zoom tegen prod en strak. Mik op een orde kleiner dan prod op
   zoom 5–9. Overweeg voor de lage zooms een enkele vooraf gegeneraliseerde laag voor heel het kader in plaats van
   tegels, als dat lichter en sneller is (meten).
4. **Controles (automatisch):** landoppervlak per eiland tegen de bron, een stekel/dunte-metriek, en de breedte-
   continuïteit van rivieren. Lever bladen per zoom 5–11 met app licht/donker, Gevoel/Wind en een bot-still, plus
   close-ups Wadden, Uithoorn/Vinkeveen, Amstel, Biesbosch, Veluwe.
5. De Wadden-fix in strak maak je eerst af als die klein is. Zand en de stekels los je op in `diagram` (niet meer in
   strak). Werk MIP-42 bij met deze herijking als hoofdrichting.

### Precisering (PO 2026-11-09)
- "Diagrammatisch" niet te letterlijk: geen schematische metrokaart. Het blijft een herkenbare kaart van Nederland,
  alleen geen volledige kaart. **Herkenbaarheid** is het criterium.
- Moet erin: rivieren, stads- en dorpskernen (ook kleinere kernen op hogere zoom), kust, grote wateren, grenzen en
  plaatsnamen. Grote wegen (snelwegen) zijn optioneel en minder belangrijk. Maak een variant met en een zonder, en meet
  wat ze kosten.
- Bos is binair: bos of geen bos, één tint, geen subklassen. Zand, heide, gras en moeras zijn geen eigen klassen.
- Een belangrijk doel is dat de kaartlaag veel goedkoper wordt (bytes, tekenen, laden), zodat de hele app lichter en
  makkelijker hackbaar wordt. Rapporteer naast bytes en vertices ook de teken- en laadkosten van de basiskaart in de
  app (eerste tekening, kosten per frame bij pannen/zoomen, geheugen) tegen prod. Gebruik daarvoor de U109-meting
  `perf.layers`.
