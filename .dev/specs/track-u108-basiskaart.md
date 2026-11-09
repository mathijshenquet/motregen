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
