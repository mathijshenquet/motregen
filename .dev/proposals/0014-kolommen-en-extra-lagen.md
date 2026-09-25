# MIP-14 — Configureerbare kolommen en extra lagen (pollen, windstoten, zicht, neerslagsoort, luchtkwaliteit)

Status: draft (PO-vraag 2026-09-25: "is er een pollenradar-databron? wat willen meteo-nerds
nog meer zien? future vision: meer kolommen, dat overflowt, dus een configoptie")

## Wat al in de data zit (0 extra downloadbytes)

Inventaris van het echte HARMONIE +1-lid (`grib_ls`, 2026-09-25) naast wat we al publiceren:

| veld | GRIB (tabel 253) | wat meteo-mensen ermee doen | kolom / laag |
| --- | --- | --- | --- |
| luchtdruk zeeniveau | 1 @ niveau 103 | isobaren, fronten lezen | **U35 loopt** (laag in windmodus) |
| windstoten 10 m | 162/163 @ 10 m, `timeRangeIndicator` 2 (max over het uur) | "windstoten tot 65 km/u" | kolom Wind: `3 Bft · 45` (stoot klein erachter) |
| zicht | 20 @ sfc | mist, rijomstandigheden | kolom Zicht (km), alleen tonen < 10 km? |
| neerslagsoort | 181 regen / 184 sneeuw / 201 korrels, accumulaties | sneeuw/hagel/ijzel-verwachting | weericoon-variant + kolom "soort" in de winter |
| dauwpunt | 17 @ 2 m | benauwdheid, mistkans | kolom RV → dauwpunt (U23 probeerde het; PO koos %) |
| bewolking laag/midden/hoog | 73/74/75 @ sfc | "hoge sluierbewolking" | icoon-nuance; laag op de kaart |
| sneeuwdikte | 65/66 @ sfc | winterkaart | laag, seizoensgebonden |
| wolkenbasis | 186 @ sfc | vliegers, fotografen | kolom (m) in een "expert"-set |

Buiten HARMONIE-p1 (aparte KNMI-datasets, wel open): bliksemdetectie (KNMI LDAS/"lightning"),
satellietbeelden (MSG), echotoppen/hagelproduct van de radar, HARMONIE-p3 (drukvlakken: 850 hPa
temperatuur, CAPE) — elk een eigen ingest-track.

## Pollen: er is geen KNMI-pollenradar

Nederlandse pollentellingen (LUMC Leiden, Elkerliek Helmond) zijn puntmetingen, dagen achteraf,
zonder open API. Buienradar's "hooikoortsradar" is een modelproduct. De bruikbare open bron is
**CAMS (Copernicus Atmosphere Monitoring Service)**: Europese luchtkwaliteitsverwachting met
pollen (berk, els, gras, bijvoet, olijf, ambrosia) op 0,1°, dagelijks, 4 dagen vooruit, gratis
(ADS-API met sleutel, of via Open-Meteo's air-quality-endpoint zonder sleutel). Zelfde bron
levert PM2,5/PM10/NO₂/O₃ voor een luchtkwaliteitskolom; RIVM Luchtmeetnet heeft een open API
voor de actuele NL-metingen. Kanttekening voor About: dan is niet alles meer "rechtstreeks van
het KNMI" — één regel erbij.

## Kolomconfiguratie (de future vision)

- De tabel krijgt een vaste kern (Weer, Gevoel, Wind, Regen-bij-icoon) en een **kolomset** die de
  gebruiker aanzet in de About/instellingen-modal onder "Weergave": UV, RV of dauwpunt, windstoten,
  zicht, luchtkwaliteit, pollen. Opslag in `localStorage` naast het thema; het gebruiksbaken
  krijgt één veld `cols` (welke set) zodat we zien wat gebruikt wordt (MIP-13-contract bijwerken).
- Overflow: op mobiel horizontaal scrollen in de tabel met sticky eerste kolom, óf de tabel
  kiest zelf een compacte cel (icoon + getal) — de PO kiest op stills.
- Elke extra kolom = data-op-aanvraag (pas laden als de kolom aanstaat), zoals `uv_clear` (U15).

## Voorstel voor volgorde

1. Windstoten en zicht (goedkoop, al in de data, meteo-nerd-waarde hoog).
2. Kolomconfiguratie + baken-veld (de UI-fundering; nodig vóór meer kolommen).
3. Neerslagsoort in het weericoon (winter).
4. Pollen + luchtkwaliteit via CAMS/Open-Meteo (nieuwe bron, eigen ingest, About-regel).

## PO-richting (2026-09-25, 22:10)

- **Neerslagsoort** komt in de bestaande regenlaag, niet als kolom: alleen niet-regen (sneeuw,
  korrels/hagel, ijzel) en onweer worden niet-triviaal gemarkeerd; regen blijft zoals hij is.
- **Bewolking onder het kopje Weer**: experimenteren met een **dwarsdoorsnede van de wolken**
  (laag/midden/hoog als "getekende" lagen) die in de weermodus de regengrafiek kan vervangen.
- **Windstoten** in de kolom Wind. Er komt sowieso een **eenheidsinstelling** (Bft / knopen /
  km/u / m/s) in de instellingen.
- Tracks: U36 windstoten + eenheidsinstelling; U37 wolkendoorsnede (experiment); U38 neerslagsoort
  in de regenlaag (ingest 181/184/201 + onweer-signaal; wacht op winter/onweersdata om te testen).
