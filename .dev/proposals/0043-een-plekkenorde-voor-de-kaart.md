# MIP-43 — Eén plekkenorde voor alles op de kaart

Status: accepted (richting, 2026-11-10) · auteur: orkestrator (Claude) · PO-wens 2026-11-10

## Aanleiding

De PO (2026-11-10), bij screenshots van Wind en Weer op desktop:
- "ik vind ook dat er te veel windzakken zijn"
- "kunnen we niet gewoon vaste plekken kiezen op de kaart voor allerlei markers? kijk op de weermodus uitgezoomd zijn
  er ook welgeteld 2 temperatuurmarkers. wellicht kunnen we een unified theorie van wat we op de kaart laten zien
  hebben? er staan ook te veel plaatsnamen, imho, als je inzoomt."

## Hoe het nu werkt (vier losse regimes)

1. **Plaatsnamen** komen uit de `place`-laag van de basiskaart (PMTiles, MIP-42). MapLibre kiest ze zelf met zijn
   botsingsregel. Wij bepalen dus niet welke namen er staan of hoeveel. Bij inzoomen komen er steeds meer bij.
2. **Getallen in Gevoel** en **windzakken in Wind** komen uit één lijst, `MAP_PLACES` (`web/src/core/map-places.ts`,
   U107): ~75 temperatuurplaatsen in volgorde van belang plus 8 waterpunten. Daaruit kiest `nestedPlaces` er per
   halve zoomstap zoveel als er passen bij een minimumafstand. Die afstand verschilt per laag: 40–64 px voor de
   getallen, ~70 px voor de zakken. "Zoveel als er passen" geeft op desktop 25–35 zakken, en dat is wat de PO te
   veel vindt.
3. **Temperaturen in Weer** komen uit een eigen symboollaag (`motregen-temperature`) met dezelfde soort plaatsen.
   MapLibre laat de meeste vallen, omdat ze botsen met de plaatsnamen van de basiskaart. Daardoor stonden er op het
   screenshot maar 3 (5°, 3°, 6°), op plekken die willekeurig lijken. (Correctie 2026-11-10: eerst stond hier dat het
   labels op de isothermen waren.)
4. **De bot** gebruikt per still vaste platen met dezelfde lijsten. Zijn namen komen uit de eigen labelplaatsing van de
   plaat.

Een naam, een getal en een zak voor dezelfde stad staan dus niet vanzelf op dezelfde plek. Elk regime telt ook zijn
eigen dichtheid.

## Voorstel

**Eén handgekozen plekkenorde, met rangen, die bepaalt wat er op de kaart staat. Elke laag die iets per plek laat zien
haalt zijn plekken daaruit.**

1. **De orde.** Een lijst plekken, elk met een rang:
   - rang 1: ~6–8 plekken die het land dekken (bijv. Amsterdam, Rotterdam, Groningen, Zwolle, Eindhoven,
     Maastricht/Limburg, Vlissingen/Zeeland, Den Helder of de Waddenkust), plus 1–2 zeepunten;
   - rang 2: ~8–10 extra (provinciehoofdsteden, kust, IJsselmeer);
   - rang 3 en 4: verfijning voor ingezoomd.

   Ook buurland krijgt een paar plekken (Antwerpen, Brussel, Düsseldorf), maar die komen pas bij inzoomen. Wordt een
   plek aangepast, dan gebeurt dat in deze lijst en niet per laag.
2. **Rang naar zoom.** Een rang verschijnt pas vanaf een vaste zoomdrempel, afhankelijk van de schermmaat
   (telefoon/desktop). Doel: uitgezoomd op NL zijn er op een telefoon ~8–10 plekken, op desktop ~12–16. Inzoomen voegt
   alleen plekken toe, uitzoomen haalt alleen weg (zoals `nestedPlaces` nu). Wat er staat ligt vast en is per zoom
   voorspelbaar, het hangt niet af van de beschikbare ruimte.
