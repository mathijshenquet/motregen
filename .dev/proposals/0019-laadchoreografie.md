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
3. **Kader eerst**: de scrubber toont vanaf de eerste render zijn tijdas, nu-lijn en cursor met
   een gedempte laadmelding in het plotvlak; nooit een leeg blok (PO 2026-10-07).
4. **Fog of war**: het nog niet geladen deel van de tijdas krijgt een zichtbare "onbekend"-
   staat (gedempte arcering of wazige band die wegtrekt als data landt), zodat leeg nooit op
   droog lijkt. Idem wolkenlagen en tabelrijen (skeleton). Kaartlagen van een modus faden in.
   Fog toont alleen "nog niet binnen" binnen het venster dat we wél laden; "niet nodig"
   (U49) is geen fog.
5. **Tijd-majeur decoderen** (PO 2026-10-07: "we moeten eigenlijk time-major decoden"): de
   decode-wachtrij ordent op afstand tot de cursor in tijd, over álle velden tegelijk (regen,
   motion, wolkenlagen, puntreeksen van de getoonde kolommen), met een lichte voorkeur in de
   afspeelrichting en bij gelijke afstand round-robin over de velden met regen eerst. Niet
   veld-voor-veld. Zo heeft elk zichtbaar tijdstip meteen kaart én histogram én tabelwaarde en
   groeit het geladen venster als één front naar beide kanten — het fog-front van punt 3.
   Meting uit de PO-opname (Firefox-Android, 10:02): alle ~900 decodes in de eerste 12 s met
   de piek rond 6–8 s; de wolkenlagen van het histogram kwamen daardoor pas rond 6 s.
6. **Gereedheidsniveaus meten**: `ttfr` (splash weg), `ttfh` (histogram-venster rond nu),
   `ttfc` (alles) in HUD en perf-gate; het gat ttfr→ttfh is het "jarring"-getal.

## Meetkant (PO 2026-10-07: "goede observability dat er altijd zinnige dingen op het scherm staan")

- **Schermwaarheid per frame**: voor het zichtbare venster van scrubber en tabel telt de client
  elk slot als *geladen*, *fog* (bekend nog-niet-beschikbaar, zichtbaar als zodanig) of *leeg*
  (niets getekend terwijl de data nog komt). `blank-visible-ms` = tijd na de splash waarin een
  zichtbaar slot leeg is. Doel 0 ms; assertie in de mobiele rig (U53) en regel in de HUD.
- **Splash eerlijk**: `ttfr` telt pas als de basemap-tiles van het eerste beeld én het eerste
  regenframe getekend zijn (plafond 1,5 s); de rig logt wat er onder de splash gebeurde.
- **`ttfh`** (histogram nu ± 1 u compleet): het gat `ttfr → ttfh` mag bestaan, maar is nooit leeg.
- Tijd-majeur zelf is al meetbaar via `window-ready:<veld>` (U52) in HUD, trace en rig.

## De lat (PO 2026-10-07)

"Het is echt belangrijk dat we een geladen pagina met een spelende tijdlijn hebben op mobiel die
even snel of sneller is dan Buienradar." Dat is de maat van deze proposal, boven de losse
meetpunten: **`ttfp`** (time to first play) = tijd van navigatiestart tot de kaart het eerste
regenframe toont én de tijdlijn daadwerkelijk loopt (cursor beweegt, frames wisselen), gemeten
op de mobile-4g-rig en in echte PO-opnames. Referentie: dezelfde meting op buienradar.nl
(mobiele site, koud, zelfde rig-profiel) als `ttfp-ref`; doel `ttfp ≤ ttfp-ref`, ambitie `≤ 0,8 ×`.

Wat dat voor het laden betekent (uit de PO-opnames van 2026-10-07, koud: eerste regenframe
1,2 s, regenvenster ±1 u gereed 4,0–4,6 s, uurvelden 1,8 s):
1. **Spelen start niet op "venster compleet"** maar zodra het frame op de cursor en het volgende
   frame in afspeelrichting er zijn; de planner laadt regen in afspeelrichting vóór de frames
   erachter (intent-richting = afspeelrichting, ook zonder scrubben).
2. **Nooit stil pauzeren**: ontbreekt het volgende frame, dan toont het scrubber-kader de
   laadmelding op dat slot en loopt de cursor door zodra het frame er is — geen onzichtbare pauze
   (warme PO-run 16:28:21: stond stil zonder uitleg omdat de cursor buiten het geladen venster lag).
3. Uurvelden en kaartlagen van andere modi zijn nooit een voorwaarde om te spelen.

## Open vragen

1. Vorm van de fog: arcering, blur of alleen een lagere dekking — PO kiest op stills/live.
2. Wacht de splash óók op de basemap-tiles (kost op 4G ~0,5–1 s extra)? Voorstel: ja, met een
   plafond van 1,5 s waarna hij toch weggaat.
3. Track: tijd-majeur decoderen + intent-planner = U52 (nu); mobiele laadrig met wire weight =
   U53 (PO 2026-10-07: "concrete test harness … overhead van deze ombouw tracken, wire weight
   vooral"); de zichtbare laadchoreografie (splash, fog, histogram per balk) = U54, live-pane na U42.
4. Later, als tijd-majeur op de client niet genoeg is: chunk-indeling per tijdsnede over alle
   velden (contractwijziging, MIP-2), zodat ook het netwerk tijd-majeur gaat.

## Aanvulling (PO 2026-10-09 03:15): één klok, splash is geen gate
PO: "het lijkt me sowieso cleaner om pas de kaart te laten lopen als alles klaar is" en "die sluier is toch
veel te transparant? Ik zou die animatie niet afwachten." → De scrubber-klok en de kaartregen starten samen
zodra de kaart kan tekenen (mapReady); de splash-onthulling wacht niet en blokkeert niets (mag korter). ttfr =
het startmoment van die ene klok. Uitvoering: U68.
