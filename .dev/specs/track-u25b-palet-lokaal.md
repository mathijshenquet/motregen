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
