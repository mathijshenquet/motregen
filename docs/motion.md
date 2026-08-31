# Bewegingsschatting

De ingest voegt alleen aan `rain_rate`-chunks van RTCOR, nowcast en HARMONIE-AROME een motion-annex toe. Frame 0 heeft geen annex; de annex bij frame `i` beschrijft de verplaatsing van frame `i-1` naar frame `i`. Andere velden blijven annexvrij.

## Schatter

De productiecode staat bewust in de losse crate `motion`: de schatter is een deterministisch domeinonderdeel dat zonder brondecoder, netwerk of publisher getest kan worden. De invoer is het gedequantiseerde regenveld; no-data wordt als `NaN` doorgegeven.

Het uitvoerraster gebruikt blokken van 32×32 broncellen en rondt aan oost- en zuidrand naar boven af. Op het gedeelde raster van 1.250×1.350 cellen is `motion_grid` daardoor 40×43. Per blok vergelijkt de schatter `log1p`-getransformeerde regenintensiteiten met genormaliseerde kruiscorrelatie. Een tweede kruiscorrelatie op een 16× verkleinde versie van het hele veld vormt het startpunt; de lokale zoektocht beslaat ±8 cellen daaromheen. Dit vangt een grote, coherente verplaatsing bij uurframes zonder per blok een onbegrensd zoekvenster te hoeven doorlopen en is minder gevoelig voor groeiende of uitdovende regengebieden dan een intensiteitszwaartepunt.

Iedere correlatievector krijgt een betrouwbaarheid tussen 0 en 1 uit drie
meetbare eigenschappen: de genormaliseerde correlatiescore, het verschil
tussen de beste piek en een niet-aangrenzende tweede piek, en de hoeveelheid
regensignaal in het blok. Een vector met betrouwbaarheid minstens 0,75 geldt
als sterk. Een ruimtelijke uitbijter die meer dan 6 cellen van de
componentgewijze mediaan in zijn 3×3-buurt ligt, wordt vóór de menging
gedempt.

Voor iedere bronrun fit de ingest één gewogen least-squares complexe factor
`s·R(θ)` tussen sterke correlatievectoren en de tijdgeïnterpoleerde 300m-wind
op dezelfde blokken. Er zijn minimaal 12 sterke blokken nodig. De fit wordt
begrensd op `s ∈ [0,5; 2,5]` en `|θ| ≤ 60°`; bij te weinig blokken geldt de
vorige fit van die bron, en bij de eerste run de default `s=1, θ=0`. Iedere
run logt schaal, rotatie, aantal sterke blokken en fit/fallback op INFO.

Sterke blokken blijven puur correlatie. Matige blokken mengen correlatie en
gekalibreerde wind met de betrouwbaarheid als correlatiegewicht; blokken
zonder betrouwbare correlatie krijgen volledig de windprior. Pas daarna
worden geldige vectoren eenmaal over hun 3×3-buurt gemiddeld. Alleen waar
ook de modelwind geen dekking heeft blijft `(-128, -128)` staan. De
uiteindelijke snelheid wordt afgerond naar 0,1 cel/minuut; geldige bytecodes
worden op `[-127, 127]` begrensd, oftewel ±12,7 cel/minuut. Annexvorm en
kwantisatie zijn daarmee ongewijzigd.

## Onafhankelijke acceptatiemaat

`spec/motion_reference.py` decodeert hetzelfde framepaar en dezelfde annex uit een mrf-chunk en schat daarnaast dichte flow met `pysteps.motion.lucaskanade`. Beide velden worden op het 32-cellenblokgrid en in cel/minuut vergeleken. Alleen blokken met regensignaal en een geldige vector in beide implementaties tellen mee.

De gate is een mediane Euclidische vectorafwijking kleiner dan 1 cel/minuut, met minstens vier vergelijkbare blokken. Een mediaan is hier geschikter dan een maximum: Lucas-Kanade en blokcorrelatie reageren bewust anders op groei, uitdoving en no-data-randen, terwijl een fout van 1 cel/minuut al 60 km/u op dit 1km-grid vertegenwoordigt. Het script schrijft daarnaast een quiver-plot van beide blokvelden voor visuele controle van lokale uitbijters en draairichtingen.
