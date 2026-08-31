# Prospectanalyse: Buienradar.nl en de Buienradar-apps

**Peildatum:** 31 augustus 2026  
**Target:** Buienradar.nl, iOS/iPadOS/watchOS en Android/Wear OS  
**Korte conclusie:** Buienradar bezit nog altijd de Nederlandse massamarkt en vooral een ijzersterk mentaal model — *kaart bekijken, grafiek eronder, beslissen of je weg kunt*. De voorsprong zit minder in één unieke databron dan in gewoonte, distributie, een enorme functionele staart en glanceable uitingen als meldingen en widgets. De opening voor motregen.nl is even duidelijk: gebruikers zijn uitgesproken klaar met reclame/tracking, trage of vastlopende clients, voorspellingsmissers en interface-churn.

## Leeswijzer en bewijskracht

- **Gemeten:** rechtstreeks waargenomen op de actuele site of winkelpagina, of afkomstig uit een onderzoek met genoemde steekproef.
- **Geclaimd:** een cijfer of kwalificatie van Buienradar, RTL/DPG of hun advertentieverkooporganisatie; niet onafhankelijk geverifieerd.
- **Geschat:** synthese of productinschatting op basis van de gevonden signalen.

Winkelcijfers zijn momentopnames. App-store- en forumsentiment is zelfselecterend en dus richtinggevend, niet representatief. De iOS-storefront toont bovendien als uitgelichte recensies nog klachten uit 2020; die gebruik ik alleen als historisch signaal, niet als bewijs voor de huidige versie.

## 1. Feature-inventaris

### Kern: radar, tijdlijn en de klassieke regengrafiek

