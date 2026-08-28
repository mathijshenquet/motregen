# MIP-5: flow-tweening — buien laten bewegen tussen frames

Status: draft
Auteur: orchestrator (fable), 2026-08-28

## 1. Het probleem

De kaart blendt nu lineair tussen opeenvolgende frames (cross-fade van
datawaarden). Bij 5-minuten-radarframes geeft dat spookbeelden: een bui
vervaagt op positie A terwijl hij op positie B opdoemt, in plaats van van A
naar B te bewegen. Bij de uurlijkse AROME-frames is het nog lelijker. De PO
vraagt of een "flow model" voor het tweenen haalbaar is.

## 2. Eerder werk

- **pySTEPS** (KNMI's eigen operationele nowcast, waar ons
  `radar_forecast`-product uit komt): Lucas-Kanade optical flow op het
  regenveld + semi-Lagrangiaanse advectie. Precies dit mechanisme, alleen
  gebruiken zij het om te voorspellen en wij om te interpoleren.
- **Videocodecs** (MIP-2-discussie): motion-compensated prediction is de
  kern van elke codec — het "temporal prediction"-voordeel dat we toen
  bewust lieten liggen halen we hier alsnog binnen, maar doelgericht en in
  eigen beheer.
- **RainViewer/Windy**: vloeiende radaranimaties in de browser werken op
  hetzelfde principe (warp + blend in een shader).
- Bewegingsschatting op een grof blokgrid (kruiscorrelatie of LK op ~32
  px-blokken) is in Rust rechttoe-rechtaan; regenvelden advecteren
  grootschalig coherent, dus een gróf veld is genoeg voor de visuele winst.

## 3. Aanbeveling

**Serverside schatten, clientside warpen; graceful fallback.**

1. **Ingest**: per opeenvolgend framepaar (zelfde veld, zelfde bron) een
   grof bewegingsveld schatten — blok-kruiscorrelatie op het
   regenveld, ~32 px-blokken → ca. 21×22 vectoren op ons grid, gesmooth.
   Kwantiseren naar i8-paren (0,1 cel/min-stappen): ±12,7 cel/min dekt
   >200 km/u — ruim. Kosten: ~1 kB per frame, verwaarloosbaar.
2. **Contract** (additief): optioneel per frame in de chunk-header een
   `motion`-annex (offset/len in de payload, eigen zstd-member; blokgrid-
   afmetingen in de header). Ontbreekt de annex → client cross-fadet zoals
   nu. Geen breuk met bestaande chunks.
3. **Client**: de fragment shader doet tweezijdige semi-Lagrangiaanse
   warp — sample frame A op positie x − v·dt en frame B op x + v·(1−dt),
   blend met gewicht dt. Twee extra texture-lookups en één klein
   motion-texture; verwaarloosbaar voor 60 fps.
4. **AROME-uurframes**: zelfde mechanisme, maar de verplaatsing per uur is
   groot — warp cappen en de blend zwaarder laten wegen om artefacten
   (schuifranden, cel-geboorte/-sterfte) te dempen. Dit blijft de minst
   mooie zone; eerlijke verwachting: grote verbetering op radar/nowcast,
   gematigde op het model-segment.

**Ambitie-inschatting (de PO-vraag):** middelgroot, geen moonshot — één
ingest-track (T2d: schatter + annex + cross-checks tegen een Python-
referentie met pySTEPS' eigen LK als spec) en één frontend-track (T3f:
motion-texture + warp-shader + fallback). De wiskunde is gevestigd, de
bytes zijn triviaal, het risico is visueel (artefacten bij rotatie/shear en
bij ontstaan/oplossen van cellen) en wordt gedempt door tweezijdig warpen,
smoothing en de crossfade-fallback. Vergelijkbaar met de wind-particles qua
omvang.

## 4. Open vragen

1. **Plaatsing motion-data**: per-frame annex in de bestaande chunk
   (aanbevolen: atomair, cache-vriendelijk) of aparte `motion`-veldchunks?
2. **Ook op AROME toepassen** in v1 (aanbevolen: ja, met cap) of eerst
   alleen radar/nowcast?
3. **Referentie-implementatie**: pySTEPS' Lucas-Kanade als executable spec
   (aanbevolen — zelfde harnas-patroon als T1/T2) of alleen eigen
   golden-fixtures?

## Changelog

- 2026-08-28: draft.
