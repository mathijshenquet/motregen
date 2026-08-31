# KNMI.nl + KNMI-app — prospectanalyse

**Peildatum:** 31 augustus 2026  
**Scope:** de publieke website `knmi.nl` en de officiële app **KNMI Weer** voor iOS en Android.

## Samenvatting

KNMI is niet de Nederlandse marktleider voor de alledaagse vraag “wanneer regent het hier?”, maar bezit iets waardevollers en moeilijk kopieerbaars: **institutionele autoriteit bij gevaarlijk weer**. In representatief onderzoek wil 61% het liefst door het KNMI worden geïnformeerd bij gevaarlijk weer, terwijl 47% een smartphone-alert als voorkeurskanaal noemt. Tegelijk gebruikt onder de respondenten die weerwebsites of -apps raadplegen nog 50% de Buienradar-app tegen 17% de KNMI-app. De positie is dus: sterke afzender, nog geen dominante dagelijkse interface.

De schaal is niettemin groot en snel gegroeid: de website kreeg in 2025 **50,9 miljoen bezoeken**, de app stond eind 2025 op **1,3 miljoen cumulatieve downloads**, en op de peildatum toont Google Play **4,5/5**, circa **2,73 duizend reviews** en **500K+ Android-downloads**. Op iOS is dat **3,88/5 uit 809 beoordelingen**. De app is sinds 2026 veel completer door twee uur vooruitkijkende radar, hittekracht en een bèta-alert voor zware onweersbuien binnen vijftien minuten.

Voor motregen.nl zijn de beste lessen niet “nog een kaart” maar: officiële waarschuwingen in de persoonlijke tijdlijn, onzekerheid zichtbaar maken zonder de interface zwaar te maken, en locatiegebonden waarschuwingen combineren met concreet handelingsperspectief. De meest terugkerende productzwakte bij KNMI is de informatielaag: gebruikers vinden de waarschuwingskaart te dominant, de navigatie en grafieken soms onlogisch en de radar te weinig inzoombaar.

## Methode en bewijskwaliteit

