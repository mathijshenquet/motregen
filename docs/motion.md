# Bewegingsschatting

De ingest voegt alleen aan `rain_rate`-chunks van RTCOR, nowcast en HARMONIE-AROME een motion-annex toe. Frame 0 heeft geen annex; de annex bij frame `i` beschrijft de verplaatsing van frame `i-1` naar frame `i`. Andere velden blijven annexvrij.

## Schatter

De productiecode staat bewust in de losse crate `motion`: de schatter is een deterministisch domeinonderdeel dat zonder brondecoder, netwerk of publisher getest kan worden. De invoer is het gedequantiseerde regenveld; no-data wordt als `NaN` doorgegeven.

Het uitvoerraster gebruikt blokken van 32×32 broncellen en rondt aan oost- en zuidrand naar boven af. Op het gedeelde raster van 1.250×1.350 cellen is `motion_grid` daardoor 40×43. Per blok vergelijkt de schatter `log1p`-getransformeerde regenintensiteiten met genormaliseerde kruiscorrelatie. Een intensiteitsgewogen verschuiving van het hele veld vormt het startpunt; de lokale zoektocht beslaat ±8 cellen daaromheen. Dit vangt een grote, coherente verplaatsing bij uurframes zonder per blok een onbegrensd zoekvenster te hoeven doorlopen.

Ruwe blokvectoren worden als volgt gestabiliseerd:

1. een vector die meer dan 6 cellen van de componentgewijze mediaan in zijn 3×3-buurt afwijkt, wordt door die mediaan vervangen;
2. een leeg blok erft maximaal vier ringen lang de mediaan van minstens twee geldige buren;
3. geldige vectoren worden eenmaal gemiddeld over hun 3×3-buurt.

Een blok blijft `(-128, -128)` wanneer het zelf en zijn bereikbare buurt geen bruikbaar regensignaal bevatten. Zo ontstaan geen verzonnen vectoren in een volledig droog veld, terwijl kleine gaten in een samenhangend regenfront wel het gesmoothte buurveld erven. De uiteindelijke verplaatsing wordt door het werkelijke tijdsverschil gedeeld en afgerond naar 0,1 cel/minuut; geldige componenten worden op `[-127, 127]` begrensd.

## Onafhankelijke acceptatiemaat

`spec/motion_reference.py` decodeert hetzelfde framepaar en dezelfde annex uit een mrf-chunk en schat daarnaast dichte flow met `pysteps.motion.lucaskanade`. Beide velden worden op het 32-cellenblokgrid en in cel/minuut vergeleken. Alleen blokken met regensignaal en een geldige vector in beide implementaties tellen mee.

De gate is een mediane Euclidische vectorafwijking kleiner dan 1 cel/minuut, met minstens vier vergelijkbare blokken. Een mediaan is hier geschikter dan een maximum: Lucas-Kanade en blokcorrelatie reageren bewust anders op groei, uitdoving en no-data-randen, terwijl een fout van 1 cel/minuut al 60 km/u op dit 1km-grid vertegenwoordigt. Het script schrijft daarnaast een quiver-plot van beide blokvelden voor visuele controle van lokale uitbijters en draairichtingen.

