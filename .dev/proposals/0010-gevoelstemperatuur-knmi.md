# MIP-10: gevoelstemperatuur zoals KNMI, zonder switch

Status: accepted (PO, 2026-09-23: "doe maar wat KNMI doet" en "haal de
switch helemaal weg")
Auteur: orchestrator, 2026-09-23

## 1. Probleem

De huidige afleiding (docs/fields.md §Gevoelstemperatuur) gebruikt JAG/TI-
windchill alleen bij T ≤ 10 °C en de NOAA heat index alleen bij T ≥ 26,7 °C;
daartussen is gevoel exact gelijk aan temperatuur. Nederland zit het
grootste deel van het jaar in dat middengebied: op 2026-08-31 en 2026-09-23
was het verschil over alle cellen 0,00 °C. De temp/gevoel-switch in de UI
doet daardoor maanden achtereen niets.

## 2. Voorstel

1. Ingest volgt de KNMI-definitie: JAG/TI-windchill bij T ≤ 10 °C (wind
   ≥ 1,3 m/s; anders T), en de Steadman apparent temperature (BoM-vorm,
   `AT = T + 0,33·e − 0,70·v − 4,00`, e = dampdruk in hPa uit T en RH, v =
   wind op 10 m in m/s) daarboven. De uitvoerende track verifieert de
   exacte KNMI-drempels en -vorm tegen KNMI's eigen documentatie en legt
   de bron in docs/fields.md vast; continuïteit rond 10 °C wordt getest
   (geen sprong > 1 °C bij typische wind/RH).
2. UI: de temp/gevoel-switch verdwijnt. Kaartlabels, meter en histogram-
   context tonen gevoelstemperatuur, gelabeld "gevoel". Het urenoverzicht
   toont beide: gevoel prominent, luchttemperatuur als kleine secundaire
   waarde (goedkoop, en de enige plek waar het verschil uitleg geeft).
3. Contract: `feels_like_c` en `temp_c` blijven bestaan met dezelfde
   kwantisatietabel; geen manifest-/mrf-wijziging.

## 3. Decision

PO 2026-09-23: akkoord op 1 en 2; de tabelvorm in 2 is een PM-keuze die de
PO op zicht kan terugdraaien.
