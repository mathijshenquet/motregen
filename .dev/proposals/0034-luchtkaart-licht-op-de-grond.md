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

## Ronde 2 — beweging en type-overgangen (PO 2026-10-12)

De PO vindt de historie goed, maar het getekende detail stond stil en vertoonde ringen rond Den Helder bij 17:56. Zijn vermoeden van een type-overgang is bevestigd: de shader herschaalde dezelfde patrooncoördinaten per pixel op basis van het type. Ruimtelijk variërende schaal en gekwantiseerde typewaarden vervormden het veld. De nieuwe proef tekent afzonderlijke lage/midden/hoge patroonvelden en mengt hun optische dichtheid, met vaste coördinaten per type.

Voor beweging volgt de GPU een stromingsveld terug vanaf elke zichtbare plaats, met midpoint-integratie. De bestaande 10m-modelwind dient voorlopig als bewegingsproxy; wind op wolkenhoogte of beweging uit opeenvolgende wolkenvelden is een aparte verbetering. Twee overlappende levensduren van vier modeluren houden vervorming begrensd en vernieuwen het detail op nul gewicht. Beeld en fase hangen uitsluitend van kaarttijd en modeldata af, zodat terugschuiven reproduceerbaar blijft. Oudere reis dan één uur gebruikt de wind van één uur vóór de cursor, met een continu schuivende grens.

