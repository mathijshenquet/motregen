# MIP-18 — Wolkenlagen, lichtval en "vibe": tekenen wat de lucht doet, en meten of dat klopt

Status: accepted (PO 2026-10-07, chat: "ja doe maar, probeer ook nu alvast die histogram wat
beter te maken"; "wellicht kan je iets doen met 'hoe licht het zal zijn', bijvoorbeeld door het
hele ding te kleuren")

## Het probleem

De wolkendoorsnede (U37) is een favoriete onverwachte feature, maar hij codeert alleen
**bedekkingsfractie**: dekking 0,9·f en dikte 0,18+0,82·√f, voor alle drie de lagen gelijk. Wat
je buiten voelt is iets anders:

- **Licht**: hoeveel zon er doorkomt hangt van de optische dikte af, en die verschilt per laag
  een factor tien (cirrus τ < 3,6; altostratus 3,6–23; stratus/nimbostratus > 23, ISCCP). Een
  gesloten cirrusdek laat ~70–80 % door, een stratusdeken < 10 %. De bewolkingsfactor is sterk
  niet-lineair: bij 50 % bedekking komt nog ~75 % van de straling door, bij 100 % ~25 % (Kasten
  & Czeplak 1980). Waargenomen helderheid is bovendien logaritmisch (Weber-Fechner).
- **Vibe**: 50 % lage stapelwolken is een Hollandse lucht (scherpe randen, blauw ertussen, zon
  die komt en gaat); 50 % grijsdeken op dezelfde fractie is niets daarvan. Het verschil zit in
  structuur en contrast, en een halfdoorzichtige band tekent dat weg tot "medium grijs".
- PO-observaties na een week gebruik: 50 % is "een stuk minder erg" dan 100 %; lage wolken
  zijn "een stuk leuker" dan 100 % hoog ("Mordor-gevoel"). Verdenking: wat AROME op die dagen
  "hoog" noemt is in werkelijkheid een dik middenpakket, of de lagen overlappen gelijk gewogen.

## Eerder werk (in de repo)

- U15 berekent al per uur de **bewolkingsfactor** `CMF = G/G_c` (HARMONIE-straling gedeeld
  door heldere-hemelstraling, Haurwitz; `web/src/core/uv.ts`), maar gebruikt hem alleen om de
  UV-schatting te dempen. Precies de "lichtfactor" die de tekening mist, zonder nieuwe data.
- U37: karakter per laag bestaat al (laag = stapelwolken, midden = deken, hoog = sliert),
  value-noise-randen, grijstinten als thematokens `--cloud-*`.
- Het weericoon kiest bewolking in vier stappen op totale `cloud_frac`, zonder laag.
- Data: `cloud_low/mid/high` (AROME 73/74/75, 5 %-stappen), `cloud_frac`, `radiation`.

## Aanbeveling

Drie delen, in deze volgorde:

1. **Tekenhersteek (U47, live-pane met de PO).** Fractie wordt **gaten, geen transparantie**:
   lage bewolking van 50 % zijn losse wolkjes met lucht ertussen; aantal en grootte volgen
   de fractie, pas ≥ ~90 % wordt het een band. Grijsheid komt uit de laag (hoog dun en wit,
   midden grijs, laag contrastrijk: lichte top, donkere basis) en uit de lichtfactor (CMF, op
   een logaritmische/perceptuele schaal). **De hemel als achtergrond**: het plotvlak kleurt
   mee met "hoe licht het wordt" (blauw bij hoge CMF, grijsblauw tot loodgrijs bij lage;
   nacht donker), zodat het hele ding leesbaar is als een dagverloop van de lucht. Nacht:
   lagen blijven (maan erachter), geen lichtfactor.
2. **Vibe-klasse als afgeleide** (klein regeltabelletje, geen getal): strakblauw · mooie
   wolkenlucht (laag 20–70 %, weinig midden/hoog, overdag) · melkachtig (hoog gesloten) ·
   grijs (midden gesloten) · Mordor (laag+midden gesloten, lage CMF, vaak regen). Voedt de
   cursortekst en later het weericoon. Kalibratie komt uit deel 3.
3. **Meten (U46)**: er is geen webcamarchief, dus zelf verzamelen vanaf vandaag. Poller elke
   10 min: KNMI-webcam De Bilt (meetveld station 260, richting noord, 10-min-verversing) +
   ons manifest bij De Bilt op kortste lead (`cloud_low/mid/high`, `cloud_frac`, `radiation`)
   + de KNMI 10-minutenwaarneming van 260 (straling, zonneschijn, octa's, wolkenbasis).
   Na 3–4 weken graden met de OpenAI Decisions API (`gpt-6-luna`; keuze = vibe-klasse, score
   0–10 "hoe mooi is deze lucht", predicaat "zon zichtbaar"), met **dezelfde vragen aan twee
   beelden**: de webcamfoto én een uitsnede van onze wolkendoorsnede rond dat uur. Dat scheidt
   twee fouten: webcam ≠ grafiek = tekening; model ≠ waarneming = AROME. De
   overeenstemming (kappa klasse, rangcorrelatie score) is de vaste metriek waar elke
   hersteek offline tegenaan kan (modelsamples worden bewaard, dus oude en nieuwe tekening
   zijn uit dezelfde data te renderen). PO-dagboekknop (één tik, vijf klassen, `?dev`) en een
   orkestrator-steekproef als menselijk anker.

## Open vragen

1. Welke kleurruimte voor de hemelachtergrond (OKLCH-verloop tussen twee thematokens?) — PO
   kiest live.
2. Of de vibe-klasse ook in het weericoon komt (nu vier stappen op totale bewolking) — na
   deel 3.
3. Spreiding: Windy Webcams API (gratis laag: lijst + actueel beeld, geen archief, opslag
   vermoedelijk verboden) alleen voor live-graden over het land, later.

## Besluit

PO 2026-10-07: alle drie de delen; deel 1 meteen als live-pane, poller vandaag.

## Changelog

- 2026-10-07: aangemaakt en geaccepteerd (PO, chat).