- **Gemeten:** interne bezoek- en downloadcijfers uit de rijksjaarverslagen, actuele appstorecijfers, en surveyresultaten. Het [imago-onderzoek 2025](https://cdn.knmi.nl/system/data_center_publications/files/000/072/386/original/Imago_onderzoek_KNMI_2025.pdf) is een representatief gewogen online onderzoek onder 1.011 Nederlanders van 18–80 jaar, uitgevoerd 17–25 november 2025.
- **Geclaimd:** functies en werking zoals KNMI of een appstorelisting die beschrijft. Zonder instrumentatie of broncode-audit is bijvoorbeeld “toegankelijk” of “duurzaam” een leveranciersclaim.
- **Geschat:** conclusies over gebruiksmomenten, concurrentiepositie en productkansen. Die zijn expliciet als interpretatie aangegeven.
- Sentiment is gebaseerd op de formele onderzoeken plus zichtbare recente reviews in Google Play en de App Store en openbare discussies op Reddit/Tweakers. De reviewselectie is **kwalitatief en niet representatief**; “topklachten” betekent terugkerende thema’s, geen berekende frequentieranglijst.

## 1. Feature-inventaris

### Waarschuwingen: het kernproduct

**Geclaimd door KNMI.** KNMI waarschuwt voor ijzel, sneeuw, hitte, kou, mist, onweersbuien, wind- en waterhozen, windstoten en zware regen. De kleur drukt de verwachte **impact** uit, niet alleen een meteorologische drempel:

| Niveau | Betekenis | Termijn |
|---|---|---:|
| Grijs/groen | Geen waarschuwing | — |
| Geel | Kans op gevaarlijk maar in Nederland vaker voorkomend weer; opletten, vooral onderweg | maximaal 48 uur vooraf |
| Oranje | Grote kans op gevaarlijk weer met grote impact, mogelijke schade, letsel of veel overlast | maximaal 48 uur vooraf |
| Rood | Weeralarm: extreem weer kan maatschappij-ontwrichtend zijn | maximaal 48 uur vooraf |

Code oranje en rood hebben volgens KNMI dezelfde meteorologische richtlijnen; een impactanalyse met overheids- en branchepartijen bepaalt de opschaling. Waarschuwingen gelden momenteel per provincie en daarnaast voor IJsselmeergebied, Waddenzee en Waddeneilanden. De regeling staat sinds 20 mei 2026 gerichtere waarschuwingen toe, maar dat wordt nog ingevoerd. Zie [uitleg KNMI-waarschuwingen](https://www.knmi.nl/kennis-en-datacentrum/uitleg/knmi-waarschuwingen).

Op de site staat de landelijke kleurkaart met fenomeen, regio, tijdvak, situatietekst en handelingsadvies. De app zet dezelfde kaart bij een actieve waarschuwing voorop, toont waarschuwingen ook bij opgeslagen plaatsen en kan per gekozen regio pushmeldingen sturen. Oranje en rood staan standaard aan; geel is opt-in. “Mogelijk gevaarlijk weer” wordt al tot zeven dagen vooruit bij een dagverwachting gemarkeerd, maar is nadrukkelijk nog geen kleurcode. [De KNMI-app](https://www.knmi.nl/kennis-en-datacentrum/uitleg/knmi-app) voegde in augustus 2026 bovendien een **bèta** toe die waarschuwt als binnen vijftien minuten een zware onweersbui op de geschatte locatie wordt verwacht.

### Website

| Onderdeel | Wat de publieke site biedt | Bewijsstatus |
|---|---|---|
| Actueel weer | Stationmetingen voor temperatuur, wind, windstoten, zicht, luchtvochtigheid, druk en weerbeeld; actualisatie per tien minuten | **Geclaimd**, [waarnemingen](https://www.knmi.nl/nederland-nu/weer/waarnemingen/) |
| Neerslag en satelliet | Radarbeeld uit Den Helder en Herwijnen per vijf minuten, met overlays voor temperatuur, bliksem en wind; afzonderlijke Meteosatbeelden | **Geclaimd**, [neerslagradar](https://www.knmi.nl/nederland-nu/weer/actueel-weer/neerslagradar) en [satelliet](https://www.knmi.nl/nederland-nu/weer/actueel-weer/satellietbeelden) |
| Verwachting | Meteorologentekst voor vandaag en morgen; samenvatting en tabel voor dag 0–6; algemene trend voor dag 7–14; neerslag, kans, wind, zon en zonkracht | **Geclaimd**, [verwachtingen](https://www.knmi.nl/nederland-nu/weer/verwachtingen/) en [toelichting](https://www.knmi.nl/kennis-en-datacentrum/achtergrond/de-weersverwachting) |
| Weerkaarten | HARMONIE-analyse en ECMWF-prognoses van gronddruk, door een meteoroloog van weersymbolen voorzien, plus archief | **Geclaimd**, [weerkaarten](https://www.knmi.nl/nederland-nu/weer/waarschuwingen-en-verwachtingen/weerkaarten.php) |
| Pluim en kansen | Vijftiendaagse interactieve pluim voor temperatuur, neerslag, wind en seizoensvariabelen; mediaan plus 50%- en 90%-band. Expertpluim toont 52 runs en extra variabelen; kansdiagrammen geven categorieverdelingen | **Geclaimd**, [pluimuitleg](https://www.knmi.nl/kennis-en-datacentrum/achtergrond/over-de-weer-en-klimaatpluim-en-expertpluim) en [kansverwachtingen](https://www.knmi.nl/nederland-nu/weer/waarschuwingen-en-verwachtingen/kansverwachtingen) |
| Klimaatcontext | In de pluim geven bollen de herhalingstijd van extreme temperatuur of neerslag in het huidige en rond-2050-klimaat; daarnaast normale waarden en uitgebreide klimaatdossiers | **Geclaimd**, [weer- en klimaatpluim](https://www.knmi.nl/nederland-nu/weer/waarschuwingen-en-verwachtingen/weer-en-klimaatpluim) |
| Zonkracht | Dagelijkse UV-index voor heldere en bewolkte hemel, schaal 0–8 voor Nederland en risico-/beschermingsadvies | **Geclaimd**, [zonkracht](https://www.knmi.nl/kennis-en-datacentrum/uitleg/zonkracht) |

De site bedient zo drie lagen: een snel publiek overzicht, verdiepende probabilistische producten en een expertlaag met guidance/modelbeoordeling. Dat is inhoudelijk sterk, maar de ervaring is verdeeld over veel losse pagina’s.

### App

**Geclaimd en in de stores zichtbaar.** De huidige app biedt:

- meerdere Nederlandse plaatsen en een privacybewuste, bij benadering bepaalde live-locatie;
- uurverwachtingen voor temperatuur, neerslag, wind en hittekracht voor vandaag en morgen;
- dagverwachtingen tot veertien dagen, inclusief pluimgrafieken met 90%-band voor temperatuur en neerslag;
- een neerslagradar van twee uur terug tot twee uur vooruit;
- kaarten met radar, temperatuur, windsnelheid, relatieve luchtvochtigheid en aardbevingen, deels met KNMI- én burgermetingen;
- zonkracht, hittekracht, zonuren, zonsopkomst/-ondergang en temperatuur tegenover het klimaatgemiddelde;
- meldingen voor weerwaarschuwingen en Nederlandse aardbevingen;
- widgets, toegankelijkheidsvoorzieningen, geen advertenties en publiek beschikbare broncode.

Belangrijke grenzen: alleen Nederlandse plaatsen, geen uitgebreide landelijke verwachtingstekst in de app, maximaal twee uur radarvooruitblik en geen satellietlaag. De appstorelisting noemt Nederlands en Engels als ondersteunde talen, maar KNMI zelf schrijft dat de inhoud vooralsnog Nederlands is en vanaf 2027 in het Engels moet komen; de KNMI-uitleg is hier leidend.

## 2. Populariteit en bereik

| Signaal | Uitkomst | Type en duiding |
|---|---:|---|
| Websitebezoek 2025 | **50,9 mln bezoeken**, gemiddeld 4,2 mln per maand | **Gemeten door KNMI**; geen unieke bezoekers. Piek: 774.000 bezoeken op 23 oktober bij code oranje voor storm Benjamin. [Rijksjaarverslag IenW 2025](https://www.rijksfinancien.nl/jaarverslag/2025/XII) |
| Cumulatieve appdownloads eind 2025 | **1,3 mln** | **Gemeten/gerapporteerd door KNMI**; downloads zijn geen actieve gebruikers. Eind 2024 was dit 345.000, dus de gerapporteerde teller werd in een jaar circa 3,8× zo groot. [2025](https://www.rijksfinancien.nl/jaarverslag/2025/XII) en [2024](https://berthub.eu/tkconv/document.html?nummer=2025D19993) |
| Android, 31-08-2026 | **4,5/5**, circa **2,73K reviews**, **500K+ downloads** | **Gemeten storeweergave**; Play toont alleen een downloaddrempel, geen exact aantal. [Google Play](https://play.google.com/store/apps/details?id=nl.knmi.weer&hl=nl&gl=NL) |
| iOS, 31-08-2026 | **3,88/5**, **809 ratings** | **Gemeten via Apple Lookup/App Store**. [App Store](https://apps.apple.com/nl/app/knmi-weer/id1225568094) |
| Appbezit na twee codes oranje in 2025 | **21–22%** heeft de app; **11–12%** gebruikt hem minstens wekelijks | **Gemeten**, maar in peilingen onder inwoners van gewaarschuwde regio’s, dus niet zonder meer heel Nederland. [Hittepeiling](https://cdn.knmi.nl/system/ckeditor/attachment_files/data/000/000/390/original/KNMI_flitspeiling_1_2025_code_oranje_extreme_hitte_1_en_2_juli_%28definitief%29.pdf) en [stormpeiling](https://cdn.knmi.nl/system/ckeditor/attachment_files/data/000/000/391/original/KNMI_flitspeiling_2_2025_code_oranje_windstoten_23_oktober.pdf) |
| Gebruik bij gevaarlijk weer | Onder website-/appgebruikers: Buienradar-app **50%**, Buienradar-site **34%**, KNMI-site **21%**, KNMI-app **17%** | **Gemeten**, representatief onderzoek; meerdere antwoorden mogelijk, basis n=676. De vraag veranderde sinds 2023. [Imago-onderzoek 2025, p. 29](https://cdn.knmi.nl/system/data_center_publications/files/000/072/386/original/Imago_onderzoek_KNMI_2025.pdf) |

Buienradar noemt zelf “meer dan 5 miljoen gebruikers” en “de meest gebruikte weersapp van Nederland”; dit is een **leveranciersclaim**, geen vergelijkbaar actief-gebruikcijfer. Zie [Buienradar over zijn apps](https://www.buienradar.nl/overbuienradar/app).

### Wanneer kiezen mensen KNMI boven Buienradar?

**Gemeten:** bij gevaarlijk weer is de afzender het grote voordeel. In het representatieve onderzoek vertrouwt 73% de weersverwachtingen van KNMI, vindt 71% het instituut feitelijk en 70% eerlijk. Voor informatie bij gevaarlijk weer kiest 61% bij voorkeur KNMI als afzender; 47% wil een smartphone-alert. Ouderen zijn oververtegenwoordigd: 26% van de 55-plussers in de relevante respondentbasis gebruikt de KNMI-app, tegen 9% van de 18–34-jarigen.

**Geschat uit surveys en kwalitatief sentiment:**

- **KNMI wint** voor officiële kleurcodes, betrouwbaarheid/autoriteit, een nationale of meerdaagse verwachting, onzekerheid via de pluim, en een gratis ervaring zonder advertentiedruk.
- **Buienradar wint nog vaak** voor de ingesleten snelle regencheck, fijn inzoomen op de kaart, langere radar-/modelhorizonten, buitenland en vertrouwdheid. Dat verklaart waarom mensen geregeld KNMI voor “het algemene weer” gebruiken maar Buienradar of Buienalarm voor de eerstvolgende bui.
- De radarprognose van mei 2026 heeft de overstapdrempel aantoonbaar in openbare discussies verlaagd, maar reacties blijven het ontbreken van zoom en de limiet van twee uur noemen. Zie de [Reddit-discussie over radarprognose](https://www.reddit.com/r/nederlands/comments/1timjmj/knmi_app_nu_m%C3%A9t_radar_prognose/) en [vergelijking van weerapps](https://www.reddit.com/r/nederlands/comments/1ua44tr/welke_weer_app_is_het_meest_accuraat/).

## 3. Sentiment

### Wat gebruikers waarderen — vijf concrete signalen

1. **Autoriteit en vertrouwen.** Het representatieve onderzoek meet 73% vertrouwen in de verwachtingen en een duidelijke voorkeur voor KNMI als afzender van gevaarwaarschuwingen; dit is sterker bewijs dan losse reviews.
2. **Advertentievrij en privacyvriendelijk.** Google Play- en App Store-reviewers prijzen herhaaldelijk de schone, simpele ervaring zonder paywall of advertenties. Reddit-discussies noemen dit expliciet als reden om Buienradar/Buienalarm te verwijderen. Zie [Google Play](https://play.google.com/store/apps/details?id=nl.knmi.weer&hl=nl&gl=NL), [App Store-reviews](https://apps.apple.com/nl/app/knmi-weer/id1225568094?see-all=reviews) en [Reddit](https://www.reddit.com/r/nederlands/comments/1timjmj/knmi_app_nu_m%C3%A9t_radar_prognose/).
3. **Waarschuwingen zijn nuttig.** Van de respondenten die werkelijk een appmelding voor code oranje herinnerden, vond 81% die bij de hittewaarschuwing en 86% die bij storm Benjamin (zeer) nuttig. De kleine bases (respectievelijk n=69 en een deelgroep) vragen wel voorzichtigheid.
4. **Radarvooruitblik maakt de app vervangend.** Een App Store-review zegt na toevoeging van de prognose bijna de betaalde weerapp te kunnen verwijderen; in Reddit-threads melden meerdere gebruikers direct commerciële apps te hebben verwijderd. Dit is sterke richtinggevende, maar niet representatieve conversie-intentie.
5. **Veel betrouwbare informatie zonder poespas.** Reviews prijzen accurate verwachtingen, de rustige vorm en extra’s als zonkracht en klimaatinformatie. De websitewaarschuwingen kregen in de overkoepelende flitspeilingen van 2024 gemiddeld een **7,5**. Zie [KNMI-samenvatting](https://www.knmi.nl/over-het-knmi/nieuws/meeste-nederlanders-kennen-knmi-weerwaarschuwingen).

### Topklachten — vijf terugkerende thema’s

1. **Verkeerde informatiehiërarchie en onlogische navigatie.** De landelijke waarschuwingkaart domineert het startscherm ook als een lokale waarschuwing niet relevant voelt; dagselectie, 14-daagse grafiek en detailkaarten voelen niet altijd gekoppeld. Zowel iOS- als Android-reviews vragen om “UX love”. [App Store](https://apps.apple.com/nl/app/knmi-weer/id1225568094?platform=ipad) en [Google Play](https://play.google.com/store/apps/details?id=nl.knmi.weer&hl=nl&gl=NL).
2. **Radar mist lokale interactie.** Niet of beperkt kunnen inzoomen, kleine buien moeilijk onderscheiden, geen directe radar als standaardweergave en slechts twee uur vooruit zijn veelgenoemde redenen om Buienradar ernaast te houden. [Reddit, mei 2026](https://www.reddit.com/r/nederlands/comments/1timjmj/knmi_app_nu_m%C3%A9t_radar_prognose/) en [Reddit, juni 2026](https://www.reddit.com/r/nederlands/comments/1ua44tr/welke_weer_app_is_het_meest_accuraat/).
3. **Widgets zijn inhoudelijk beperkt of instabiel.** Reviews noemen witte/niet-verversende widgets, veel lege ruimte en het ontbreken van een neerslaggrafiek. KNMI heeft in versies 5.1–5.3 meerdere widgetbugs gerepareerd, wat het bestaan van het thema ondersteunt. [App Store-reviews](https://apps.apple.com/nl/app/knmi-weer/id1225568094?see-all=reviews).
4. **Locatie en versheid gaan soms mis.** Reviews melden dat plaatsen moeilijk toe te voegen zijn, het scherm na heropenen niet naar de huidige tijd springt, metingen oud blijven of een nabijgelegen plaats wordt getoond. De laatste klacht is deels een bewuste privacytrade-off: KNMI zegt de locatie slechts binnen enkele kilometers te benaderen. [Google Play](https://play.google.com/store/apps/details?id=nl.knmi.weer&hl=nl&gl=NL), [App Store](https://apps.apple.com/nl/app/knmi-weer/id1225568094?platform=mac) en [KNMI-uitleg](https://www.knmi.nl/kennis-en-datacentrum/uitleg/knmi-app).
5. **Waarschuwingskalibratie en bereik blijven kwetsbaar.** Bij storm Benjamin vond 26% de code-oranjewaarschuwing overdreven en noemt 22% “waarschuwingen vaak overdreven” als reden om gedrag niet aan te passen. Tegelijk herinnerde bij beide 2025-peilingen slechts 29% van de appbezitters een appmelding; een groot deel kreeg die niet of wist het niet meer. Dit is geen bewijs van een technisch defect, maar wel een signaal voor alert fatigue, instellingen en afleveringscontrole. [Stormpeiling 2025](https://cdn.knmi.nl/system/ckeditor/attachment_files/data/000/000/391/original/KNMI_flitspeiling_2_2025_code_oranje_windstoten_23_oktober.pdf).

Secundaire lacunes zijn het ontbreken van buitenlandse plaatsen, satellietbeelden en de uitgebreide landelijke verwachtingstekst in de app. Die maken de app voor reizen en liefhebbers minder compleet, maar raken het Nederlandse veiligheidsdoel minder dan de vijf thema’s hierboven.

## Beter goed gestolen

1. **Officiële KNMI-waarschuwing als laag op de persoonlijke tijdlijn.** Waarom: kleur alleen is grof; fenomeen, geldig tijdvak, favoriete locatie en concrete impact naast de regenverwachting maken de waarschuwing onmiddellijk bruikbaar. **Implementatie-omvang: M** — openbare waarschuwingen inlezen en cachen, regio’s aan favorieten koppelen, banner/kaart/tijdlijn consistent maken en altijd KNMI als bron tonen; nooit zelf een officiële kleurcode suggereren.

2. **Compacte onzekerheidsband in plaats van één stellige lijn.** Waarom: KNMI’s 50%/90%-pluim communiceert precies wat verder vooruit verloren gaat en past bij MIP-4 als de mediaan dominant blijft en de band pas op verzoek uitleg krijgt. **Implementatie-omvang: M–L** — ensembledata of gekalibreerde scenario’s beschikbaar maken, kwantielen per plaats/tijd berekenen en een toegankelijke band plus korte uitleg ontwerpen.

3. **Hyperlokale zware-bui-alert uit de eigen nowcast, duidelijk los van een KNMI-code.** Waarom: KNMI’s vijftienminutenbèta bewijst de gebruikswaarde van “het raakt mij nu”, terwijl motregen met radar en pySTEPS juist op deze horizon onderscheidend kan zijn. **Implementatie-omvang: L** — geofenced pushpipeline, persoonlijke drempels, deduplicatie/escalatie, leveringsmonitoring en systematische evaluatie van missers en valse alarmen.

4. **Twee-traps risicocommunicatie: ‘in de gaten houden’ vóór de officiële waarschuwing.** Waarom: het KNMI onderscheidt mogelijk gevaarlijk weer tot zeven dagen vooruit van geel/oranje/rood binnen 48 uur en voorkomt zo dat vroeg risico als alarm wordt gelezen. **Implementatie-omvang: S–M** — afzonderlijke visuele status en copy toevoegen, bron/tijdstempel tonen en de overgang naar een officiële code als gebeurtenis in de tijdlijn bewaren.

5. **Impactkaart met handelingsperspectief per fenomeen.** Waarom: gebruikers willen vooral aard/intensiteit, hun locatie en duur (62%, 62%, 59%); één korte “wat betekent dit voor mij?”-regel is informatiever dan extra meteorologische cijfers. **Implementatie-omvang: S–M** — redactioneel beheerde adviesteksten per KNMI-fenomeen en niveau, doorklik naar de primaire bron, toegankelijkheidstoets en versiebeheer voor wijzigingen.