De oppervlakte-Jacobiaan van het teruggevolgde veld corrigeert de renderdichtheid: samenstromen verdicht, uitstromen verdunt. Correctie begrensd op 0,25–4, met lokale translatie als een numerieke mapping vouwt. Regionale bedekking blijft uit het model komen; deze proef is geen volledige conservatieve simulatie van wolkenwater. [GPU-backtracking](https://developer.nvidia.com/gpugems/gpugems/part-vi-beyond-triangles/chapter-38-fast-fluid-dynamics-simulation-gpu) en [optische dichtheid/dekking](https://www.pbr-book.org/4ed/Volume_Scattering/Transmittance) zijn de technische basis.

Echte GPU-proef op gecontroleerde velden: verschoven patrooncorrelatie 0,9966 tegenover 0,3060 zonder verschuiving; compressie en dilutie respectievelijk circa 0,38% en 0,19% van de analytische referentie. Ruimtelijke type-menging wijkt gemiddeld 0,00171 af in optische dichtheid. Verkleinen van tijdverschillen rond uur-/levensduurgrenzen verkleint de beeldverschillen mee; het exacte cycluspunt en opnieuw bezochte tijd geven nul byteverschillen. Dag/nacht, desktop/mobiel, voorbeeld-overgang, de voor/na-kaart van 17:56 en afspelen rond zonsondergang zelf bekeken. Nog geen uitspraak over het mobiele perf-budget.

## Ronde 3 — textuurvariatie en regen uit de proef (PO 2026-10-12)

De PO zag te sterke, hoekige verdichting rond Keulen om 15:45, vond de eerdere textuur beter en wees op het verschil tussen grondwind en wolkenbeweging. De extra oppervlakte-Jacobiaan is verwijderd: modelbedekking stuurt de dichtheid, de 10m-proxy mag daar geen extra wolkenmassa bij verzinnen. Overlappende levensduren zijn verkort naar twee uur met twaalf midpoint-stappen. De beweging is nog illustratief op basis van 10m-wind; betrouwbare beweging per wolkenlaag vereist andere gegevens. De ingest heeft ook 300m-wind voor regenbeweging, maar ook dat vervangt wind op alle wolkenhoogten niet.

Op verzoek staat regen tijdelijk uit in Lucht, met de focusovergang terug naar de andere modi. Het oorspronkelijke subtiele reliëf is terug. Bij volledig lage en middelhoge bewolking om 03:00 op 13 oktober stond overal dezelfde fijne rimpeling. De PO verduidelijkte: de textuur is goed, maar er moet meer diversiteit in zitten; geen algemene vervaging of andere kleuren.

Als vormreferentie zijn NASA-beelden van [open en gesloten wolkencellen](https://science.nasa.gov/earth/earth-observatory/open-and-closed-cell-clouds-over-the-pacific-ocean-43795/) en [cirrus boven stratocumulus](https://science.nasa.gov/earth/earth-observatory/cirrus-clouds-off-the-coast-of-chile-85943/) zelf bekeken. De proef mengt afgeronde cellen, grotere aaneengesloten structuren en bestaand fijn detail in geleidelijk veranderende gebieden. Hoge patronen blijven langgerekt. Patrooncoördinaten zijn vast per type; alleen gewichten veranderen. Het kleurenpalet blijft gelijk. Deze variatie is illustratief; bedekking/lagen bepalen niet welke celstructuren werkelijk aanwezig zijn.

## Nederlandse referenties en eerste kostenmeting (PO 2026-10-12)

Op PO-verzoek zijn Nederlandse beelden toegevoegd: [KNMI Meteosat](https://www.knmi.nl/nederland-nu/weer/actueel-weer/satellietbeeldenloop), eigen snapshot van 12 oktober 2026 08:00 UTC, en [Buienradar/EUMETSAT/Met Office van 14 april 2023](https://www.buienradar.nl/nederland/zon-en-wolken/satelliet-terugkijken/archief/202304141045). Voor wolkenvormen zijn satellietbeelden de referentie; neerslagradar toont een ander veld. Beelden zelf bekeken. Kenmerken voor deze illustratieve proef: samenhangende banken, rafelige randen, verschillende celgroottes en kleinere structuren binnen grotere groepen. Geen claim dat de proef die waargenomen posities reconstrueert.

Twee eigen beeldrondes met hetzelfde vastgezette manifest: variabele celgroottes en twee schalen, daarna fijne structuren gekoppeld aan grotere groepen. Middelhoge bewolking heeft nu een eigen breder patroon; het reliëf volgt de gekozen wolkenstructuur. De sterke algemene coördinaatvervorming is gehalveerd. Kleurenpalet en regen-uit behouden. Dag/nacht op desktop/mobiel zelf bekeken.

PO vraagt ook hoe het performant kan worden. Gecontroleerde WebGL-microbenchmark,384×256 pixels, SwiftShader, twintig gemeten draws na vier warmups en synchrone pixelreadback: volledig31,5ms; zonder stroming18,1ms; alleen veld/compositie5,4ms (medianen van één diagnose). Dit zijn software-renderertijden inclusief readback, geen telefoon-GPUbudget. De eerste meting met alleen gl.finish gaf onbruikbare nulmetingen en is niet als resultaat gebruikt.

Een beeldneutrale eerste optimalisatie slaat nulgewogen wolkentypen en volledig transparante pixels over. Drie gepaarde runs:33,2→29,8ms;40,9→37,4ms;40,9→37,4ms, ongeveer8–10%. Absolute spreiding blijft zichtbaar; de gecontroleerde GPU-uitkomsten blijven gelijk. Dit neemt de hoofdkosten nog niet weg.

**Aanpak voor grotere winst, nog niet geïmplementeerd:**

1. Vaste procedurele structuren per kaartgebied/detailniveau vooraf berekenen en hergebruiken. Begrens het texturegeheugen en voorkom dat een grote initialisatie het eerste zichtbare beeld ophoudt.
2. De verplaatsing per kaarttijd op een apart, kleiner raster berekenen. Kies resolutie en precisie met een beeldvergelijking, juist bij convergentie en dichtbij inzoomen; geen blinde kwaliteitsverlaging.
3. In de zichtbare pixelpass hoofdzakelijk gesmoothde bronvelden, verplaatsing en opgeslagen structuren samplen en mengen.
4. Kosten van eerste beeld, afspelen, pannen/zoomen en geheugen afzonderlijk meten op de po-android-rig en op echte mobiele GPU. Cachekwaliteit vergelijken tegen de directe shader vóór ingebruikname. De huidige prototypecheck bewijst geen mobiel framebudget.

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
- 2026-10-12: PO-feedback beweging/ringen verwerkt in dezelfde dev-preview en PR115. Afzonderlijke typevelden, windgestuurde adveccie en begrensde dichtheidscompensatie; GPU-proof en 17 gerichte tests groen. Voorbeeldlucht `overgang` toegevoegd. Visuele iteratie blijft open.

## Performance en bewegingsbronnen (PO 2026-10-16)

PO vindt het beeld mooi en vraagt verdere versnelling met voorkeur voor textuur boven een grijze sluier. De aparte bewegingspass uit de kostenaanpak is geïmplementeerd: halve breedte/hoogte van het bestaande vuldoel, RGBA32F en handmatig bilineair samplen. Het aantal integratiestappen en de volledige procedurele textuur blijven behouden. Kwartresolutie was sneller maar faalde de kwaliteitsvergelijking bij sterke convergentie/draaiing en is verworpen. Halve resolutie kost in drie gepaarde SwiftShaderproeven 21,3/21,8/21,6ms tegenover 28,1/28,7/29,1ms voor direct tekenen: circa24–26% minder, inclusief beide passes en readback. Dit is geen hardware-/telefoonmeting. Geen grote textureatlas of extra eerste-framevoorbereiding; het extra raster kost16bytes per pixel, ongeveer0,77MiB bij een810×1000CSS-kaart. Beweging en detail blijven brononafhankelijk, zodat toekomstige wolkenvectoren de renderer kunnen voeden.

De PO noemt MTG-AMV, collectie [EO:EUM:DAT:0676](https://user.eumetsat.int/catalogue/EO:EUM:DAT:0676), en vraagt of HARMONIE wind op wolkenhoogte heeft en een snellere bron beschikbaar is. Onderzoek op16oktober:

1. [KNMI HARMONIE-documentatie](https://www.knmidata.nl/open-data/harmonie): onze P1 geeft U/V op10–300m. P3 geeft ook925/850/700/500/300hPa, P5 op90 modelniveaus. P3 is de eenvoudigste modelkandidaat voor lage/midden/hoge adveccie en toekomstige uren; niveautoewijzing blijft een te toetsen benadering, geen gemeten wolkenhoogte.
2. [P3-catalogus](https://dataplatform.knmi.nl/dataset/harmonie-arome-cy43-p3-1-0): uuruitvoer. De eigen catalogussteekproef: run16oct06UTC gepubliceerd08:28:56UTC, circa149min na initialisatie,3.396GB. P5 dezelfde run08:29:11UTC,16.926GB. Beschikbare P1-run05UTC07:28:38UTC,0.865GB. P3 is dus geen snellere actuele waarneming; hij voorspelt wel de geldige tijd. Downloadkosten vragen een aparte aanpak; niets gedownload behalve metadata.
3. Actuele AMV-catalogus zelf opgevraagd: IR105 met venster07:50–08:10UTC, catalogusupdated08:28:04UTC; VIS08 hetzelfde vensterupdated08:31:45UTC. De respectieve verschillen18/22min zijn steekproeven vanaf het venstereinde, niet een gegarandeerde latency of de exacte representatieve vectortijd. [EUMETSAT-productoverzicht](https://masif.eumetsat.int/ossi/pgd/mtgi_0deg_fdss.html) bevestigt de AMV-kanalen en halfuurscyclus. Niet iedere vector is een lage wolk: waterdampkanalen en verschillende hoogtes/kwaliteit moeten onderscheiden worden.
4. Een snellere kant-en-klare, actuele AMV-feed is nog niet bevestigd. De gevonden5min-RSS-collectie1083 is een klimaatrecord, geen live vervanger. [NWC SAF HRW](https://www.nwcsaf.org/Downloads/GEO/2018.1/Documents/Scientific_Docs/NWC-CDOP3-GEO-AEMET-SCI-UM-Wind_v1.1.pdf) kan met Rapid Scan-beelden werken, maar vergt eigen satelliet-/wolkentopverwerking en rekenbudget. Zelf optische stroming uit frequentere wolkenbeelden afleiden is een onderzoeksoptie, geen reeds beschikbare feed.

Aanbeveling: P3 voor de volledige voorspellingsperiode; AMV als mogelijke correctie/validatie rond nu na toetsing van Nederlandse dekking, hoogte en kwaliteit. De bestaande regenbeweging niet vervangen zonder vergelijking met onze radarbeweging. Geen ingestwijziging gedaan in deze renderproef. Bronnen/metadata en metingen in genegeerde `web/tmp/orkestrator/cloud-perf-20261016/`.

### Proef 16 oktober: gedeelde bewegingsbron en begrensde vervorming

Main bijgewerkt tot 1bf299d9 (U82/U83), via merge 31018a80. Wolken gebruiken nu dezelfde regen-motionannex als de regenroute, bilineair omgerekend van geprojecteerde broncellen/minuut naar wolkencellen/uur. Geen 10m-wind meer; ontbrekende vectoren betekenen stilstand. Annex wordt op de uurlijkse wolkentijden bemonsterd. Dit is een bewegingsproxy, geen gemeten wolkenvector en geen uniforme snelheid voor alle atmosferische lagen als definitief model.

U82 heeft juist de 300m-prior verwijderd. De huidige wolkenpublicatie is 79×85 op 16km/uur: rechtstreeks de 32-cellen regenmatcher toepassen geeft 512km-blokken en slechts circa 3×3 vectoren. Voor eigen wolkenmatching zijn fijnere bronvelden nodig. Een gedeelde matcher met afzonderlijke laagvectoren en betrouwbaarheid is een onderzoeksrichting, geen uitgevoerde ingestwijziging. Luchtdruk pressure_hpa is zeeniveaudruk; hooguit een zwakke dynamische controle, P3-wind op passende hoogte is een directere prior.

Vervormingsproef: texturelevensduur 2 uur → 30 minuten, twee overlappende banken met 15 minuten verschil; vernieuwen bij nul gewicht, zonder textuurvervaging. Numerieke statische terugtrace op het echte 12:00-veld: maximale lokale rek bij 1 uur 2,385×, bij 15 minuten 1,262×. Dit diagnosticeert opgebouwde rek, niet een exact gereproduceerd PO-beeld. GPU-oracle inclusief tijdgrenzen/reseek, translatie, compressie/dilutie en directe/cache-vergelijking exit0. Typecheck en eerst 59 gerichte tests groen; na levensduurwijziging opnieuw typecheck en 22 relevante tests groen. Dag/nacht desktop/mobiel en afspeelbeelden over de 14:00-bronovergang zelf bekeken; geen browsererrors. Geen volledige merge-/mobiele gate.

Preview4390 blijft live productiedata gebruiken; preview4398 gebruikt vastgezette U82-data van 16 oktober08:10, zodat de nieuwe matcher echt getest wordt. Zelfde code, verschillende data. Receipts/scripts in web/tmp/orkestrator/cloud-motion-20261016/. Geen prod/VM/Telegramacties, CSV niet aangeraakt.

### Correctie 16 oktober: vernieuwen zonder terugveren

PO meldt springende wolken om19:00 en vooral rond00:00 op de Noordzee westelijk Den Haag–Den Helder. Oorzaak: twee kortlevende textuurbanken vernieuwden op hetzelfde wereldvaste patroon. Continu aan de cyclusgrens, maar netto periodiek terugveren; de30minlevensduur maakte dit vaker zichtbaar. Eerdere korte continuïteitstest miste dit.

Fix: beginposities volgen een geïntegreerd gemiddeld bewegingspad uit de regenannexen (uurknopen, vier downloads tegelijk, gedeeld/gecachet per tijdlijn). Tussen knopen exacte integraal van lineair veranderende snelheid; lokale terugtrace en30minbegrenzing blijven behouden. Zowel directe als gecachete shader trekt de bijbehorende beginpositie af. Geen extra shaderpass of langere lokale terugtrace. Bij manifestverversing neemt het pad zijn oorsprong over uit het vorige pad, zodat wegvallende historie geen reset veroorzaakt. Dit is globale textuurverankering, geen nieuw fysisch wolkenmodel; lokale verschillen kunnen nog detailvernieuwing geven. Eerste laden vraagt extra kleine motionannexen over de tijdlijn; geen mobiele laadbudgetmeting gedaan.

Voor/na31 exacte frames23:45–00:15 met vasteU82data op4398 vastgelegd, Noordzee zelf bekeken. PO ziet live verbetering. Nieuwe uniforme-stromingsproef over een uur/twee levensduren: oude shader faalt (correlatie op oorspronkelijke plek1, op verwachte verplaatsing0,102), nieuwe slaagt (verwachte verplaatsing0,986, oorspronkelijke plek0,105). Alle eerdere GPUchecks blijven groen. Typecheck en26 gerichte unit-tests exit0, inclusief veranderende snelheid/middernacht/twee uur bankvernieuwing/verschuivend historie-venster. Eerste micrometerstrenge floating-pointtolerantie in unit-test faalde; tolerantie naar5decimalen in meters, geen productieafronding aangepast.

Repro: direnv exec . node web/tmp/orkestrator/cloud-jump-20261016/gpu.mjs; gpu-old.mjs is de verwachte falende controle. sequence.mjs before/after legt beelden vast. Receipts en LOG in dezelfde genegeerde map. Live4390 en vaste4398 bijgewerkt. Geen prod/VM/Telegram ofCSVwijziging. Volledige mergegate blijft buiten deze beelditeratie.

### Correctie 16 oktober: één patroon langs de gemengde trajecten

PO meldt resterend springen rond09:00 op de Noordzee westelijk Alkmaar/Noordwijk, bevestigt4390/live en daarna dat het weg is. Diagnose in vasteU82data: lokale en gemiddelde snelheid verschillen, waardoor twee textuurbanken een verschoven afbeelding van dezelfde wolk tonen. Bij09:00 op3,5E/52,5N is de geschatte bankafstand circa3,16km. De vorige fix voorkwam wereldvaste herhaling, maar niet het zichtbaar in-/uitfaden van twee verschoven exemplaren.

Shader mengt nu de twee teruggevolgde posities en bemonstert daar één wolkenpatroon. Menging van wolkentypen blijft optisch; die coördinaten worden niet gemengd. Levensduur/ankers/lokale terugtrace ongewijzigd. Eén procedurele textuurberekening in plaats van twee; geen nieuwe performanceclaim. Voor/na31 exacte frames08:45–09:15 op4398, relevante beelden zelf bekeken. Live4390 dezelfde code, PO bevestigt fix.

Nieuwe GPU-regressie met verschillende lokale en gemiddelde snelheid: oude beeldcrossfade alpha-MAE20,314 t.o.v. één coherent patroon (verwachte exit1), nieuwe0,00986 (exit0). Uniforme translatie over meerdere cycli, type-menging, compressie/dilutie, tijdgrenzen, reseek en direct/cache blijven groen. Oracle nu reviewbaar in web/scripts/check-cloud-map.mjs: direnv exec . node web/scripts/check-cloud-map.mjs http://127.0.0.1:4398/. Typecheck en23 gerichte unit-tests exit0. Bij bijwerken van de oracle eerst de korte translatieproef voorzien van de echte bewegende ankers, daarna de reseek-input gelijkgetrokken; eerdere falende receipts bewaard.

Scratch: web/tmp/orkestrator/cloud-morning-20261016/. Geen prod/VM/Telegram/CSVwijziging. Volledige mergegate niet uitgevoerd tijdens deze beeldproef.
