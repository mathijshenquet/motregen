# MIP-9: regenkans per uur

Status: draft
Auteur: U4 (claude opus), 2026-09-23

## 1. Het probleem

De PO wil in het urenoverzicht een regenkans per uur, zoals Buienradar en
WarnWetter die tonen. Motregen publiceert nu uitsluitend deterministische
velden: RTCOR (gemeten), de pySTEPS-nowcast, de seamless-blend (waarvan de
ingest de ensemblemediaan neemt) en HARMONIE-AROME P1. Geen van de
gepubliceerde chunks bevat een kans. Een percentage heeft pas betekenis als
het een kans is: "30%" moet over veel van zulke uren ongeveer drie keer op de
tien regen betekenen. Een grootheid die alleen op een kans lijkt, zoals een
ruimtelijke of temporele fractie, mag dus niet onder dat label.

## 2. Wat er aan bronnen is (geverifieerd 2026-09-23 via de Open Data API)

| bron | wat | horizon | ingest-kosten |
| --- | --- | --- | --- |
| `seamless_precipitation_ensemble_forecast_members` (downloaden we al) | 20 leden pySTEPS-blend, 5-min | +5…+360 min | **0 extra download**; we lezen alle leden al voor de mediaan |
| `seamless_precipitation_ensemble_forecast_probabilities` | officiële overschrijdingskansen ≥ 0,1 / 0,3 / 1 / 3 / 10 / 30 mm/u, 5-min | +5…+360 min | 7,7–8,4 MB per bestand (gemeten 12:40–13:05Z), elke 5 min gepubliceerd |
| `harmonie_arome_cy43_p2a` (HARMONIE-AROME EPS, NL) | ensembleleden, uurlijks | +0…+60 u | ≈ 1,9 GB tar per uurrun (zie onder) |

Details HARMONIE EPS, gemeten op de tar-index van runs 08Z, 09Z en 10Z:

- Elke uurrun bevat 366 GRIB-bestanden: controlelid `000` en vijf
  verstoorde leden, leads +0…+60. Die vijf roteren per run (08Z: 011–015,
  09Z: 016–020, 10Z: 021–025). Het volledige ensemble (25 verstoorde leden
  + controle) is dus een **gelagd** ensemble over vijf opeenvolgende runs.
  De oudste run in zo'n set is ≈ 4 u ouder dan de nieuwste.
- Een lid per lead is ≈ 5,5 MB en ligt op hetzelfde 390×390-grid als P1.
  Neerslag bestaat hier uit drie geaccumuleerde velden (tabel 253: 181
  regen, 184 sneeuw, 201 graupel, `timeRangeIndicator=4`); P1-parameter 61
  (totale neerslag) ontbreekt. Totaal = som, uurintensiteit = verschil van
  opeenvolgende leads, net als bij P1.
- De publicatie loopt ≈ 2,5 u achter op de runstart (10Z-tar
  `lastModified` 12:30Z).

## 3. Opties

**A. Ensemblefractie uit de seamless-leden (0–6 u).** Een lid telt als nat
in een uur als één van zijn 5-minutenframes in dat uur ≥ 0,1 mm/u is. De
kans is dan het aantal natte leden gedeeld door 20. Dat is een echte
ensemblekans met een duidelijke definitie: "kans op regen in dit uur". Kost
geen extra download; de ingest leest alle leden al. Uitvoer: een nieuw veld
`rain_prob` (0–100 %, lineaire tabel zoals `cloud_frac`) met één frame per
uur, +1…+6 u. Grid: 4–8 km volstaat; een kans is al een gebiedsgrootheid.
Geschatte clientkosten, naar analogie van de live chunks van vandaag
(bewolking 16 km ≈ 3,9 kB/frame, straling 8 km ≈ 5,9 kB/frame): ≈ 4–6
kB/uur, dus ≈ 25–35 kB passief voor zes uur.

**B. Officiële kansendataset (0–6 u).** Dezelfde informatie, maar vooraf
berekend door KNMI. Hij kost 7,7–8,4 MB extra download per verversing en
geeft kansen per 5-minutentijdstip, niet per uur. "Kans in dit uur" is uit
kansen per tijdstip niet exact af te leiden; het maximum over het uur is een
ondergrens. A levert met de leden die we al hebben precies de gewenste
definitie. B heeft alleen zin als KNMI's kalibratie beter blijkt, en dat
kunnen we met A en B naast elkaar meten.

**C. HARMONIE-EPS-fractie (+6…+48 u).** Dezelfde definitie als A, over het
gelagde 26-ledenensemble uit de laatste vijf P2a-runs. Dit is de enige route
naar een echte kans voorbij 6 u. Kosten: naïef 26 leden × 49 leads × 5,5 MB
≈ 7 GB per verversing. Dat is te veel. Met een GRIB-berichtenindex per
bestand hoeven alleen de drie neerslagberichten mee. De prefilter die
`docs/arome.md` al als volgende optimalisatie noemt, zou dat naar schatting
10–15× kleiner maken. Die schatting is niet gemeten: de berichtgroottes
binnen een lid heb ik niet uitgesplitst. Alleen neerslag nodig, dus decode
en opslag zijn klein. Clientkosten: gelijk aan A per uur, dus ≈ 4–6 kB per
tabelrij.

**D. Ruimtelijke buurtfractie** uit het deterministische regenveld: het
aandeel natte cellen binnen bijvoorbeeld 10 km. Dit kan clientside zonder
extra bytes zodra het frame gedecodeerd is. Het is geen kans. Het meet hoe
vlekkerig de regen rond je locatie is, niet hoe onzeker de verwachting is,
en bij een gesloten regenfront of droog weer geeft het schijnzekerheid.

**E. Tijdfractie natte 5-minutenframes** (nowcast/seamless): hoeveel van
het uur het regent, alleen voor 0–6 u. Ook geen kans. Het is een nuttige
andere grootheid ("regent ~20 min van dit uur"), maar het is een duur en
moet ook zo gelabeld worden.

## 4. Aanbeveling

1. **Bouw A** voor +1…+6 u als veld `rain_prob`. Echte ensemblekans,
   0 extra download, kleine clientkosten.
2. **Toon voorbij 6 u geen percentage** totdat C bewezen is. D en E niet
   onder het label "kans"; E eventueel later als duurkolom ("≈ 20 min").
3. **Spike C** als aparte track: bouw eerst de GRIB-berichtenindex en meet
   de werkelijke download per verversing. Beslis daarna op die meting. Laat
   in dezelfde spike A en B een paar dagen naast elkaar lopen tegen RTCOR
   (Brier-score per uur), zodat we weten of onze kans gekalibreerd is.

## 5. Open vragen (taste calls)

1. Definitie: "kans op ≥ 0,1 mm/u ergens in dit uur" (aanbevolen, sluit aan
   op wat mensen bedoelen met "gaat het regenen") of "kans op ≥ 0,1 mm in
   dit uur" (geaccumuleerd, strenger bij korte buien)?
2. Mag de tabel een kanskolom hebben die na +6 u leeg is, of pas tonen als C
   er is?
3. Is een ingest van ≈ 0,5–1 GB per verversing voor C acceptabel, als de
   meting dat bevestigt?
4. Weergave: percentage in stappen van 10 (Buienradar-stijl) of de
   bestaande regenkolom tinten naar kans?

## Changelog

- 2026-09-23: draft (U4). Bronnen geverifieerd via Open Data API; niet
  geïmplementeerd.
