# Kaartstijl

Eén regime voor alles wat met tekst of een symbool op de kaart staat, in elke modus (Weer, Lucht, Gevoel, Wind),
in de app (telefoon en desktop, licht en donker) en in de bot. U107, PO 2026-11-09. Plaatsnamen, grenzen en water
komen uit de basiskaart en vallen hier buiten; het regime sluit erop aan.

## Letter

- Kaartgetallen en -labels: **Noto Sans**, de letter van de plaatsnamen in de basiskaart.
  - MapLibre-lagen (stadstemperaturen, zon): `Noto Sans Regular` uit de glyph-PBF's.
  - DOM en canvas (gevoelsgetallen, windbadge): de gebundelde subset `web/src/assets/fonts/noto-sans-kaart.woff2`
    (`"Noto Sans Kaart"`, cijfers, `°`, `−`, `Bft`; gewicht 400–800).
  - Bot (Rust): `NotoSans-Regular.ttf` en `NotoSans-ExtraBold.ttf` in `crates/render-core/assets`.
  - Alles wordt gebouwd door `tools/fonts/build.sh` uit `nixpkgs#noto-fonts` (OFL 1.1).
- Bediening (klok, zoekbalk, legenda, bot-klokpaneel en voetregel) houdt de UI-letter (Inter/systeem).
- Gewicht: getallen 400; het getal in de windbadge 800.

## Maat

`mapLabelSize` (`web/src/core/map-labels.ts`): elk kaartgetal (stadstemperatuur, gevoelsgetal, windbadge) heeft
dezelfde maat.

| regime | telefoon (kortste zijde < 600 px) | desktop | bot |
|---|---:|---:|---:|
| `compact` (standaard, PO-keuze U100) | 12 px | 13 px | 13 px |
| `ruim` (`?dev&regime=ruim`, proef) | 13 px | 14 px | — |

De bot neemt de desktopstap op zijn eigen schaal (`FRAME.scale`); de maat staat in de modusconstanten.
Stadstemperaturen schalen niet meer mee met de zoom.

## Kleur en halo

| thema | inkt | halo |
|---|---|---|
| licht | `#102630` | `#ffffff` |
| donker | `#f3fbfd` | `#102027` |

Vrijstaande getallen krijgen een halo van 2 px (MapLibre `text-halo-width`, DOM `text-shadow`, bot 2 beeldpunten rondom).
Het thema volgt de kaart (overdag licht, 's nachts donker, MIP-24).

## Schijf

Een getal op een eigen vlak staat op een cirkel met één vormregel (`mapDiscRadius`): straal = max(9,5/13 em,
tekens × 0,3 em + 4 px). Bij 13 px: één cijfer 9,5 px, `12` en `8°` 11,8 px, `10°` 15,7 px.

- Gevoel: de schijf heeft de kleur van de band van het getal (de isolijn wijkt eromheen); inkt en halo zoals hierboven.
- Wind: witte schijf met inktrand `#17242b`, oranje getal (800); drie tekens (km/u) één maat kleiner.

## Plekken

Eén lijst (`MAP_PLACES`, `web/src/core/map-places.ts`): de temperatuurplaatsen in volgorde van belang plus acht
waterpunten. Gevoelsgetallen en windzakken kiezen er dezelfde plekken uit met `nestedPlaces` (stabiel bij zoomen:
inzoomen voegt alleen toe) en één afstand (`mapPlaceSpacingPx`: 1/16 van de kortste zijde, 40–64 px), hooguit 60.
De bot gebruikt dezelfde keuze bij zijn vaste zoom. Stadstemperaturen in Weer en Lucht zijn bewust ijler
(`temperatureLabelSpacingPx`, 1/7; PO 2026-09-25) en komen uit de landplaatsen van dezelfde lijst.

## Uitwijken

Eén regel (`MapLabelPlacer`, `web/src/core/map-label-placement.ts`): een label staat op de eerste vrije plek uit een
vaste ladder rond zijn anker — eerst de vorige plek, dan op de plek, erboven, eronder, opzij (`PLACE_LADDER`, in
labelhoogtes; windzakken beginnen bij hun voorkeursplek uit het naammasker en proberen dan een ring van 14, 22 en 30 px).
Vrij is: binnen beeld, niet over een geplaatste plaatsnaam, de locatiepin, de bediening (klok, zoek, merk, knoppen,
legenda) of een eerder label. Geen vrije plek: het label vervalt.

- Getallen en zakken wijken direct als de pin verplaatst, niet pas na de volgende pan of tijdstap.
- MapLibre-labels (stadstemperaturen) volgen dezelfde regel: pin en bediening staan als onzichtbare symbolen in de
  botsingsindex (`map-collision.ts`).
- Bot: dezelfde ladder tegen het naammasker van de plaat, het klokpaneel en het voetpaneel; de plek hangt aan de
  breedte van `00°`, zodat een getal binnen een film niet verspringt.

## Lagen

Van onder naar boven: basiskaart, velden (regen, wolken, temperatuur- en Beaufortvlakken), isolijnen met schijven,
stadstemperaturen, plaatsnamen, gevoelsgetallen, windzakken, pin, bediening.

## Legenda

Eén legenda-knop voor alle modi (PO 2026-11-09): een ronde kaartknop van 44 px rechtsonder, boven de bronregel, in
Weer, Lucht, Gevoel en Wind, telefoon en desktop. Hij opent en sluit de legenda van de actieve modus, die links naast
de knop staat. Desktop begint open, telefoon dicht (legenda's daar voorlopig verborgen); de keuze wordt niet bewaard.

- Vorm: afgerond paneel in de kleur van de bediening (tint mee met de hemel), 11 px, vakjes 9 px hoog, eenheid klein
  aan het eind (`mm/u`, `°C`, `Bft`).
- Klassen (regen, wind, lucht): vakje met de naam erachter; een doorlopende schaal (gevoel): tikken tussen de vakjes.
- Lucht: zon, wolken, regen.
- Telefoon (< 960 px): de open legenda is in elke modus één band zo hoog als de knop (44 px), naast de knop:
  vakjes aaneen met hun label eronder (Wind: de zonewoorden daar weer onder), 10 px; past hij niet, dan scrollt hij
  horizontaal in plaats van te krimpen of te breken.

## Beweging

- Windzakken volgen het veld met momentum (kritisch gedempte veer, 0,6 s richting, 0,8 s kracht) en wuiven met een
  opgetelde golffase (`advanceSock`, `swayBends`). De bot stapt dezelfde toestand per filmframe (Rust `SockChain`
  in de framecacheketen), dus de film is deterministisch.
- Wuifbudget (`WINDSOCK_IDLE`): 30 fps bij interactie, 15 fps na 30 s zonder aanraken/scrollen/tijdstap, na 3 min
  uitdempen tot rust; buiten beeld (weggescrold, verborgen tab) tekent de laag niet.
