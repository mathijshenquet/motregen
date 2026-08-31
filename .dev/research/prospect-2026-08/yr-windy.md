# Prospect: Yr.no + Windy.com

_Onderzoek uitgevoerd op 31 augustus 2026. Alleen publieke bronnen. “Gemeten” betekent een op de peildatum zichtbare storetelling of een door de organisatie gerapporteerde meting; “geclaimd” is marketing/producttekst van de aanbieder; “geschat” komt van een externe trafficprovider. Reviews zijn concrete signalen, geen representatieve enquête._

## Samenvatting

Yr en Windy lossen bijna tegenovergestelde taken goed op. Yr beantwoordt eerst de vraag _“wat krijg ik hier en wanneer?”_ en laat de gebruiker daarna kiezen tussen Sky, Table en Graph. Windy begint bij _“welk atmosferisch veld wil ik onderzoeken?”_ en geeft rechtstreeks toegang tot tientallen lagen, hoogteniveaus en modellen. Voor Motregen is de kansrijke middenpositie daarom niet “half zoveel Windy”, maar: Yr-snelheid als standaard, Windy-diepte achter één bewuste handeling.

| | Yr.no | Windy.com |
|---|---|---|
| Kern | Locatiegerichte verwachting en handelingsperspectief | Kaartgerichte analyse en zelf interpreteren |
| Sterkste patroon | De relevante korte-termijnmodule verschijnt alleen als er neerslag wordt verwacht | Dezelfde tijd/plek door meerdere lagen, hoogten en modellen bekijken |
| Bereikssignaal | 10 mln+ Android-downloads; officieel gemiddeld 11,3 mln wekelijkse bezoekers/bezoeken in 2025 | 50 mln+ Android-downloads; 816 duizend Android-reviews |
| Grootste UX-risico | Een geliefde grafiek veranderen schaadt aangeleerd scan-gedrag | Veel lagen zonder stabiele labels, groepering en sessiegeheugen voelt overweldigend |

## 1. Yr.no

### Feature-inventaris

