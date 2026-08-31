# DWD WarnWetter — prospectsweep voor motregen.nl

**Peildatum:** 31 augustus 2026  
**Target:** DWD WarnWetter voor iOS en Android  
**Doel:** feature-inventaris, populariteit, sentiment en steelwaardige productpatronen

## Samenvatting

WarnWetter is niet vooral sterk doordat het méér weerdata toont, maar doordat het officiële waarschuwingen omzet in een herkenbare keten: **landelijke situatie → gekleurde of gearceerde regio → waarschuwing op een gekozen punt → volledig detail → persoonlijk instelbare push**. Die keten is voor motregen.nl waardevoller dan het inmiddels wat ambtelijke visuele ontwerp.

- **[Gemeten]** De Duitse App Store toont **4,6/5 uit circa 35,1 duizend beoordelingen en #4 in Weer**; Google Play toont in de kop **3,8/5 uit 68,1 duizend reviews en 5 mln.+ downloads**. **[Extern gemeten]** AppBrain zet Android op #4 onder gratis weerapps en #5 naar omzet; WarnWetter is dus op beide platformen een Duitse top-vijf-app, maar met een opvallend zwakkere Android-score. ([Apple App Store](https://apps.apple.com/de/app/dwd-warnwetter/id986420993), [Google Play](https://play.google.com/store/apps/details?id=de.dwd.warnapp), [AppBrain](https://www.appbrain.com/app/warnwetter/de.dwd.warnapp))
- **[Geclaimd]** De DWD meldde in juni 2025 circa **2 miljoen actieve gebruikers**, tot **4,5 miljoen gebruiksmomenten per dag** bij extreem weer, ruim **950 miljoen pushwaarschuwingen in 2024** en ruim **1 miljoen ontvangen gebruikersmeldingen**. Dat zijn DWD-cijfers, geen onafhankelijk gecontroleerde analytics. ([DWD-persbericht, 10 juni 2025](https://www.dwd.de/DE/presse/pressemitteilungen/DE/2025/20250610_10-jahre_warnwetterapp.pdf?__blob=publicationFile&v=2))
- **[Gemeten]** De gratis versie bevat de feitelijke waarschuwingenkern, locatie/favorieten, configureerbare push en widgets; de huidige Vollversion kost eenmalig **€2,49** en ontsluit kaarten, radar/modelverwachting, uitgebreide locatiedetails en specialistische producten. ([DWD-productpagina](https://www.warnwetterapp.de/), [Apple App Store](https://apps.apple.com/de/app/dwd-warnwetter/id986420993))
- **[Gemeten, historische prijs]** De in de opdracht genoemde **€0,99** was een tijdelijke halveringsactie in augustus 2021; de juridisch afgedwongen betaalversie begon eind 2017 op €1,99 en kost nu €2,49. ([prijsactie 2021](https://www.appgefahren.de/warnwetter-vollversion-kostet-aktuell-nur-99-cent-statt-199-euro-305824.html), [DWD-jaarverslag 2018](https://www.dwd.de/EN/ourservices/annual_reports_dwd/annual_reports_pdf/annual_report_2018.pdf?__blob=publicationFile&v=4))
- **[Geschat]** De kernreden voor de populariteit is de combinatie van bronvertrouwen, advertentievrij gebruik, goede kortetermijnradar en een eenmalige lage prijs; de grootste productrisico’s zijn ervaren lokale onnauwkeurigheid, alarmmoeheid, onverklaarde radarartefacten en platformfrictie.

## Bewijsstatus en methode

- **Gemeten:** rechtstreeks waargenomen in actuele storevermeldingen, officiële screenshots, openbare ranglijsten of gedateerde publicaties.
- **Geclaimd:** cijfer of werking die de DWD zelf publiceert, zonder onafhankelijke verificatie.
- **Geschat:** afleiding uit meerdere bronnen of externe modellering; geen hard product- of gebruikscijfer.

De sweep combineert officiële DWD- en gerechtelijke bronnen, live storepagina’s en openbare reviews/discussies. De geciteerde reviews zijn concrete signalen, geen representatieve sentimentsteekproef. Storestanden en hitlijsten fluctueren; de cijfers hieronder zijn momentopnamen op de peildatum.

## 1. Feature-inventaris

### 1.1 Informatiearchitectuur

**[Gemeten in officiële App-Store-screenshots]** De startpagina is een configureerbaar dashboard van grote producttegels — onder meer waarschuwingen, kaarten, onweersmonitor, gebruikersmeldingen, wind en bosbrand — gevolgd door een favoriete locatie. De gebruiker kiest dus eerst een *taak* of *risico*, niet eerst een losse meteorologische parameter. Het dashboard is compact maar geeft via mini-kaarten al toestand en ernst prijs. ([Apple App Store](https://apps.apple.com/de/app/dwd-warnwetter/id986420993))

**[Geclaimd]** De startpagina kan worden gepersonaliseerd; favorieten omvatten de huidige GPS-locatie en zelfgekozen plaatsen. De app ondersteunt licht/donker, verschillende eenheden en delen via sociale kanalen. ([DWD-productpagina](https://www.warnwetterapp.de/))

### 1.2 Waarschuwingskaart en Warnregionen-arcering

**[Gemeten/geclaimd]** De kernkaart deelt Duitsland tot op gemeenteniveau op in waarschuwingsregio’s. De normale niveaus zijn geel, oranje, rood en violet; groen betekent geen actieve waarschuwing. Een **gearceerde** regio is geen extra ernstniveau, maar een *Vorabinformation Unwetter*: zeer gevaarlijk of extreem weer is mogelijk, terwijl gebied, timing en intensiteit nog onvoldoende zeker zijn. Daarmee codeert de kaart niet alleen ernst, maar ook **onzekerheidsstatus**. ([DWD-kleurenschaal](https://www.wettergefahren.de/warnungen/farbskala.html))

**[Gemeten in officiële screenshots]** De kaart gebruikt daarnaast herhaalde gevarenpictogrammen binnen de gekleurde vlakken. Een tik op een plek opent een kaart bovenop de kaart met:

- gevarentype en pictogram;
- geldigheidsvenster;
- eventueel hoogtebereik;
- concrete bandbreedtes, zoals windstoten in km/u, m/s, knopen en Beaufort;
- een lopende beschrijving met lokale uitzonderingen.

Dit is een sterk progressive-disclosurepatroon: de overview blijft scanbaar, maar één tik beantwoordt “wat betekent dit hier?”. ([Apple App Store](https://apps.apple.com/de/app/dwd-warnwetter/id986420993))

### 1.3 Kaarten en lagen

De onderstaande inventaris is **[geclaimd door DWD/store]**, tenzij anders vermeld. ([DWD-productpagina](https://www.warnwetterapp.de/), [Google Play](https://play.google.com/store/apps/details?id=de.dwd.warnapp))

| Product of laag | Presentatie en horizon | Tier |
|---|---|---|
| Officiële weerwaarschuwingen | Regiokleuren/arcering, typefilters, gemeente- en puntdetail | Gratis |
| Natuurgevaren | Hoogwater, stormvloed, lawines; daarnaast kust- en binnenmeerwaarschuwingen | Gratis |
| Onweers-/neerslagtrajecten | Verwachte banen van onweerscellen en neerslaggebieden | Gratis basis; uitgebreid onweersmonitor in Vollversion |
| Neerslag | Radar plus model; onderscheid regen, sneeuw, natte sneeuw, hagel en inmiddels ijzel | Vollversion |
| Bewolking | Satellietwaarneming en modelverwachting | Vollversion |
| Bliksem | Bliksemdetectie en verwachting | Vollversion |
| Wind | Modelverwachting; combineerbaar met andere lagen | Vollversion |
| Temperatuur | Modelveld | Vollversion |
| Stations/meetpunten | Schakelbare metingen en verwachtingen voor weerbeeld, temperatuur, wind en neerslag | Vollversion |
| Risico-indexen | Bosbrand, graslandbrand, UV, thermische belasting en waarschuwingrelevante modelproducten | Vollversion |
| Specialistisch | Straatweer, pollen, tekstberichten voor deelstaten/kust/zee/Alpen/Bodensee | Vollversion |
| Crowdsourcing | Weer- en fenologiemeldingen bekijken en met foto toevoegen | Vollversion |

**[Gemeten in officiële screenshots]** Lagen worden als ronde knoppen rechts op de kaart bediend. De legenda blijft boven de kaart zichtbaar en maakt naast intensiteit ook neerslagtype expliciet. Meerdere elementen kunnen worden gecombineerd, bijvoorbeeld neerslag, bewolking, temperatuur en wind.

### 1.4 Radaranimatie en tijdlijn

**[Gemeten/geclaimd]** Neerslag heeft een vloeiende tijdregel die van **−24 uur via “Aktuell” naar +24 uur en vervolgens +7 dagen** loopt. De laag combineert radarwaarneming en modelverwachting op één bediening; de officiële omschrijving belooft een naadloze overgang van verleden naar toekomst, maar de screenshot markeert niet nadrukkelijk waar observatie overgaat in model. ([DWD-jaarverslag 2018](https://www.dwd.de/EN/ourservices/annual_reports_dwd/annual_reports_pdf/annual_report_2018.pdf?__blob=publicationFile&v=4), [Apple App Store](https://apps.apple.com/de/app/dwd-warnwetter/id986420993))

**[Geschat]** De grootste waarde zit niet in de animatie zelf, maar in het gedeelde tijdanker: dezelfde gekozen tijd bestuurt kaart, legenda en gecombineerd weerbeeld. Voor motregen.nl is een expliciete bronovergang (radar → pySTEPS → HARMONIE) een kans om dit patroon betrouwbaarder uit te voeren.

### 1.5 Detail per locatie

**[Gemeten in officiële screenshots]** Een favorietdetail heeft afzonderlijke tabs **Warnungen** en **Wetter**. Bovenaan staat een horizontaal rijtje dagkaarten met icoon, minimum/maximum, neerslagsom en zonuren; daaronder een horizontale uurlijn. Een verticale cursor koppelt alle grafieken en toont op hetzelfde tijdstip onder meer:

- temperatuur en neerslagintensiteit;
- neerslagkans;
- wind, windstoten en richting;
- daarnaast volgens DWD dauwpunt, luchtvochtigheid, luchtdruk en zonneschijnduur;
- zons- en maanopkomst/-ondergang.

**[Geclaimd]** De horizon is maximaal zeven dagen, met voor enkele variabelen ook metingen uit voorgaande dagen. De favoriete locatie vormt tevens het object waaraan waarschuwingen, pushinstellingen en widgets worden gekoppeld. ([DWD-productpagina](https://www.warnwetterapp.de/))

### 1.6 Pushwaarschuwingen

**[Gemeten/geclaimd]** Push is per locatie te configureren op:

- een globale minimale waarschuwingsstufe;
- afzonderlijke drempels per gevaar, zoals onweer, storm, gladheid/ijzel en sneeuw;
- een aparte schakelaar voor voorinformatie/voorwaarschuwingen;
- waarschuwingen voor de actuele GPS-locatie, ook tijdens reizen;
- inmiddels ook onder meer hoogwaterzones, stormvloed en stijgende pollenbelasting.

Het instellingenbeeld gebruikt dezelfde geel-oranje-rood-violette schaal als de kaart. De gebruiker ziet daardoor vooraf hoeveel gevoeligheid een instelling impliceert. ([Apple App Store](https://apps.apple.com/de/app/dwd-warnwetter/id986420993), [Google Play](https://play.google.com/store/apps/details?id=de.dwd.warnapp))

**[Geclaimd]** De DWD verstuurde in 2024 meer dan 950 miljoen pushes. Dat bewijst schaal, niet noodzakelijk tevredenheid of afleverbetrouwbaarheid. ([DWD-persbericht 2025](https://www.dwd.de/DE/presse/pressemitteilungen/DE/2025/20250610_10-jahre_warnwetterapp.pdf?__blob=publicationFile&v=2))

### 1.7 Widgets

**[Geclaimd]** Configureerbare widgets horen volgens de huidige DWD-lijst bij de gratis versie. Ze kunnen informatie voor gekozen locaties buiten de app tonen. ([DWD-productpagina](https://www.warnwetterapp.de/))

**[Gebruikerswaarneming]** Een Google Play-review noemt afzonderlijk een dag- en vijfdaagse widget en klaagt dat de locatiekop dubbel verschijnt wanneer beide naast elkaar staan. Dat bevestigt nuttige glanceable varianten, maar ook dat configuratie en informatiedichtheid niet volledig zijn afgewerkt. ([Google Play-review van 28 december 2023](https://play.google.com/store/apps/details?id=de.dwd.warnapp))

## 2. Gratis, Vollversion en juridische geschiedenis

### Huidige scheiding

| Gratis | Vollversion, eenmalig €2,49 |
|---|---|
| Officiële waarschuwingen tot gemeenteniveau, waarschuwingdetail, favoriete locaties/GPS, instelbare push, natuurgevaar- en kust/meerwaarschuwingen, celtrajecten, noodweervideo’s, widgets en configureerbare startpagina | Volwaardige weerkaart en zeven dagen verwachting, radar/model/satelliet/bliksem/wind/temperatuur, uitgebreide locatiedetails, tekstberichten, stations, risico-indexen, onweersmonitor, straatweer, pollen en gebruikersmeldingen |

**[Gemeten]** De appdownload is gratis; €2,49 is een in-app-aankoop voor de volledige functieomvang. De aankoop werkt op meerdere apparaten van hetzelfde storeaccount; Family Sharing is volgens DWD alleen op iOS mogelijk. Medewerkers en vrijwilligers in rampen-, bevolkings- en milieubescherming kunnen na toetsing gratis de identieke Vollversion krijgen. ([DWD-productpagina](https://www.warnwetterapp.de/), [Vollversion voor de rampenbestrijding](https://www.warnwetterapp.de/katversion.html))

### Tijdlijn van de rechtszaak en prijs

1. **2015 — gratis start. [Geclaimd]** De DWD lanceerde WarnWetter op 3 juni 2015 zonder advertenties of registratie, met waarschuwingcommunicatie als kern. ([DWD-lanceringsbericht](https://www.dwd.de/DE/presse/pressemitteilungen/DE/2015/20150603_WarnWetterApp.pdf?__blob=publicationFile&v=8))
2. **2017 — WetterOnline wint bij LG Bonn. [Gemeten, gerechtelijk feit]** In zaak **16 O 21/16** oordeelde het Landgericht Bonn op 15 november dat de DWD de uitgebreide app niet kosteloos mocht aanbieden. De DWD voerde de voorlopig uitvoerbare uitspraak uit en splitste versie 1.8: waarschuwingen gratis, volledige functionaliteit voor **€1,99 eenmalig**. ([DWD-reactie van 19 december 2017](https://www.dwd.de/DE/presse/pressemitteilungen/DE/2017/20171219_WarnWetterApp_Urteil.pdf?__blob=publicationFile&v=2))
3. **2018 — tijdelijk voordeel voor DWD in hoger beroep. [Gemeten]** Het OLG Köln (**6 U 180/17**) zag het aanbieden binnen de wettelijke DWD-taak niet als een commerciële handeling onder het mededingingsrecht en vernietigde het relevante deel van het vonnis; de betaalopzet bleef tijdens de verdere procedure bestaan. ([OLG-uitspraakoverzicht](https://online.ruw.de/dfv-xaver/ruw/start.xav?start=%2F%2F%2A%5B%40attr_id%3D%27RuWRS_2018%2FRuWRS_2018_904%27+and+%40outline_id%3D%27RuWRS_2018%27%5D))
4. **2020 — BGH maakt beperking definitief. [Gemeten]** Het Bundesgerichtshof (**I ZR 126/18**, 12 maart 2020) draaide die redenering terug: gratis officiële waarschuwingen vallen binnen de wettelijke uitzondering, maar de overige meteorologische diensten van de volledige app niet; kosteloos aanbieden daarvan botste met de tariefregels van het DWD-Gesetz en daarmee met het marktgedrag. ([volledige BGH-uitspraak](https://juris.bundesgerichtshof.de/cgi-bin/rechtsprechung/document.py?Art=pm&Blank=1&Datum=2020-3&Gericht=bgh&file=dokument.pdf&linked=urt&nr=106452))
5. **Augustus 2021 — tijdelijk €0,99. [Gemeten, secundaire bron]** De normale €1,99 werd kort gehalveerd. Dit is de oorsprong van “gratis-vs-€0,99”, niet de structurele prijs. ([appgefahren](https://www.appgefahren.de/warnwetter-vollversion-kostet-aktuell-nur-99-cent-statt-199-euro-305824.html))
6. **Sinds versie 4.0 / huidig — €2,49. [Gemeten]** De prijs steeg naar een eenmalige €2,49 en staat zo in de huidige stores en DWD-prijslijst. ([DWD-prijslijst](https://www.dwd.de/SharedDocs/downloads/DE/allgemein/preisliste_2024.pdf?__blob=publicationFile&v=11), [Apple App Store](https://apps.apple.com/de/app/dwd-warnwetter/id986420993))

**Productles:** de vreemde paywall is juridisch, niet primair commercieel ontworpen. Reviews richten irritatie daarom vaak op WetterOnline of de uitspraak, terwijl de eenmalige €2,49 juist als sympathiek alternatief voor advertenties en abonnementen geldt.

## 3. Populariteit en positie in Duitsland

| Indicator | Waarde | Status en duiding |
|---|---:|---|
| Google Play-downloads | 5 mln.+ | **[Gemeten]** Publieke ondergrens; Google toont geen exact totaal. |
| Google Play-rating | 3,8/5; 68,1k reviews | **[Gemeten]** Headline op de storepagina; apparaatfilters op dezelfde pagina kunnen licht andere totalen tonen. |
| Duitse iOS-rating | 4,6/5; circa 35,1k beoordelingen | **[Gemeten]** Sterke tevredenheid en groot reviewvolume. |
| Duitse iOS-categorie | #4 Weer | **[Gemeten]** Momentopname op 31 augustus 2026. |
| Duitse Android-categorie | #4 gratis Weer; #5 omzet Weer | **[Geschat/extern gemeten]** AppBrain-ranglijst; dagkoersen en methodiek van derde partij. ([AppBrain](https://www.appbrain.com/app/warnwetter/de.dwd.warnapp)) |
| Actieve gebruikers | circa 2 mln. | **[Geclaimd]** DWD, juni 2025. |
| Piekgebruik bij extreem weer | tot 4,5 mln. per dag | **[Geclaimd]** DWD; vermoedelijk sessies/gebruik, niet unieke daggebruikers. |
| Pushvolume 2024 | >950 mln. | **[Geclaimd]** DWD; circa 2,6 mln. per kalenderdag gemiddeld, sterk gepiekt rond gevaarlijk weer. |
| Professionele basis | 174k rampen-/bevolkings-/milieubescherming + 30k politietoestellen | **[Geclaimd]** DWD, juni 2025. |

**[Gemeten: ontbrekende maat]** Apple publiceert geen downloadaantal en de DWD geeft geen cumulatief platformtotaal; de Android-ondergrens mag daarom niet worden opgeteld bij of verward met de circa 2 miljoen actieve gebruikers.

**[Gemeten, historisch onderzoek]** In een BBK-onderzoek met data uit mei–december 2019 gebruikte 11% van de steekproef WarnWetter, tegenover 6,1% NINA en 4,2% KATWARN; WarnWetter was daarin de meest gebruikte waarschuwingsapp. Dit is nuttig als positioneringssignaal, maar te oud om als huidig marktaandeel te lezen. ([BBK, *Sozialwissenschaftliche Aspekte von Warnung*](https://www.bbk.bund.de/SharedDocs/Downloads/DE/Mediathek/Publikationen/FiB/FiB-29-sozialwissenschaftliche-aspekte-warnung.pdf?__blob=publicationFile&v=13))

**[Geschat]** De verdedigbare conclusie is “structurele Duitse top-vijf weerapp en institutioneel leidende gespecialiseerde weerwaarschuwingsapp”, niet “marktleider van alle weerapps”. WetterOnline en wereldwijde spelers hebben grotere downloadbases, terwijl WarnWetter bijzonder sterk is in vertrouwen, officiële waarschuwingen en intensief gebruik tijdens incidenten.

## 4. Sentiment: app-stores en Reddit

### Concrete signalen

| Bron | Positief | Klacht / wens | Productbetekenis |
|---|---|---|---|
| iOS-review, 2 aug. 2020 | Radar wordt als onovertroffen gezien; versie 3 bracht een overzichtelijk menu en betrouwbare uurdata. | Automatische data kan vreemde classificaties geven; gebruiker mist visuele verfijning. | Inhoud en tijdresolutie winnen van decoratie, maar datakwaliteitsanomalieën moeten uitlegbaar zijn. ([App Store-reviews](https://apps.apple.com/de/app/dwd-warnwetter/id986420993?platform=iphone&see-all=reviews)) |
| iOS-review, 19 okt. 2019 | Uurintervallen en door dagen scrollen maakten de app bruikbaar voor buitenactiviteiten. | De eerdere 8-uursblokken waren te grof; zonopkomst/-ondergang werd toen gemist. | Beslissingen vragen een fijne, doorlopende tijdas en contextdata, niet alleen dagiconen. ([App Store-reviews](https://apps.apple.com/de/app/dwd-warnwetter/id986420993?platform=iphone&see-all=reviews)) |
| Google Play, 28 dec. 2023 | Gebruiker noemt WarnWetter de nauwkeurigste weerapp in Duitsland. | Betaalmuur en dubbele locatiekop in dag- plus vijfdaagse widget storen. | Eenmalig betalen wordt verdragen, maar glanceable oppervlakken moeten extreem zuinig zijn. ([Google Play](https://play.google.com/store/apps/details?id=de.dwd.warnapp)) |
| Google Play, 4 mei 2026 | “Weer ter plaatse” en meereizende waarschuwingen hebben duidelijke waarde. | Reviewer meldt precieze locatiepolling om de 3–4 minuten en 2–3× hoger batterijgebruik; DWD adviseert de functie uit te zetten. | Maak always-on locatie expliciet, conditioneel en observeerbaar; bied favorieten zonder tracking als standaard. ([Google Play](https://play.google.com/store/apps/details?id=de.dwd.warnapp)) |
| Google Play, 31 mei 2026 | — | Reviewer ervaart dagelijkse symbolen en waarschuwingen als vaak omgekeerd of veranderlijk. | Toon update- en onzekerheidsinformatie; scheid officiële waarschuwing van deterministische weersymbolen. ([Google Play](https://play.google.com/store/apps/details?id=de.dwd.warnapp)) |
| r/de, circa 2025 | Gebruikers noemen €2–€2,50 graag betaald, advertentievrij, overzichtelijk, uitgebreid en “zijn geld waard”; een dagelijkse fietser vertrouwt vooral de radar. | In dezelfde draad worden 0% neerslag tijdens regen, vertraagde data en soms foute zonsopkomst genoemd; één gebruiker vindt alleen de radar goed. | Het merkvertrouwen is sterk, maar het halo-effect breekt zodra lokale werkelijkheid en puntverwachting uiteenlopen. ([r/de-discussie](https://www.reddit.com/r/de/comments/1mlnd58/databroker_files_wetter_online_l%C3%A4sst_daten/)) |
| r/de, feb. 2022 | De DWD-support gaf binnen een ochtend een uitvoerige uitleg op een radarmelding. | De gebruiker zag harde concentrische ringen en uniforme neerslagvlakken. | Leg radarcomposiet, meettijd en artefacten in-product uit; snelle inhoudelijke respons bouwt vertrouwen. ([r/de over radarartefacten](https://www.reddit.com/r/de/comments/sxp650/warnwetter_app_ringartefakte/)) |

### Sentimentbeeld

- **[Geschat] Vertrouwen:** hoog voor officiële herkomst, advertentievrijheid, waarschuwingen en radar; “rechtstreeks van de bron” is een terugkerende reden om te kiezen.
- **[Geschat] Waardeperceptie:** positief voor een eenmalige €2,49, zeker tegenover abonnementen; weerstand tegen de paywall is vaker juridisch/politiek dan prijsinhoudelijk.
- **[Geschat] Nauwkeurigheid:** gespleten. Kortetermijnradar wordt vaak geprezen, puntverwachtingen en neerslagkansen krijgen stevige lokale kritiek. Dat onderscheid moet productmatig zichtbaar blijven.
- **[Gemeten + geschat] Platformverschil:** de scores zijn iOS 4,6 versus Android 3,8; dat suggereert meer Android-frictie. De zichtbare Android-klachten over achtergrondlocatie en widgets geven plausibele oorzaken, maar bewijzen geen causaliteit.
- **[Geschat] UX:** informatierijk en bruikbaar, maar visueel utilitair; gebruikers waarderen overzicht en grafieken meer dan esthetiek, zolang plaats, tijd en betekenis snel te vinden zijn.

## 5. Implicaties voor motregen.nl

### Wat WarnWetter goed oplost

1. **Ernst en onzekerheid zijn verschillende visuele dimensies.** Kleur zegt hoe ernstig; arcering zegt “mogelijk, nog onzeker”.
2. **Een waarschuwing is een object, geen banner.** Ze heeft type, plek, tijd, drempelwaarden, bron, handelingscontext en lifecycle.
3. **Overzicht en detail delen dezelfde taal.** Pictogram, kleur en niveau keren terug op kaart, kaartdetail, locatiepagina en pushinstelling.
4. **Persoonlijke relevantie is configureerbaar.** Plaats, gevaarsoort, minimumernst en voorwaarschuwing zijn afzonderlijke keuzes.
5. **Veel informatie blijft hanteerbaar door gelaagdheid.** Dashboard → kaart → puntkaart → locatiegrafiek, in plaats van alles in één scherm.

### Wat niet blind kopiëren

- De gearceerde vlakken en herhaalde pictogrammen kunnen op drukke radarbeelden visueel botsen; geef waarschuwingen een duidelijke compositing- en prioriteitsregel.
- Een “naadloze” tijdlijn zonder zichtbare bron- of onzekerheidsovergang kan modeldata ten onrechte even feitelijk laten lijken als radarwaarneming.
- Always-on GPS voor reizende waarschuwingen is duur en gevoelig; vaste favorieten moeten de privacy- en batterijvriendelijke standaard zijn.
- Een enkel dagelijks weersymbool wekt schijnzekerheid. Motregen.nl heeft met radar, pySTEPS en HARMONIE juist de bouwstenen om bron, versheid en bandbreedte te tonen.
- Het dashboard is functioneel maar visueel gedateerd. Steel de taakhiërarchie, niet de tegelesthetiek.

## Beter goed gestolen

### 1. Waarschuwingsprofiel per favoriet: soort × ernst × voorwaarschuwing

**Waarom:** dit is de sterkste WarnWetter-feature omdat de gebruiker alarmmoeheid kan begrenzen zonder relevante lokale gevaren volledig uit te zetten.  
**Implementatie-omvang:** **M–L** — vereist een genormaliseerd waarschuwingmodel, locatie/polygonmatching, profiel-UI, pushregistratie, deduplicatie en lifecycle-tests voor verhogen, verlagen, verlengen en intrekken.

### 2. Waarschuwingslaag met kleur voor ernst en patroon voor onzekerheid

**Waarom:** een aparte arcering voor “mogelijk zwaar, nog onzeker” communiceert meer dan nóg een kleur en werkt ook wanneer kaart en radar al informatierijk zijn.  
**Implementatie-omvang:** **M** — voeg KNMI-waarschuwingspolygonen, semantische kleur/patroon-tokens, toegankelijke legenda, zoomregels en een kaart-bodysheet met geldigheid en handelingsperspectief toe.

### 3. Eén-tik-waarschuwingsdetail bovenop de kaart

**Waarom:** type, periode, lokale bandbreedte en toelichting in één compacte sheet beantwoorden direct “wat gebeurt hier en wanneer?” zonder de situational context te verliezen.  
**Implementatie-omvang:** **S–M** — bouw een gedeeld warning-detailcomponent voor kaart, locatiedetail en push-deeplink, inclusief bron, bijgewerkt-op, impact, drempelwaarden en intrekkingsstatus.

### 4. Gekoppeld locatiedetail met dagkaarten, uurlijn en één verticale cursor

**Waarom:** één tijdselectie over neerslag, temperatuur, kans, wind en windstoten maakt een dicht detailscherm sneller leesbaar dan losse tabellen en past precies bij MIP-4.  
**Implementatie-omvang:** **M** — hergebruik de bestaande uurtabeldata, voeg gesynchroniseerde grafieken/cursor en waarschuwingstab toe, en virtualiseer de tijdreeks voor snelle mobiele interactie.

### 5. Configureerbare “vandaag + risico”-widget/PWA-oppervlak

**Waarom:** WarnWetter bewijst dat waarschuwing, eerstvolgende regen en dagtrend waarde hebben zonder de app te openen, maar widgetreviews tonen dat elke dubbele kop meteen kostbare ruimte verspilt.  
**Implementatie-omvang:** **L voor native widgets, S–M voor PWA/lock-screen-alternatief** — begin met compacte web-push en installable-PWA-kaarten; voeg pas native widgets toe als iOS/Android-shells en deeplinks onderdeel van de productstrategie zijn.