3. **Wat er per plek staat, per modus:**
   - Weer: de temperatuur (getal) op de plek; de isothermen blijven als lijnen;
   - Gevoel: de gevoelstemperatuur;
   - Wind: een windzak met windkracht;
   - Lucht/regen: alleen de naam.

   Zeepunten hebben geen naam, alleen het getal of de zak.
4. **Namen.** De plaatsnamen komen uit dezelfde orde, niet meer uit de `place`-laag van de basiskaart. Die laag gaat
   uit of krijgt een filter op deze namen. Een naam staat altijd bij zijn eigen getal of zak. Er komen dus geen namen
   meer bij die nergens bij horen, en ingezoomd zijn er minder namen.
5. **Bot.** De platen van de bot gebruiken dezelfde orde op hun vaste zoom. Telegram en de app tonen dan dezelfde
   plekken.

## Keuzes voor de PO

1. **Naam en waarde samen of los?**
   - (a) Eén label "Utrecht 5°", of een zak met de naam eronder.
   - (b) Het getal of de zak op de plek, de naam er klein naast (zoals nu in Gevoel).
   - (c) Uitgezoomd alleen getal of zak, de namen pas vanaf rang 2-zoom.
2. **Weer:** temperatuurgetallen op de plekken (voorstel), of de huidige labels op de isothermen houden?
3. **Dichtheid:** ~8–10 op telefoon en ~12–16 op desktop, uitgezoomd op NL. Goed als vertrekpunt? De worker levert
   varianten met screenshots.
4. **Buurland:** België en Duitsland pas bij inzoomen (voorstel), of vanaf het begin een paar plekken?

## Uitvoering (na akkoord)

Eén worker (opus-5.5):
1. De plekkenorde als data in `web/src/core/map-places.ts`, met rang per plek en zoomdrempels per schermklasse.
2. Weer, Gevoel en Wind lezen daaruit. De naamlaag wordt een eigen symboollaag uit dezelfde orde; de `place`-laag van
   de basiskaart gaat uit.
3. De bot gaat mee via de modusconstanten. Node en Rust lezen dezelfde lijst.
4. `?dev&plekken=nu|orde` om te vergelijken, met screenshots op telefoon en desktop, overdag en 's nachts, per modus.

U113 (de eenheid op de zak) staat hier los van en gaat gewoon door. U111 (Firefox) profiteert ervan: minder zakken
is minder tekenwerk.

## Besluit (PO 2026-11-10)

Na proefversies van U114 (`track/u114-plekkenorde`, preview 4314) kiest de PO de **provincietrede** als richting: "ik
vind provincies wel nicer, alleen de tween moeten we nog ff goedkrijgen, maar lijkt me in ieder geval het juiste pad".

1. **Verst uitgezoomd** staat één plek per provincie, op een anker in de provincie, met naam en waarde ("Gelderland 3°").
   Bij inzoomen schuift elke provincieplek naar zijn hoofdstad. Het label wisselt pas als hij daar aankomt; bij
   uitzoomen gaat het andersom. Daarna volgt de stedentrede: hoofdsteden winnen altijd, en daarna is het strikt
   monotoon (inzoomen voegt alleen toe; de pin duwt en verbergt geen plek).
2. **Dichtheid** is een doel per schermoppervlak op elk zoomniveau, zonder trap direct na de tween. Rangen 1–6 zijn
   handgekozen of komen uit de plaatsenlijst; per plek ligt een labelkant vast, zodat een naam niet over het water valt.
3. **Naam en waarde samen** (keuze 1a): één label "Utrecht 5°", of een zak met de naam eronder.
4. **De zakken in Wind** staan op de plekken uit de orde en hebben de pil van U113.

Nog open, met voorstel van de orkestrator:
- Wind in de provincietrede: die overslaan en meteen met de hoofdsteden beginnen (op de telefoon waren 12 zakken te vol).
- Dieper dan zoom ~11,4 geen buurtschappen of wijken.
- De bot (Node en Rust) volgt na de app, in een eigen stap.