**Verwachting en meteogram.** Yr biedt drie gelijkwaardige ingangen naar dezelfde locatieverwachting: een geanimeerde **Sky**-weergave die uur voor uur kan worden verschoven, een compacte **Table** en een meer informatiedichte **Graph/meteogram**. De Android-storetekst noemt daarnaast dag- en uurdetail, een langetermijnverwachting en de grafiek; de app heeft ook locatiezoeker, favorieten, widgets en een afgeslankte Wear OS-versie. Onder “Around you” staan waar data beschikbaar zijn onder meer UV, luchtvervuiling, pollen, waarnemingen en webcams. **Geclaimd door Yr/NRK**, bevestigd door de actuele storepresentatie ([Google Play](https://play.google.com/store/apps/details?id=no.nrk.yr&hl=en_US)).

De ontwerpwaarde zit niet alleen in de illustraties. Drie vaste vormen bedienen drie leestaken: Sky voor een onmiddellijk mentaal beeld, Table voor exacte waarden en Graph voor patronen en timing. Een externe UX-analyse vat dit terecht samen als beperkte personalisatie die keuze geeft zonder een instellingenlabyrint te maken ([GoodUX-analyse](https://goodux.appcues.com/blog/yrs-multi-view-forecasts)).

**“Regn nå” / live neerslag.** Bij verwachte regen of sneeuw toont Yr een radargebaseerde neerslagverwachting voor de komende **90 minuten**. De actuele uitleg zegt: resolutie **1 × 1 km**, update **elke vijf minuten**, en alleen in het Nordics-dekkingsgebied. De module verschijnt dus conditioneel en staat los van de reguliere modelverwachting; die twee kunnen elkaar tegenspreken doordat ze verschillende databronnen en updatecycli hebben. **Geclaimde productspecificaties** ([Yr-uitleg over de verwachting](https://hjelp.yr.no/hc/en-us/articles/360004008874-Weather-forecasts-on-Yr-how-are-they-made)). Dit precieze Yr-nowcastproduct is daardoor geen directe bron voor Nederland, maar het interactiepatroon is zeer relevant voor Motregen.

**Kaarten en langere horizon.** De app heeft neerslag/radar, weersverwachting en aanvullende kaartinformatie; in 2026 werd een driedaagse verwachting aan de neerslagkaart toegevoegd en kwam er een zeewatertemperatuurlaag. Yr biedt daarnaast een experimenteel onderseizoensperspectief tot 21 dagen, nadrukkelijk anders gepresenteerd dan een exact uur-tot-uurbericht. Dat laatste illustreert een nuttig principe: onzekerere horizons krijgen een andere visuele taal in plaats van schijnprecisie ([App Store-versiegeschiedenis](https://apps.apple.com/us/app/yr-no/id490989206), [MET-rapport over de 21-daagse verwachting](https://www.met.no/publikasjoner/met-info/_/attachment/inline/ac7005fb-a7c6-4727-b240-37fe2866479c%3Ab11f9425969629dbd5411e6490e247dc771adefa/21-dagers%20varsel%20p%C3%A5%20Yr%20-%20Fra%20forskning%20til%20tjeneste%2033_2025.pdf)).

**API-openheid.** Belangrijk onderscheid: er is niet meer simpelweg een “Yr API”; de publieke bron is de **MET Weather API** van het Noorse Meteorologisch Instituut. `Locationforecast 2.0` geeft wereldwijde puntverwachtingen in GeoJSON; `Nowcast 2.0` is regionaal. De data zijn gratis, ook commercieel te gebruiken, doorgaans onder NLOD 2.0/CC BY 4.0. Daar staan harde operationele voorwaarden tegenover: herkenbare User-Agent met contactinformatie, bronvermelding, caching tot `Expires`, maximaal vier decimalen in coördinaten en bij meer dan 20 requests per seconde vooraf overleg. Er is geen SLA. **Gemeten in documentatie en met een publieke API-fetch; licentie/voorwaarden zijn primaire bron** ([API-overzicht](https://api.met.no/), [licentie](https://docs.api.met.no/doc/License.html), [Terms of Service](https://api.met.no/doc/TermsOfService)). Voor Motregen is dit vooral een bruikbare open modelbron of fallback, niet een vervanging voor de eigen KNMI-radar/pySTEPS-keten.

### Design: waarom de eenvoud werkt

- De app begint bij één plaats en één chronologische vraag, niet bij een laag of model.
- De belangrijkste variabelen staan in één leesrichting; detail is een andere weergave van dezelfde tijdlijn, geen nieuwe conceptuele ruimte.
- Sky maakt tijd tastbaar met horizontaal vegen en een veranderende hemel. Labels naast iconen verminderen interpretatiegokken.
- De live-neerslagmodule komt alleen op als ze relevant is. Zo kost “geen regen” vrijwel geen interface-ruimte.
- Gebruikers kunnen een favoriete startweergave kiezen. Dat respecteert zowel snelle scanners als grafieklezers zonder de standaard vol te bouwen.

De eenvoud is dus **progressive disclosure**, niet inhoudelijke armoede. Juist daarom veroorzaken wijzigingen aan de grafiek relatief veel weerstand: vaste gebruikers hebben er een snelle visuele routine mee opgebouwd.

### Populariteit

- **Gemeten:** Google Play toont **10 mln+ downloads**, **4,0/5** en **49,2 duizend reviews** voor package `no.nrk.yr` op de peildatum ([Google Play](https://play.google.com/store/apps/details?id=no.nrk.yr&hl=en_US)). De downloadwaarde is een drempel, geen exact aantal actieve gebruikers.
- **Gemeten, storefront-specifiek:** Apples publieke VS-lookup gaf **4,28/5 bij 202 ratings**; de Nederlandse App Store toonde **3,7/5 bij 76 beoordelingen**. Apple telt per land, dus deze aantallen mogen niet worden opgeteld of als wereldwijd bereik worden gelezen ([Apple lookup](https://itunes.apple.com/lookup?id=490989206&country=us), [Nederlandse App Store](https://apps.apple.com/nl/app/yr/id490989206)).
- **Officieel gemeten/geclaimd:** MET rapporteert voor 2025 gemiddeld **11,3 miljoen wekelijkse bezoekers/bezoeken**, tegenover 10,9 miljoen in 2024, en een weekrecord van **15,9 miljoen unieke bezoeken**. In dezelfde Ipsos-meting zei **59%** van de Noorse bevolking Yr minstens dagelijks te bekijken en had **65%** van de bevolking het meeste vertrouwen in Yr. De precieze web/app-deduplicatie is niet gepubliceerd, dus dit is geen MAU-cijfer ([MET-jaarverslag 2025, p. 37](https://www.met.no/om-oss/_/attachment/inline/ef4ca1dd-f64e-497a-bd0a-aaa32123260f%3Acc07230a0b7e64d8a10c5080a0ebbca10dd5a9bd/MET%20%C3%A5rsrapport%202025%20med%20regnskap.pdf)).

Conclusie: Yr is niet alleen een Noorse niche. De Android-installbase is groot en de thuismarkt kent uitzonderlijk hoge dagelijkse penetratie en merktrust.

### Sentiment: concrete signalen

1. **Snel en helder geliefd.** Een Poolse iOS-review noemt de app intuïtief, goed leesbaar en zonder overbodige toevoegingen; de instelbare Graph-startpagina geeft de schrijver binnen enkele seconden een driedaags beeld ([App Store Polen](https://apps.apple.com/pl/app/yr/id490989206?platform=iphone&see-all=reviews)).
2. **Meerdere leesvormen werken.** Een Britse buitensporter prijst juist de combinatie Sky, Table en Graph als visueel en makkelijk te verwerken; andere reviews noemen het vegen door de hemel bruikbaar voor skiën en eilandenweer ([App Store VK](https://apps.apple.com/gb/app/yr-no/id490989206?platform=iphone&see-all=reviews)).
3. **Eenvoud en publieke uitstraling scheppen vertrouwen.** Een Android-review waardeert dat de app basaal, advertentievrij en zonder verplichte locatiepermissie bruikbaar is. Dat is een individuele waarneming, geen privacy-audit ([Google Play](https://play.google.com/store/apps/details?id=no.nrk.yr&hl=en_US)).
4. **De grafiek-redesigns raken een kernworkflow.** Nederlandse reviews zeggen dat de langere grafiek minder scanbaar werd en wolkendekking verloor; een Britse reviewer meldt bovendien dat Table zijn voorkeurs-Graph vervangt. Meerdere gebruikers vragen de oude gecombineerde grafiek terug ([App Store Nederland](https://apps.apple.com/nl/app/yr/id490989206?platform=iphone&see-all=reviews), [App Store VK](https://apps.apple.com/gb/app/yr-no/id490989206?platform=iphone&see-all=reviews)).
5. **Onnauwkeurige regen en regressies blijven pijnpunten.** Recente reviews melden gemiste zware buien, een kapotte widgetindeling en locatieproblemen. Deze anekdotes meten geen forecast skill, maar tonen wel dat “betrouwbaar in één oogopslag” snel omslaat als data en UI niet overeenkomen met wat buiten gebeurt ([App Store Nederland](https://apps.apple.com/nl/app/yr/id490989206?platform=iphone&see-all=reviews), [Google Play](https://play.google.com/store/apps/details?id=no.nrk.yr&hl=en_US)).

## 2. Windy.com

_Afbakening: dit gaat om de rode app **Windy.com** van Windyty SE, package `com.windyty.android`, niet om de concurrerende blauwe Windy.app. Verwarring tussen die twee vervuilt review- en bereikcijfers gemakkelijk._

### Feature-inventaris

**Lagen en kaartwerkruimte.** Windy is in de eerste plaats een wereldkaart met een tijdslider, kleurveld, legenda, waarde-picker, optionele isolijnen en geanimeerde stroming. De actuele Android-presentatie claimt **51 globale weerkaarten** en **16 hoogteniveaus** van oppervlak tot 13,5 km/FL450. De zichtbare hoofdgroepen zijn wind, temperatuur, regen/sneeuw, wolken/luchtvaart, golven/zee, luchtkwaliteit, droogte en waarschuwingen. Daaronder vallen onder meer windstoten, regen/onweer en -accumulatie, radar en satelliet, druk, CAPE, sneeuw, luchtkwaliteit, branden, zeegang en getij. Ook zijn stations, gemelde wind/temperatuur, luchthavens, webcams, radiosondes en sportspots als puntenlagen beschikbaar. **Gemeten in het actuele menu en geclaimd in de storetekst** ([Windy-menu](https://www.windy.com/menu), [Google Play](https://play.google.com/store/apps/details?id=com.windyty.android&hl=en-GB&gl=US)).

**Particles.** Wind- en golfvectoren kunnen als bewegende deeltjes over het kleurveld worden gelegd. Ze communiceren richting, samenhang en snelheid veel sneller dan losse pijlen, terwijl kleur de magnitude draagt; isolijnen kunnen daar nog bovenop. De animatie is schakelbaar en de intensiteit/snelheid instelbaar. Dit is een kernonderdeel van Windy’s visuele identiteit, niet alleen decoratie ([Windy Map Forecast-documentatie](https://api.windy.com/map-forecast/docs), [parameterdocumentatie](https://api.windy.com/map-forecast/tutorials/parameters)). Motregen bezit dit patroon al; Windy’s extra les is de onafhankelijke bediening van veld, particles en isolijnen.

**Modelkeuze en vergelijking.** Wereldwijd zijn **ECMWF, GFS en ICON** beschikbaar; regioafhankelijk komen onder meer ICON-EU/D2, AROME, UKV, HRRR, NAM, HRDPS en ACCESS erbij. Een plek kan per model worden bekeken of in “Compare forecasts”, waar temperatuur, wind en neerslag naast elkaar staan. Dat maakt modelovereenstemming zichtbaar en voorkomt dat één deterministische lijn als waarheid voelt. **Geclaimd/gedocumenteerd door Windy** ([Google Play](https://play.google.com/store/apps/details?id=com.windyty.android&hl=en-GB&gl=US), [uitleg modelvergelijking](https://community.windy.com/topic/26304/understanding-the-compare-forecast-feature-in-windy-com/10?page=20)).

**Meteogram, airgram en soundings.** Voor een gekozen punt biedt Windy een meteogram met temperatuur/dauwpunt, wind en windstoten, druk, neerslag en wolkendekking per hoogte. De airgram zet de verticale atmosfeer tegen de tijd uit. Via rechtsklik of lang indrukken is een Skew-T/sounding te openen; zowel waargenomen radiosondes als model-soundings zijn beschikbaar. Daarmee zijn inversies, wolkenbasis, verzadiging, thermiek, shear en neerslagtype te onderzoeken. Dit is waardevol voor luchtvaart en gevorderde buitengebruikers, maar te gespecialiseerd als standaardweergave ([sounding-instructie](https://community.windy.com/topic/8968/where-to-find-the-sounding-forecast), [Windy-uitleg over soundings](https://www.windy.com/articles/43897)).

**Premium.** De actuele Nederlandse App Store noemt als Premium: uurlijkse stappen, tot 15 dagen vooruit, 4–6 modelupdates per dag, 24-uurs radar/satellietloops, een jaar archief, extra kaarten en modelvergelijking. De losse web-landingspagina vermeldt nog 10 dagen en 12-uursloops; de eigen productteksten zijn dus niet volledig synchroon. In Nederland toont Apple meerdere in-app-prijzen, waaronder €25,99 en €38,99, zonder op de lijst ondubbelzinnig looptijd en renewal te koppelen. **Geclaimd; prijs/productmatrix vereist verificatie in de checkout** ([Nederlandse App Store](https://apps.apple.com/nl/app/windy-com-weather-radar/id1161387262), [Premium-landingspagina](https://www.windy.com/nl/subscription)). Gratis blijft al rijk en volgens Windy advertentievrij; Premium verkoopt vooral hogere temporele resolutie, langere loops/historie en specialistische diepte ([Google Play](https://play.google.com/store/apps/details?id=com.windyty.android&hl=en-GB&gl=US)).

### Waarom het krachtig én overweldigend is

Windy behoudt plek en tijd terwijl de gebruiker van veld of model wisselt. Daardoor kunnen gevorderden zelf hypotheses toetsen: eerst radar, dan wind op verschillende hoogtes, vervolgens modelvergelijking en sounding. De combinatie van kleur, particles en tijdanimatie maakt ruimtelijke dynamiek uitzonderlijk leesbaar.

Dezelfde architectuur vraagt echter dat de gebruiker tegelijk begrijpt wat een **laag**, **hoogte**, **model**, **tijdstap**, **isolijn** en **observatie versus verwachting** is. Met 51 kaarten zijn tekstlabels, semantische groepering, zoekbaarheid en persistentie geen afwerking maar navigatie-infrastructuur. Wanneer Windy grote beeldtegels gebruikt, labels verbergt of terugvalt op ECMWF, wordt elke extra mogelijkheid een extra herstelhandeling.

### Populariteit

- **Gemeten:** Google Play toont **50 mln+ downloads**, **4,7/5** en **816 duizend reviews** voor de juiste Windy.com-app; de store rangschikte hem op de peildatum als nummer 7 in “top grossing weather” ([Google Play](https://play.google.com/store/apps/details?id=com.windyty.android&hl=en-GB&gl=US)).
- **Gemeten, storefront-specifiek:** Apples VS-store toont afgerond **4,8/5 bij 79 duizend ratings**; een directe publieke lookup leverde 4,823 bij 78.504 ratings. De Nederlandse storefront toont **4,7/5 bij 5,7 duizend ratings** ([App Store VS](https://apps.apple.com/us/app/windy-com/id1161387262), [Apple lookup](https://itunes.apple.com/lookup?id=1161387262&country=us), [App Store Nederland](https://apps.apple.com/nl/app/windy-com-weather-radar/id1161387262)).
- **Geschat:** HypeStat schat, op basis van onder meer Similarweb-signalen, circa **39,3 miljoen webbezoeken per maand** en circa 1,3 miljoen dagelijkse bezoekers. Dit is richtinggevend, geen first-party analytics, en sluit appgebruik uit ([HypeStat](https://hypestat.com/info/windy.com)). Windy zelf zegt alleen dat zijn API/data door “miljoenen” worden gebruikt ([Windy API](https://api.windy.com/)).

Conclusie: Windy.com is qua mobiele installbase duidelijk groter dan Yr en heeft een opvallend grote reviewbasis. De cijfers bewijzen bereik, niet hoeveel mensen de specialistische functies daadwerkelijk gebruiken.

### Sentiment: concrete signalen

1. **Diepte en modeltransparantie zijn de hoofdlofzang.** Amerikaanse iOS-reviewers prijzen dat bronmodellen zichtbaar en vergelijkbaar zijn, dat lagen configureerbaar zijn en dat de tijdanimatie ruimtelijke ontwikkeling begrijpelijk maakt. De 4,8-score bij tienduizenden ratings ondersteunt dat dit meer is dan één enthousiaste forumgroep ([App Store VS](https://apps.apple.com/us/app/windy-com/id1161387262?see-all=reviews)).
2. **Professionals koppelen de kaart aan beslissingen.** Reviews beschrijven dagelijks gebruik door piloten, vissers, observatoria en vrachtwagenchauffeurs; een chauffeur gebruikt windinformatie zelfs om routes met omwaairisico te vermijden. Dat zijn individuele claims, maar ze tonen de hoge besliswaarde van kaart + tijd + laag ([App Store VS](https://apps.apple.com/us/app/windy-com/id1161387262?platform=iphone&see-all=reviews)).
3. **De laagkiezer kan een “bos van plaatjes” worden.** Communitygebruikers melden dat grote tegels minder scanbaar zijn dan tekst, verwante lagen niet bij elkaar staan, labels verdwijnen en het zijpaneel te veel kaart bedekt. Eén thread heeft tientallen vergelijkbare reacties; nog steeds zelfselectie, maar wel een duidelijk herhaald patroon ([communitythread over de interface](https://community.windy.com/topic/32400/i-do-not-like-the-new-interface/28), [thread over de laagkiezer](https://community.windy.com/topic/26913/new-ui-really-bad)).
4. **Niet onthouden van context maakt kracht omslachtig.** Een betalende iOS-gebruiker moet naar eigen zeggen bij elke start plek, zoom, model, interval en tijd opnieuw kiezen; een andere communityvraag bevestigt dat Windy in sommige flows naar ECMWF terugvalt. Dit is precies het soort frictie dat bij veel keuzemogelijkheden snel vermenigvuldigt ([App Store VS](https://apps.apple.com/us/app/windy-com/id1161387262?see-all=reviews), [Windy Community](https://community.windy.com/topic/41494/how-to-stop-automatic-default-to-ecmwf-model/2)).
5. **Premium wordt gewaardeerd, maar prijs en paywall schuren.** Sommige reviewers noemen het een zeldzaam abonnement dat zijn geld waard is; anderen haakten af na een verhoging van circa $25,99 naar $34,99 per jaar of vinden toekomstige radar te sterk achter Premium zitten. Windy verdedigt de verhoging met datalicenties, radaruitbreiding en advertentievrij ontwikkelen ([prijsdiscussie](https://community.windy.com/topic/37725/35-premium-subscription-price-hike/5), [App Store VS](https://apps.apple.com/us/app/windy-com/id1161387262?see-all=reviews)).

## 3. Implicatie voor Motregen

De gewenste middenpositie kan scherp worden geformuleerd:

1. **Start als Yr:** één locatie, één naadloze tijdlijn, “regen nu” alleen wanneer relevant en een antwoord dat zonder meteorologische voorkennis leesbaar is.
2. **Verdiep als Windy:** laat dezelfde plek en tijd staan wanneer de gebruiker kaartlaag, bron of detail opent; toon specialistische informatie in een drawer of expertmodus.
3. **Neem onzekerheid serieus:** laat bronovergangen en modelverschil zien als vertrouwen/predictability, niet als een rij concurrerende lijnen die de gebruiker zelf moet oplossen.
4. **Bewaar de werkcontext:** favoriete plek, zoom, gekozen laag en detailniveau moeten terugkomen. Windy laat zien hoeveel erger kleine state-verliezen worden naarmate een product krachtiger is.

## Beter goed gestolen

1. **Conditionele “regen nu”-kaart van Yr.** Waarom: de 90-minutenmodule verschijnt precies wanneer zij besliswaarde heeft en houdt droog weer rustig. **Implementatie-omvang: klein–middel** — Motregen heeft radar/pySTEPS al; nodig zijn presentatieregels, een compacte neerslagcurve en nette fallback bij ontbrekende of tegenstrijdige data.
2. **Een vaste, instelbare startweergave zoals Yr’s Sky/Table/Graph.** Waarom: gebruikers kunnen een snelle samenvatting, uurtabel of informatiedichte grafiek kiezen zonder drie verschillende navigatiemodellen te leren. **Implementatie-omvang: middel** — bestaande tijdlijn en uurtabel delen één datamodel, plus voorkeurssynchronisatie en regressietests voor grafiekleesbaarheid.
3. **Windy’s modelvergelijking, teruggebracht tot een voorspelbaarheidsbadge.** Waarom: overeenstemming of divergentie tussen nowcast, blend en HARMONIE is nuttiger voor een breed publiek dan een kale modelselector. **Implementatie-omvang: middel–groot** — definieer een uitlegbare agreement-score per tijdvak, visualiseer afwijking en bied pas na tikken de bronlijnen.
4. **Windy’s persistente kaartwerkruimte, maar met een korte gecureerde laagset.** Waarom: plek, zoom, tijd, laag en particle-instelling onthouden geeft expertkracht zonder dat elk bezoek opnieuw configuratiewerk wordt. **Implementatie-omvang: middel** — lokale state is eenvoudig; account-sync, migraties en geldige fallbacks bij veranderde lagen maken het robuustere deel.
5. **Een expert-peek naar verticale structuur, geïnspireerd op Windy soundings.** Waarom: een compacte “regen/sneeuw/wind op hoogte”-uitleg kan bij winterweer of harde wind veel verklaren zonder standaard een Skew-T te tonen. **Implementatie-omvang: groot** — verticale modelvelden ontsluiten, diagnostiek valideren en eerst een begrijpelijke samenvatting bouwen; de volledige sounding blijft hooguit een secundaire long-press/tool.
