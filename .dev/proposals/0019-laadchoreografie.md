# MIP-19 — Laadchoreografie: wat de splash verbergt, en daarna zichtbaar progressief ("fog of war")

Status: draft (PO 2026-10-07: "het is jarring op mobiel dat het histogram pas later wordt
ingeladen … de splash werkt ook niet echt lekker … nadenken wat de splash zinvol kan hiden en hoe
je daarna dingen progressief maakt; het histogram moet tonen dat bepaalde dingen nog niet
gerenderd zijn, fog of war?")

## Het probleem

De splash verdwijnt zodra het eerste regenframe is getekend (`setMapReady` na de eerste
regen-draw in `App.tsx`); pas daarna start de locatiekeuze die het histogram vult, in vier
stappen (`PointLoadStage`: initial → direct → window → complete). Op een Mac vallen die stappen
samen; op een telefoon (Android-opname 2026-10-07: 893 decodes, 23,6 s decodetijd in 29 s) zie je
elke stap als een sprong: kaart, lege scrubber, ineens balken, dan wolkenlagen. Leeg is niet te
onderscheiden van "droog", en de splash wacht niet op de basemap-tiles, dus soms staat de regen
even op een kale kaart.

## Eerder werk

- U1 "zichtbaar bereik direct, geen deep-idle-poort" en de progressieve laadbaseline in
  `docs/perf.md`; MIP-7 (TTFR als eerste meetpunt); MIP-8 (data-dieet).
- De scrubber heeft al `aria-busy`/`data-load-stage` maar tekent daar niets voor.
- `readPointSeries(..., 'L0')` levert puntreeksen uit het goedkoopste niveau: het histogram
  heeft geen volledige framedecode nodig.
- U49 (decode-budget op mobiel) maakt "geladen" afhankelijk van wat getoond wordt.

## Aanbeveling

1. **De splash verbergt precies één ding**: kaart (basemap-tiles van het eerste beeld
   getekend) plus de eerste regenlaag. Daarna geen tweede wachtmoment meer; nooit de splash
   langer laten staan tot alles er is.
2. **Histogram van binnen naar buiten, per balk**: eerst het venster rond nu, dan naar beide
   kanten, elke balk zodra zijn waarde er is (L0-puntreeks, geen framedecode).
3. **Fog of war**: het nog niet geladen deel van de tijdas krijgt een zichtbare "onbekend"-
   staat (gedempte arcering of wazige band die wegtrekt als data landt), zodat leeg nooit op
   droog lijkt. Idem wolkenlagen en tabelrijen (skeleton). Kaartlagen van een modus faden in.
   Fog toont alleen "nog niet binnen" binnen het venster dat we wél laden; "niet nodig"
   (U49) is geen fog.
4. **Gereedheidsniveaus meten**: `ttfr` (splash weg), `ttfh` (histogram-venster rond nu),
   `ttfc` (alles) in HUD en perf-gate; het gat ttfr→ttfh is het "jarring"-getal.

## Open vragen

1. Vorm van de fog: arcering, blur of alleen een lagere dekking — PO kiest op stills/live.
2. Wacht de splash óók op de basemap-tiles (kost op 4G ~0,5–1 s extra)? Voorstel: ja, met een
   plafond van 1,5 s waarna hij toch weggaat.
3. Track: U50, live-pane na U42 (zelfde scrubber-/tabelcode).
