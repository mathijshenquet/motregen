# Track U25b — temperatuurvulling: zichtbaar kleurverloop over het actuele bereik (claude opus 5.5, zelfde worker als U25)

Read first: je eigen U25-LOG en `web/src/core/temperature-palette.ts`, de raster-
vulpass in `isoline-layer.ts`. LOG: zelfde track-LOG, nieuwe entries. Branch
`track/u25b-palet-lokaal` vanaf main (U25 is gemerged, 68096162).

## PO (2026-09-25, op de preview)

"Die gevoelstemp is wel nice, maar ik zie niet echt een noemenswaardig
kleurverloop; het is allemaal gewoon oranje/groen." — Het vaste KNMI-palet
van −20…40 °C geeft binnen de 6–8 °C die op één dag in beeld zijn maar
één à twee tinten.

## Opdracht

1. **Lokaal gerekt palet**: houd de KNMI-tintvolgorde (blauw → groen → geel →
   oranje → rood) maar leg hem over het **bereik van de geladen velden**
   (min/max van `feels_like_c` over alle tijdstappen van de tijdlijn, met
   een minimum-span van 8 °C en afgerond op hele graden), zodat elke band
   in beeld een eigen, onderscheidbare tint krijgt. Het bereik verandert
   alleen bij een nieuwe run (niet per scrubstap), dus geen geflikker.
   Absolute verankering blijft deels: onder 0 °C altijd blauw, boven 25 °C
   altijd rood (twee vaste ankers, ertussen rekken).
2. Basisopacity naar 0,18 als default (jouw advies uit U25), afstandsafval
   70 %, verzadiging 55 % — vastzetten, de drie U25-dev-knoppen weg (PO-
   keuze is hiermee gemaakt), zoals MIP-12 vraagt.
3. Legenda: klein, alleen in temperatuurfocus, onderin het kaartvlak links
   naast de bron-regel: de gebruikte kleurbalk met min/max-graden. Op
   mobiel mag hij weg als hij het kaartvlak vervuilt (motiveer).
4. Stills vóór/na (desktop + Pixel 5, licht/donker) met het bereik van
   vandaag én een synthetisch koud bereik (−3…6 °C) om de ankers te tonen.
5. Unit: bereikberekening (min-span, afronding, ankers), palet-lookup op
   drie bereiken; e2e gericht (focus.spec).

## Gates

`pnpm typecheck`, `pnpm test`, `pnpm build`, gerichte e2e onder een slot.
Synchrone exit statussen in de LOG. Draft-PR.

## Aanvulling PO (2026-09-25, later): "nog steeds te subtiel; kijk naar Buienradar"

Referentie: https://www.buienradar.nl/nederland/weerkaarten-radars/gevoelstemperatuur —
een vlakdekkend, verzadigd kleurveld (continu verloop, blauw → groen → geel → oranje → rood)
over een lichte kaart, zonder contourlijnen. Wij houden de isolijnen wél, dun erbovenop.

- **Afstandsafval eruit** (`fillFalloff` → 0 / verwijderen): de vulling die naar het band-
  midden wegvalt is de reden dat er niets te zien is. Vlakdekkend.
- **Continu per pixel** (`paletteColor(veldwaarde)` in de raster-pass) i.p.v. één vlakke
  kleur per band; met het lokaal gerekte palet uit punt 1. De "meebladen met de lijnfade"-
  eis vervalt daarmee vanzelf (er is geen kleurgrens meer op de lijn).
- **Opacity fors omhoog**: default 0,5; stills op 0,35 / 0,5 / 0,65 (licht/donker, desktop)
  zodat de PO kiest. Basiskaart-desaturatie blijft; meet of 55 % nog klopt bij 0,5 vulling
  (labels en kustlijn moeten leesbaar blijven — still met plaatsnamen).
- Legenda (punt 3) wordt hiermee belangrijker: continu kleurbalkje met min/max.

## Aanvulling PO (2026-09-25, 11:05): de Buienradar-referentie zelf

Referentiebeeld: `/tmp/claude-1000/buienradar-feel.png` (Buienradar gevoelstemperatuur
2026-09-25 11:20). Wat je daar ziet: **volledig dekkende** vlakken (geen kaart eronder,
alleen grenzen), **discrete banden** per ~1 °C met scherpe randen, en zelfs bij een spreiding
van 15,4–17,6 °C één geelgroene familie — Buienradar lost "weinig verloop" dus niet op met
meer tinten maar met dekking en scherpte. Daarom, in plaats van het "continu per pixel"
uit de vorige aanvulling:
- **Banden per stap** (vlakke kleur per 1 °C-band, scherpe overgang op de isolijn) met het
  lokaal gerekte palet uit punt 1, zodat aangrenzende banden zichtbaar verschillen.
- **Dekking hoog**: default 0,7; stills op 0,5 / 0,7 / 0,9. Bij 0,9 mag de basiskaart
  onder het veld tot lijnwerk vervagen (desaturatie + extra opheldering), mits plaatsnamen
  en kustlijn leesbaar blijven.
- Geen afstandsafval. Isolijnen dun erop; labels (graden) blijven.
