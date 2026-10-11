# MIP-34 — Luchtkaart: wolkenstructuur en licht op de grond

Status: accepted (PO 2026-10-12, eerste vormenproef) · auteur: PM (sol)

## Het probleem

De PO vindt de wolkenkaart weinig informatief en lelijk: een laagfrequent veld dat de kaart wit maakt en de sfeer buiten onvoldoende weergeeft. De huidige kaart zet uitsluitend totale bewolking (`cloud_frac`) om in dekking van één sluierkleur. Overdag is die bijna wit, maximaal 0,55 dekkend; 's nachts grijsblauw, maximaal 0,30. De vulling heeft geen lijnen of labels en wordt ruimtelijk en in de tijd glad geïnterpoleerd. Veel bewolking maakt dus altijd hetzelfde soort waas, ongeacht de hoeveelheid licht eronder.

Op de echte dev-app zelf bekeken: de dagkaart verliest contrast en straat-/plaatsnamen verbleken; de nachtkaart toont grote grijsblauwe vlekken. Het is een modelveld, geen willekeurig gegenereerde ruis, maar het leest voor de gebruiker nauwelijks als weer.

## Eerder werk

MIP-14/U34 introduceerden de bewolkingssluier. MIP-24/U62 bepaalden de dag-/nachtkleuren en regenmenging in Lucht. MIP-18/U47 gebruiken voor de grafiek al de lichtfactor uit HARMONIE-straling en een heldere-hemelreferentie, met een schatting uit lage/midden/hoge bewolking als terugval. Dat werk is beschikbaar in `uv.ts` (`cloudModification`, met correctie voor uurmiddelen) en `cloud-section.ts` (`layerTransmission`, `skyDarkness`). De kaart gebruikt deze lichtfactor nog niet.

Het manifest bevat al `radiation`, `cloud_low`, `cloud_mid`, `cloud_high` en `cloud_frac`. Hiervoor is geen nieuwe databron of ingest nodig; volledige kaartvelden moeten wel op aanvraag geladen en op dezelfde geldigheidstijd uitgelijnd worden.

## Verduidelijking na PO-vraag: welke kwaliteit zit in de data?

De PO vraagt vervolgens of de data onderscheid maakt tussen afwisselende regenwolken/zon en een voortdurend halfgrijze hemel. Hij wil een radarachtig wolkenbeeld en staat gefingeerde vormen waar nodig expliciet toe.