**Gemeten.** De web-radar biedt één afspeelbare en zoombare kaart met vensters **−1, +3, +8, +24 en +48 uur** en direct daaronder de locatiegebonden **buiengrafiek**. Er is daarnaast een terugkijkpagina met datum/tijd-selectie en snelkeuzes voor drie en 24 uur terug. Buienradar legt zelf een belangrijk technisch verschil uit: +3 uur extrapoleert de recentste radarbeelden en modelleert het ontstaan of oplossen van buien niet; +24 uur gebruikt een weermodel dat elke zes uur wordt bijgewerkt. De korte radar is volgens Buienradar doorgaans betrouwbaarder voor de nabije termijn, de 24-uurskaart is een indicatie op langere termijn. Bron: [actuele neerslagradar](https://www.buienradar.nl/nederland/neerslag/buienradar) en [radararchief](https://www.buienradar.nl/nederland/neerslag/buienradar-terugkijken).

**Gemeten.** De iOS-app opent standaard op de 3-uursradar; onder de kaart staat de regengrafiek met timing en millimeters. Er zijn −1-, 8-, 24- en 48-uursweergaven en een lokale zoom. Android beschrijft dezelfde kaart/grafiek-combinatie, met inzoomen tot straatniveau, maar noemt in de huidige storetekst vooral 3 en 24 uur. Bron: [Apple App Store](https://apps.apple.com/nl/app/buienradar-weer/id621542526) en [Google Play](https://play.google.com/store/apps/details?id=com.supportware.Buienradar&hl=nl).

**Geschat.** Het productanker is niet “een radarkaart”, maar de vaste koppeling tussen ruimtelijk patroon en een extreem leesbare lokale tijdreeks. De grafiek beantwoordt *wanneer en hoeveel?* zonder dat de gebruiker zelf kaartpixels hoeft te interpreteren.

### Kaarten en lagen

**Gemeten.** De website heeft een zeer brede inventaris:

- Neerslag: gewone radar, radar terugkijken, cumulatief, motregen, onweer en live-onweer, panoramaradar, hagel, sneeuw, neerslagsom en wolkentoppen.
- Zon/wolken: zon- en wolkenradar, UV, zicht/mist, satelliet en satelliet terugkijken, zonuren en zonopkomst/-ondergang.
- Temperatuur: actueel, gevoel, grond, minimum/maximum, zee en verwachting.
- Wind: actueel/maximaal, windstoten en pluim.
- Gezondheid/seizoen: pollen/hooikoorts, luchtvochtigheid, luchtkwaliteit, muggen, teken en een bevingsradar; in de winter ook sneeuwhoogte, ijsdikte en schaatsradar.
- Activiteit: BBQ- en terrasradar, Uitradar, evenementen en uitjes.
- Europa/wereld: Europese neerslag, wolken, onweer, satelliet, UV, sneeuw en temperatuur; plaatsverwachtingen zijn wereldwijd beschikbaar.

De actuele navigatie en snelkoppelingen staan op onder meer de [gratis-weerdata-pagina](https://www.buienradar.nl/overbuienradar/gratis-weerdata) en [radarpagina](https://www.buienradar.nl/nederland/neerslag/buienradar).

**Gemeten.** De apps bevatten volgens de huidige winkelteksten onder meer motregen, zon, satelliet NL/Europa, onweer, pollen, UV, muggen, BBQ, temperatuur, gevoelstemperatuur, grondtemperatuur, wind, mist, sneeuw, luchtkwaliteit, luchtvochtigheid en neerslagsom. De iOS-tekst noemt daarnaast Europa-temperatuur. Dit is een kleinere maar nog altijd forse selectie van het webportaal. Bron: [iOS-productbeschrijving](https://apps.apple.com/nl/app/buienradar-weer/id621542526) en [Android-productbeschrijving](https://play.google.com/store/apps/details?id=com.supportware.Buienradar&hl=nl).

### Per locatie en langere verwachting

**Gemeten.** Gebruikers kunnen favoriete locaties in Nederland en de rest van de wereld opslaan. Een locatie heeft een weeroverzicht en een **14-daagse**. In de apps toont “Komende uren” per uur temperatuur en gevoelstemperatuur, millimeters regen, neerslagkans, windrichting en windkracht; daarnaast worden actuele waarden getoond voor onder meer luchtdruk, vochtigheid, windstoten, zicht en zonopkomst/-ondergang. De 14-daagse is als grafiek of lijst beschikbaar: zeven dagen gedetailleerd per uur, daarna zeven dagen als daggemiddelde. Bronnen: [weer per plaats](https://www.buienradar.nl/nederland/verwachtingen/weer-per-plaats), [App Store](https://apps.apple.com/nl/app/buienradar-weer/id621542526) en [Google Play](https://play.google.com/store/apps/details?id=com.supportware.Buienradar&hl=nl).

**Gemeten.** Naast modeldata leveren meteorologen meerdere keren per dag een geschreven weerbericht. Op de site bestaan verder een 5-daagse landelijke verwachting en “De Pluim”.

### Waarschuwingen en meldingen

**Gemeten.** De website toont KNMI-code groen/geel/oranje/rood voor vandaag en morgen, uitgesplitst naar provincies en de Waddenzee/het IJsselmeergebied. Genoemde gevaren zijn regen, gladheid/sneeuw, onweer, windstoten, hitte, zicht en hozen. Bron: [weerwaarschuwingen](https://www.buienradar.nl/nederland/weerbericht/weerwaarschuwingen).

**Gemeten; app-exclusief in de gevonden productbronnen.** Een pushmelding kan per locatie, tijdvak en week-/weekendritme worden ingesteld zodra regen met voldoende zekerheid wordt verwacht. Ook zijn een dagelijks lokaal weerbericht en meldingen voor onder meer sneeuw, UV, vorst/autoruit krabben, muggen en BBQ beschikbaar. Bronnen: [app-overzicht](https://www.buienradar.nl/app/buienradarapp/), [App Store](https://apps.apple.com/nl/app/buienradar-weer/id621542526) en [Google Play](https://play.google.com/store/apps/details?id=com.supportware.Buienradar&hl=nl).

### Widgets, wearables en overige appfuncties

**Gemeten; app-exclusief.** iPhone/iPad hebben widgets en een Apple Watch-app. Android heeft een homescreenwidget met lokale regengrafiek; de Wear OS-app toont radar, regengrafiek en de verwachting voor het komende uur. De apps ondersteunen donkere modus. De iOS-storefront noemt Nederlands, Engels en Frans en verklaart ondersteuning voor VoiceOver, stembediening, grotere tekst, donkere interface, niet alleen kleur gebruiken en voldoende contrast. Bronnen: [App Store](https://apps.apple.com/nl/app/buienradar-weer/id621542526) en [Google Play](https://play.google.com/store/apps/details?id=com.supportware.Buienradar&hl=nl).

### Verkeer, content en community

**Gemeten.** Site en apps bieden file- en treinmeldingen; de site toont actuele trajecten, vertraging en NS-storingen. Het webproduct is daarnaast een contentportaal met meteorologen, weerbericht/video, Weerzine, tips en nieuws. Gebruikers kunnen weerfoto's en video's insturen en bladeren door uitgelichte, recente en best gewaardeerde inzendingen. Bron: [reis- en verkeersinformatie](https://www.buienradar.nl/nederland/verkeer) en [Buienradar-hoofdnavigatie](https://www.buienradar.nl/).

### Data, API en embeds

**Gemeten.** Buienradar biedt geen onbeperkte publieke commerciële API, maar wel een bruikbaar pakket “gratis weerdata”:

- coördinatenendpoint met neerslagwaarden tot twee uur vooruit, elke vijf minuten bijgewerkt;
- radarafbeeldingen en configureerbare iframe-widgets, inclusief een variant met actuele temperatuur en 5-daagse;
- RSS;
- JSON met actuele KNMI-stationsmetingen, geschreven weerbericht en 5-daagse; waarnemingen elke tien minuten bijgewerkt.

Niet-commercieel web-/intranetgebruik mag met bronvermelding. Voor mobiele toepassingen en commercieel gebruik is toestemming vereist. Bron en voorbeelden: [Gratis Weerdata](https://www.buienradar.nl/overbuienradar/gratis-weerdata).

### Verdienmodel en inconsistenties

**Gemeten.** Gratis gebruik bevat advertenties en in-app aankopen. De actuele iOS-aankopenlijst en webaanbieding noemen **€ 6,99 per jaar**; de Android-storetekst noemt nog € 4,99 en de eigen app-landingspagina zelfs het oude “Buienradar Plus” à € 3,49. De publieke prijscopy is dus inconsistent en alleen de prijs in de daadwerkelijke checkout kan per platform als leidend gelden. Volgens de FAQ kan het nieuwe jaarabonnement app én website advertentievrij maken. Bronnen: [App Store](https://apps.apple.com/nl/app/buienradar-weer/id621542526), [Google Play](https://play.google.com/store/apps/details?id=com.supportware.Buienradar&hl=nl), [Premium-aanbieding](https://www.buienradar.nl/weerzine/brplusvoordeelacties), [FAQ](https://www.buienradar.nl/overbuienradar/faq) en [verouderde app-landingspagina](https://www.buienradar.nl/app/buienradarapp/).

## 2. Populariteit en marktpositie

### Winkelmetingen

| Kanaal | Gemeten op 31-08-2026 | Duiding |
|---|---:|---|
| iOS NL | **4,5/5**, **154K beoordelingen**, **#1 in Het weer** | Zeer groot en op dit moment categorieleider in de Nederlandse App Store. [Bron](https://apps.apple.com/nl/app/buienradar-weer/id621542526) |
| Android | **4,3/5**, **91,2K reviews**, **10 mln.+ downloads** | De downloadbadge is een ondergrens, geen actieve-gebruikersmeting. De pagina toont daarnaast 83,7K telefoonreviews, vermoedelijk een devicefilter. [Bron](https://play.google.com/store/apps/details?id=com.supportware.Buienradar&hl=nl) |

### Bereik: claims versus onafhankelijk onderzoek

- **Geclaimd:** de eigen app-pagina noemt **5 miljoen gebruikers** en “de meest gebruikte weersapp van Nederland”. Er staat geen meetperiode of methodologie bij. [Bron](https://www.buienradar.nl/app/buienradarapp/)
- **Geclaimd:** RTL meldde in mei 2025 dat RTL Weer en Buienradar samen maandelijks **ruim 10 miljoen mensen** bereiken via tv, site, app en social. Dit is crossmediaal bereik en dus geen app-MAU. [RTL-persbericht](https://www.rtl.nl/pers/persberichten/jordi-huirne-vult-presentatorenteam-rtl-weer-en-buienradar-aan/aCxSJREAAB8AS4CU)
- **Geclaimd:** een Ad Alliance-factsheet noemt circa **10 miljoen maandbereik**, gemiddeld **125 miljoen appbezoeken** en **34 miljoen websitebezoeken per maand**, plus 1,9 miljoen RTL-Weerkijkers per dag. De factsheet noemt Google/NMO als bron bij delen van het overzicht, maar geeft voor de bezoekcijfers geen heldere meetperiode; hij verwijst nog naar de publieksprijs van 2023. Bezoeken zijn sessies, geen unieke personen. [Ad Alliance-factsheet (pdf)](https://adalliance.nl/wp-content/uploads/Factsheet-Buienradar.pdf)
- **Gemeten, onafhankelijk:** in Motivactions KNMI-imago-onderzoek 2025 (**n=1.011**) zei 48% zich bij gevaarlijk weer via mobiele apps te informeren. Binnen de **676 respondenten die daarvoor sites/apps gebruiken**, werd de Buienradar-app het vaakst genoemd (**50%**), gevolgd door de Buienradar-site (**34%**), nieuwssites (**29%**), Buienalarm-app (**27%**), nieuwsapps en Weeronline-app (beide **24%**); de KNMI-app stond op **17%**. Meerdere antwoorden waren mogelijk. [Motivaction/KNMI, p. 29 (pdf)](https://cdn.knmi.nl/system/data_center_publications/files/000/072/386/original/Imago_onderzoek_KNMI_2025.pdf)
- **Historisch geclaimd/gemeten door RTL:** op 29 mei 2018 trok Buienradar volgens RTL **6,1 miljoen unieke bezoekers op één dag**; dat was een uitzonderlijk weer-/recordmoment en geen normale dagbasis. [RTL Nieuws](https://www.rtl.nl/nieuws/tech/artikel/4494511/buienradar-wint-prijs-website-van-het-jaar)

**Geschatte marktpositie.** Alles wijst op de grootste consumentenweerbestemming van Nederland: twee grote storebases, #1 op iOS en een onafhankelijke gebruiksmeting waarin zowel app als site boven de alternatieven staan. De positie is breed maar niet onaantastbaar. Het onderzoek dateert van vóór de latere uitbreiding van de KNMI-radarprognose, terwijl forumdiscussies laten zien dat juist de advertentievrije KNMI-app overstapintentie losmaakt.

## 3. Sentiment

### Samenvatting

De storescore is overwegend positief, maar de spontane gesprekken zijn veel negatiever. Dat verschil is niet vreemd: een enorme tevreden stille gebruikersbasis kan tegelijk bestaan met een luid segment dat vanwege tracking, advertenties of recente regressies vertrekt. Vijf concrete patronen:

1. **De kaart-grafiek-widgetlus wordt echt gewaardeerd.** Een recente Reddit-gebruiker zegt bij inzoomen op de radar goed te kunnen zien wanneer een bui aankomt; elders vraagt iemand expliciet om “een widget als Buienradar”. Zelfs een kritische Google Play-recensie noemt de app “super useful” en zegt dat de widget nog bruikbaar is wanneer de app zelf vastloopt. De eigen reviewselectie bevat fietsers die vóór vertrek altijd kijken. Bronnen: [Reddit — accuratesse](https://www.reddit.com/r/nederlands/comments/1ua44tr/welke_weer_app_is_het_meest_accuraat/), [Reddit — widget](https://www.reddit.com/r/ik_ihe/comments/1ifsfeo/ik_ihe/), [Google Play](https://play.google.com/store/apps/details?id=com.supportware.Buienradar&hl=en_US).

2. **Reclame, tracking en de pay-or-ok-wall zijn de grootste reputatieschade.** Een Google Play-review uit april 2026 haakt af omdat advertentiepartners persoonsgegevens zouden volgen en vindt het abonnement niet opwegen tegen gratis alternatieven. Reddit-gebruikers noemen “alle advertenties en subscriptions” en een grote betaal/reclamepopup als vertrekreden. Op Tweakers zegt een gebruiker de app te hebben verwijderd nadat “decline all” de pay-or-ok niet langer omzeilde. Dit is niet alleen irritatie over banners, maar wantrouwen in het verdienmodel. Bronnen: [Google Play-review](https://play.google.com/store/apps/details?id=com.supportware.Buienradar&hl=en_US), [Reddit-discussie](https://www.reddit.com/r/nederlands/comments/1tpw5sy/waarom_is_buienradar_ineens_zo_kut_gemaakt/) en [Tweakers-forum](https://gathering.tweakers.net/forum/list_messages/2302126).

3. **Performance en betrouwbaarheid van de client zijn een actuele pijn.** De op 27–28 augustus 2026 getoonde Android-reviews melden vastlopen bij openen, een app die niet meer start en een betalende Premium-gebruiker bij wie de laatste update het toestel laat hangen. Reddit noemt de app “teringtraag” en een widget die niet functioneert. De iOS-storefront toont oudere klachten over traag laden, crashes en hoog batterijgebruik; die laatste zijn historisch, maar de recente Android-signalen maken opstartperformance duidelijk nog relevant. Bronnen: [Google Play NL](https://play.google.com/store/apps/details?id=com.supportware.Buienradar&hl=nl), [Reddit](https://www.reddit.com/r/ik_ihe/comments/1i9k3cv/ikihe/) en [App Store](https://apps.apple.com/nl/app/buienradar-weer/id621542526).

4. **De radar wordt meer vertrouwd dan de voorspelling.** Een Reddit-gebruiker vindt de ingezoomde radar goed voor een naderende bui, maar de plaatsvoorspellingen “een stuk slechter”. Een actuele Play-review vat de frustratie scherper samen: regen voorspeld betekent droog en omgekeerd. Op Tweakers meldt iemand dat Buienradar de zonwering bij een blauwe hemel liet sluiten. Dit is anekdotisch, maar het patroon komt op alle drie kanalen terug. Bronnen: [Reddit](https://www.reddit.com/r/nederlands/comments/1ua44tr/welke_weer_app_is_het_meest_accuraat/), [Google Play](https://play.google.com/store/apps/details?id=com.supportware.Buienradar&hl=nl) en [Tweakers](https://gathering.tweakers.net/forum/list_messages/2296488/2).

5. **Interface-churn kost vertrouwen; het merkdebat versnelt vertrek.** Reddit klaagt dat menu's steeds worden omgegooid. In de iOS-versiegeschiedenis moest Buienradar na feedback de vertrouwde oude kaart terugbrengen, locatiesuggesties verwijderen en de gekozen weergave onthouden. Een betalende Tweakers-gebruiker noemt het RTL-loginproces foutgevoelig en onhandig. De rechtszaak tegen de gratis KNMI-app veroorzaakte bovendien veel “Buienradar eraf, KNMI erop”-reacties en 527 reacties op één Tweakers-artikel. Bronnen: [Reddit](https://www.reddit.com/r/ik_ihe/comments/1i9k3cv/ikihe/), [App Store-versiegeschiedenis](https://apps.apple.com/nl/app/buienradar-weer/id621542526) en [Tweakers-discussie](https://tweakers.net/nieuws/231194/buienradar-en-andere-weerbedrijven-klagen-knmi-aan-om-vernieuwde-weerapp.html).

### Productles voor motregen.nl

**Geschat.** Buienradar bewijst dat gebruikers veel informatiedichtheid verdragen als de eerste blik simpel blijft. De fout is niet de featurebreedte op zichzelf; het is dat commerciële frictie, navigatie-instabiliteit en technische regressies vóór de weerbeslissing komen te staan. Motregen kan daardoor winnen met een smallere lange staart, zolang kaart, lokale tijdlijn, laadpad en privacy merkbaar beter zijn.

## 4. Beter goed gestolen

1. **Zet een compacte lokale regengrafiek permanent direct onder de kaart.** Waarom: dit is Buienradars beste vertaling van radardata naar de concrete vraag “kan ik nu gaan?”, en gebruikers noemen juist dit kaart-/grafiekpatroon en de widget als blijvende waarde. **Implementatie-omvang: middel** — sample de bestaande radar/nowcast op favoriet of gps-punt, render intensiteit plus “nu”-markering en koppel hover/scrub aan dezelfde tijdlijn als de kaart.

2. **Bouw configureerbare neerslagmeldingen per locatie én leefritme.** Waarom: tijdvak, weekdagen/weekend en vertrouwensdrempel maken een pushmelding bruikbaar in plaats van lawaai, terwijl smartphone-alerts volgens Motivaction het voorkeurskanaal bij gevaarlijk weer zijn. **Implementatie-omvang: groot** — pushinfrastructuur, geofence/favorieten, server-side evaluatie, confidence- en deduplicatieregels, stille uren en instellingen per locatie.

3. **Lever glanceable homescreenwidgets, beginnend met de regengrafiek.** Waarom: gebruikers prijzen of missen precies deze vorm; hij geeft motregen.nl dagelijks bereik zonder de volledige app te openen en maakt snelheid tastbaar. **Implementatie-omvang: middel tot groot** — native iOS/Android-widgettargets, compacte cached payloads, achtergrondrefresh en drie formaten; wearable pas daarna.

4. **Maak één tijdlijn met duidelijke semantische snelkeuzes −1 / +3 / +8 / +24 / +48.** Waarom: de knoppen geven verschillende beslismomenten onmiddellijk betekenis, maar motregen kan ze beter uitvoeren met zijn seamless blend in plaats van Buienradars zichtbaar verschillende +3- en +24-modellen. **Implementatie-omvang: klein tot middel** — presets bovenop de bestaande tijdlijn, bron-/zekerheidslabel bij de overgang en behoud van de laatst gekozen horizon.

5. **Voeg een kleine, contextuele laagstrip toe: motregen, onweer, UV/pollen en vorst.** Waarom: Buienradars lange staart creëert seizoensrelevantie, maar vier goed gekozen beslislagen passen beter bij MIP-4 dan een portaal met tientallen radars. **Implementatie-omvang: middel per databron** — uniforme tiles/legenda/attributie en deeplinks; begin met motregen/onweer uit bestaande neerslagdata en voeg externe UV/pollen pas toe als bronkwaliteit en licentie helder zijn.

**Niet stelen:** de pay-or-track-interruptie, advertenties vóór de eerste weerblik, een onbegrensde menuboom, stilzwijgend verschillende voorspelmodellen en redesigns die spiergeheugen breken. De steelbare kern is juist: veel informatie achter één stabiele, snelle beslisroute.
