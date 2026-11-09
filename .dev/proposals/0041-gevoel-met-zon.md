# MIP-41 — Gevoelstemperatuur met zon

Status: accepted · auteur: worker U105 (opus-5.5) voor de orkestrator · 2026-11-09 · PO-besluit 2026-11-09: "doe maar Steadman met zon"

## Het probleem

MIP-10 rekent boven de windchill-zone met Steadmans apparent temperature zonder straling (BoM:
`T + 0,33e − 0,70v − 4,00`). Die vorm beschrijft iemand in de schaduw. Tussen 10 en 22 °C ligt gevoel daardoor
bijna altijd 1–3 °C onder de lucht, ook op een zonnige dag. Buienradar toont daar de luchttemperatuur.

## Eerder werk

- MIP-10 (gevoel zoals KNMI, zonder switch) en docs/fields.md §Gevoelstemperatuur: JAG/TI tot en met 10 °C, BoM
  vanaf 15 °C, lineaire band daartussen.
- BoM heeft ook een vorm mét straling (Steadman 1994): `AT = T + 0,348e − 0,70v + 0,70·Q/(v+10) − 4,25`. BoM
  gebruikt die zelf niet, omdat Q in waarnemingen lastig te bepalen is.
- MIP-38/39: HARMONIE levert globale straling per uur; ICON-D2 ook directe straling, 48 u vooruit.

## Aanbeveling

1. **Formule.** Boven de windchill-zone geldt de BoM-vorm mét straling; JAG/TI tot en met 10 °C en de band van 10
   tot 15 °C blijven, dus de overgang blijft continu. Zonder zon (nacht, bewolking) is Q ≈ 0. Dan geldt de vorm
   zonder straling, die in Nederland hooguit ±0,3 °C van de huidige afwijkt.
2. **Q = directe zon op een staande persoon:** `Q = 0,7 · f_p(β) · I_n`. Hier is 0,7 de absorptie (ISO 7726),
   `f_p` de projectiefactor van een staande persoon (Underwood & Ward 1966) en `I_n` de directe normaalstraling.
   Die laatste komt uit HARMONIE-globaal met de Erbs-splitsing op de helderheidsindex per uur. Afleiding, getallen
   en bronnen: docs/fields.md §Gevoelstemperatuur › Met zon.
3. **Bron HARMONIE, niet ICON-D2.** Dat is één model met dezelfde wolken als temperatuur en wind, over de volle
   60 u. ICON-D2-direct verbetert de zonneschijnduur een dag vooruit nauwelijks (MIP-39) en zou op +48 u een knik
   geven.
4. **Kiezen op zicht.** `?dev&gevoel=nu|zon|zon-sterk` rekent de gevoelskaart en de tabel in de client om:
   ingestwaarde plus het verschil tussen deze vorm en MIP-10. `zon-sterk` gebruikt 2·Q. Dat is ongeveer de
   volledige stralingsbalans van iemand op een open veld (diffuus, grondreflectie en hemeltekort erbij), dus een
   bovengrens. Na de PO-keuze gaat de gekozen vorm naar de ingest en verdwijnt de dev-optie.

Getallen (middag 20 april, De Bilt, zon 48°; `pnpm exec tsx web/scripts/gevoel-zon.ts tabel`):

| situatie | Q | nu | zon | zon-sterk |
| --- | ---: | ---: | ---: | ---: |
| zon, 12 °C, 2 Bft, RH 60 %, 700 W/m² | 101 W/m² | 10,3 °C | 12,5 °C | 14,8 °C |
| zon, 15 °C, idem | 101 W/m² | 12,6 °C | 18,2 °C | 23,9 °C |
| zon, 18 °C, idem | 101 W/m² | 16,3 °C | 22,0 °C | 27,6 °C |
| zon, 24 °C, idem | 101 W/m² | 24,1 °C | 29,9 °C | 35,5 °C |
| bewolkt, 12 °C, 3 Bft, RH 85 %, 150 W/m² | 0 W/m² | 9,7 °C | 9,7 °C | 9,7 °C |
| bewolkt, 15 °C, idem | 0 W/m² | 12,7 °C | 12,7 °C | 12,7 °C |
| bewolkt, 18 °C, idem | 0 W/m² | 16,7 °C | 16,8 °C | 16,8 °C |
| bewolkt, 24 °C, idem | 0 W/m² | 25,3 °C | 25,5 °C | 25,5 °C |

## Open vragen

1. **Welke variant?** `zon` (aanbeveling) of `zon-sterk`. Vergelijkingsbladen in `.dev/tracks/u105-gevoel-zon/shots/`.
2. **Winter.** Bij `T ≤ 10 °C` telt zon niet mee (JAG/TI), ook niet op een heldere novemberdag. Dit volgt het besluit
   "winter ongewijzigd". Een zonterm onder 10 °C zou een eigen MIP zijn.
3. **Steile band bij veel zon.** Bij zon en weinig wind loopt gevoel tussen 10 en 15 °C snel op: bij `zon` ruim
   1 °C extra per °C lucht. Dat is continu, maar bij 12 °C in de zon is gevoel al 2,2 °C hoger dan nu (12,5 tegen
   10,3 °C).

## Besluit

PO 2026-11-09: "doe maar Steadman met zon". De vorm en de Q-kalibratie zijn aangenomen. De keuze tussen `zon` en
`zon-sterk` volgt op zicht; daarna gaat de vorm naar de ingest (aparte stap).