De [KNMI HARMONIE-veldentabel](https://www.knmidata.nl/open-data/harmonie) bevat momentane totale en lage/midden/hoge bewolking, plus geaccumuleerde straling en neerslag. Het percentage is bedekking, geen tijdsduur met zon of regen. Onze ingest maakt straling tot een uurmiddel. De combinatie geeft aanwijzingen voor gebroken bewolking tegenover een gesloten, lichtdoorlatende sluier; de precieze wolkensoort en volgorde van zonmomenten binnen een uur zijn daarmee niet uniek te reconstrueren. Eén lichtfactor alleen kan een afwisseling van licht/donker en voortdurend gedempt licht evenmin onderscheiden.

**We verliezen zelf structuur:** `pipeline.rs` middelt de vier wolkenvelden over 8×8 cellen van het 2.000 m Web-Mercatorrooster, tot `SUMMARY_GRID` met 16.000 m rasterafstand. Straling wordt over 4×4 cellen gemiddeld. Deze afstanden zijn projectieafstanden. De grofheid is nuttig voor puntreeksen, maar voor een wolkenkaart verdwijnt daardoor veel ruimtelijke informatie al vóór de shader. Meer detail bewaren uit de bestaande HARMONIE-bron is een mogelijke vervolgstap; het is geen scherpte die de huidige kaartchunks nog bevatten.

Voor echte structuur bestaat een aanvullende bron: [KNMI MSG-/MTG-CPP](https://msgcpp.knmi.nl/) biedt satellietafgeleide wolkenmaskers, optische dikte, hoogte en licht aan de grond. MTG-CPP is sinds augustus 2026 beschikbaar, met tienminutenbeelden en 2 km resolutie recht onder de satelliet. De optische/stralingsproducten hebben daglichtbeperkingen. Deze bron zit nog niet in motregen; beschikbaarheid, Nederlanddekking en nachtproducten moeten vóór ingest concreet worden gecontroleerd. Dit kan echte wolkenstructuur voor verleden/nu geven; toekomstige structuur blijft een modelverwachting of een illustratieve reconstructie.

## Aanbeveling

Maak Lucht een **radarachtige kaart van wolkenstructuur en licht**, met bedekking en lichtdoorlating als twee afzonderlijke eigenschappen. De PO-richting vervangt het eerdere advies om eerst uitsluitend een lichtkaart te maken.

1. **Licht stuurt de dagtint.** Bereken per broncel de bestaande lichtfactor uit straling tegenover de heldere-hemelreferentie voor die plek en dat modeluur. Hergebruik de behandeling van uurmiddelen; deel niet door de momentane zonnestand. Pas de bestaande perceptuele schaal toe. Zonder bruikbare straling dienen de drie wolkenlagen als schatting; totale bewolking is de laatste terugval. Ontbrekende data krijgt geen verzonnen helder of somber resultaat.
2. **Bedekking wordt vorm, lichtdoorlating wordt tint.** Gebroken bewolking krijgt wolkenvelden met heldere gaten; een gesloten dunne sluier krijgt een aaneengesloten, lichtere structuur; een dik gesloten pakket wordt voller en grijzer. Lage/midden/hoge bewolking en de lichtfactor sturen het karakter als heuristiek, niet als een gemeten wolkensoort. Fijnstructuur mag proceduraal zijn, volgens de expliciete PO-wens. Veranker die in kaartcoördinaten en laat haar coherent door de tijd lopen, zodat de wolken bij scrubben niet willekeurig verspringen. Regionale bedekking en licht blijven de databasis.
3. **Nacht en schemer sluiten aan.** Zonnestand blijft de basis. Bij nacht wordt nul zonnestraling niet als zware bewolking gelezen: gebruik daar de wolkenlagen voor een ingetogen verschil tussen open en gesloten hemel. Laat licht- en nachttint aansluiten bij grafiek en kaartklok.
4. **De kaart houdt contrast en betekenis.** Combineer een beperkte lichttint op de grond met de wolkenstructuur; houd plaatsnamen en regen leesbaar. De wolkendoorsnede blijft de plaats om laag/midden/hoog te lezen. De geanimeerde fijnstructuur illustreert de modelverwachting; haar vorm is geen waargenomen wolkenpositie. Echte satellietstructuur kan later voor verleden/nu dezelfde presentatie voeden. Kleuren en sterkte worden in de echte dev-app gekozen.

## Alternatieven

Alleen de witte sluier zwakker maken helpt de leesbaarheid, maar houdt dezelfde beperkte betekenis. Alleen een lichtkaart toont regionale helderheid, maar maakt gebroken bewolking en een gesloten sluier onvoldoende verschillend. Satellietstructuur meteen als nieuwe productiebron invoeren vereist extra ingest. Daarom adviseer ik als eerste visuele proef vormen op basis van de bestaande modelvelden, daarna bepalen hoeveel echte detaildata nodig is.

## Proef en vervolgstappen

1. Eén proef in de bestaande HMR-dev-app: modelgestuurde vormen, lichttint en coherente tijdsinterpolatie, op dezelfde data en met een vergelijking met de huidige sluier. Toon ook de twee conceptgevallen: gaten tussen donkere wolken tegenover een gesloten dunne sluier. Alleen Lucht verandert. Bestaande regenpresentatie meenemen bij de beoordeling, omdat die nu met de witte sluier mengt.
2. Zelf zonnige, gedempte en sombere daguren, schemer en nacht op desktop en mobiel bekijken. De PO kiest tint en sterkte live. Typecheck tijdens de iteratie; geen volledige e2e-gate per kleurstap.
3. Als het beeld bevalt: kies of de huidige grove velden voldoende zijn, of dat we HARMONIE-detail en/of satellietstructuur toevoegen. Dat is een afzonderlijke gegevens-/ingeststap.
4. Na afronding: relevante tests op lichtafleiding, ontbrekende data en nacht; typecheck/unit/build en gerichte desktop-gate. Controleer extra datavraag en afspeelkosten. Merge/uitrol pas na die gate.

## Open vraag

1. Eerste proef met illustratieve, modelgestuurde wolkenvormen in de dev-app, of eerst echte satellietstructuur onderzoeken? Aanbeveling: de vormenproef eerst, zodat de PO de presentatie kan kiezen vóór extra ingestwerk.

## Besluit

PO 2026-10-12: "ja probeer eens". Eerste vormenproef in de dev-app aangenomen, met gefingeerde fijnstructuur op de bestaande modelvelden. Extra ingest is een afzonderlijke keuze; de visuele iteratie gaat vooraf aan de merge-gate en uitrol.

## Changelog

- 2026-10-11: PO-feedback onderzocht, dag-/nachtkaart zelf bekeken; voorstel opgesteld. Implementatie volgt na de richtingkeuze.
- 2026-10-11: PO vraagt radarachtige wolkenstructuur en staat gefingeerde details toe. Beschikbare HARMONIE-/satellietgegevens geverifieerd; eigen 8×8-middeling vastgesteld. Voorstel herzien naar bedekking plus lichtdoorlating en modelgestuurde vormen.
- 2026-10-12: eerste vormenproef aangenomen; vergelijking met de oude sluier en drie expliciet gefingeerde voorbeeldluchten via het dev-paneel. Eigenaar PM, knoppen vervallen na PO-keuze, uiterlijk 2026-10-19.
- 2026-10-12: eerste proef op http://ageq-dev2:4390/lucht/utrecht, vergelijking en voorbeelden via `?dev` onder Wolkenkaart. Zelf dag/nacht op desktop/mobiel, oude sluier, voorbeelden en afspelen rond zonsopkomst bekeken. Typecheck en 14 gerichte tests groen. Visuele iteratie loopt; geen merge-gate of uitrol uitgevoerd.
