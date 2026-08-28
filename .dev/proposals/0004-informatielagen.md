# MIP-4: informatielagen — veel weer, geen overweldiging

Status: accepted (PO, 2026-08-28, met wijzigingen — zie §5)
Auteur: orchestrator (fable), 2026-08-28

## 1. Het probleem

De PO wil naast regen ook: een "moet ik me insmeren"-indicator (zon/UV, mag
grof), een uurtabel met weerbeeld per uur, en temperatuur + gevoelstemperatuur
op de kaart — met als expliciete randvoorwaarde: veel informatie tonen zonder
dat het overweldigend wordt. Dat vraagt om een informatie-architectuur, niet
om losse features stapelen.

## 2. Eerder werk

**Symboolsemantiek.** Het KNMI/Buienradar-zonnetje is geen kansuitspraak maar
een deterministische samenvatting van het verwachte weerbeeld per tijdvak,
afgeleid uit vooral bewolkingsgraad (zonnig ≈ ≤2/8, half bewolkt, zwaar
bewolkt) met modifiers voor neerslag(type), mist en onweer; neerslagkans
wordt apart als percentage gecommuniceerd. Wij kunnen dezelfde afleiding doen
uit AROME-velden (bewolking + neerslag) — eigen iconenset in druppel-stijl.

**Zonkracht/UV.** Insmeer-advies geldt vanaf zonkracht ~3. UV wordt
gedomineerd door zonnestand (datum/tijd/breedtegraad) en gedempt door
bewolking; over NL varieert het spatiaal nauwelijks. AROME p1 bevat globale
straling; een eerlijke proxy is: clear-sky-UV uit zonnestand × demping uit
(gemeten straling / clear-sky-straling). Officiële zonkracht-forecast als
open dataset moet nog gezocht; tot die tijd de proxy, duidelijk gelabeld.

**Velden in AROME p1** (49 berichten per lead time, T1): 2m-temperatuur,
10m-wind (U/V), bewolking, globale straling — genoeg voor temperatuur,
gevoelstemperatuur (JAG/TI-windchill bij kou, hitte-index bij warmte),
symbolen én de UV-proxy. Geen extra databronnen nodig voor v1.

**Referenties.** Windy: alles kan, overweldigend. WarnWetter: één kaartlaag
tegelijk + detail onder de kaart. Apple Weather: kaart klein, kaarten/chips
voor detail. Les: kracht zit in wat je níét tegelijk toont.

## 3. Aanbeveling

Drie principes, dan de invulling:

1. **Eén kaartveld tegelijk.** De kaart stapelt nooit lagen. Regen is en
   blijft de default (identiteit van de app); een bescheiden veld-cycler
   biedt temperatuur en gevoelstemperatuur als alternatieve kaartlaag
   (zelfde mrf-mechaniek, eigen colormap; stedenlabels met waarde erbij).
   De histogram-scrubber blijft áltijd regen — dat is de kern-loop.
2. **Detail woont bij de gekozen locatie.** De uurtabel (T3b) is de plek
   voor dichtheid: per uur een weersymbool (afgeleid: bewolking+neerslag),
   temperatuur mét gevoelstemperatuur in één cel ("12° · voelt 9°"), regen
   in mm/u. Kaart toont velden; tabel vertelt het verhaal.
3. **Relevantie-gating.** Indicatoren verschijnen alleen als ze iets te
   zeggen hebben: de insmeer-chip (zonkracht ≥ 3, met sterkte) staat in de
   header/tabel op zonnige uren en bestaat verder niet. Geen permanente
   dashboards met nullen.

**Data-invulling.** Nieuwe velden via het bestaande `field`-mechanisme
(contract): `temp_c`, `feels_like_c` (server-side afgeleid), `radiation`
blijft voor de tabel/UV-proxy. Uurvelden voor tabel en temperatuurkaart mogen
op gereduceerde resolutie (bijv. 4× subsampled AROME) — de PO merkt terecht
op dat daar geen hoge spatial resolution nodig is; dat houdt de bytes klein.
Zonkracht wordt geen kaartveld maar een scalar-reeks per uur (één waarde voor
NL of de gekozen cel), meegeleverd in het manifest of een mini-JSON.
Kwantisatietabellen kunnen negatieve waarden aan (tabel is float), dus
temperatuur past in mrf zonder formaatwijziging.

**Uitvoering.** T2 (ingest) extraheert de extra AROME-velden en de
UV-proxy; T3-vervolgtrack doet veld-cycler + symbolen + chips. Beide pas na
adoptie van deze MIP; de uurtabel uit T3b draait intussen op regen +
synthetische straling.

## 4. Open vragen

1. **Veld-cycler op de kaart** (regen | temp | gevoelstemp, één tegelijk,
   regen default): akkoord? Of temperatuur alleen in de tabel?
2. **UV-proxy** uit straling+zonnestand, eerlijk gelabeld ("indicatie"),
   totdat we een officiële open zonkracht-bron vinden: akkoord?
3. **Symbolen**: eigen minimalistische set in druppel-stijl (aanbevolen) of
   een bestaande open iconenset (bijv. een weather-icons-font)?

## 5. Besluit (PO, 2026-08-28)

- **Geen veld-cycler** (aanbeveling §3.1 vervangen): de kaart toont regen
  mét temperatuur-getalletjes tegelijk (stads-verankerde labels), en in
  principe ook zon/wolk-iconen op de kaart — of dat overweldigt testen we
  empirisch; de PO stuurt op visual feedback. Wel een **switcher
  temperatuur ↔ gevoelstemperatuur, default gevoelstemperatuur**. Geen
  isolines.
- **Zonkracht**: KNMI blijkt een officieel open-data-product te hebben —
  `cloud-modified-uv-index` (Benelux, per 15 min, 03:00–21:45 UTC) naast de
  dagelijkse `uv-index`-forecast. De UV-proxy uit §3 vervalt; de
  insmeer-chip (relevantie-gating, ≥3) draait op het officiële product.
- **Symbolen**: de KNMI-app staat in het overheids-OSS-register; licentie
  van de icon-assets checken. Zo niet bruikbaar: Meteocons (MIT) of eigen
  set — "probeer maar iets", PO geeft visual feedback.
- Overige principes (§3.2 detail-in-tabel, §3.3 relevantie-gating, lage
  resolutie voor uurvelden) ongewijzigd akkoord.

## Changelog

- 2026-08-28: draft.
- 2026-08-28: accepted — kaart = regen + temperatuurgetallen (+ iconen op
  proef) i.p.v. veld-cycler; gevoelstemperatuur default; officiële
  UV-datasets gevonden, proxy vervallen; besluit §5 toegevoegd.
- 2026-08-28: amendement (PO na live review): (a) dark-kaart moet naar het
  niveau van light — economische-zone-/maritieme grenzen weg, terrain-/
  landcover-tinten terug; (b) Windy-achtige wind-particles toegevoegd:
  ónder de regenlaag op ~60% opacity, dichtheid duidelijk lager dan Windy,
  particle-snelheid ∝ windsnelheid, subtiele kleurcodering op Beaufort.
  Data: 10m U/V uit AROME (contract-velden `wind_u_ms`/`wind_v_ms`).
- 2026-08-28: amendement (PO, ronde 3): (a) provinciegrenzen zichtbaar op de
  kaart (T3c-stijlpass); (b) zon-iconen op de kaart op proef, maar expliciet
  GÉÉN wolkenweergave/bewolkingslaag — "dan zie je de kaart niet meer"
  (vervangt het eerdere "zon/wolk-iconen op proef": alleen zon); (c)
  day/night-cyclus op de kaart, gekoppeld aan de tijdcursor van de scrubber
  (subtiele terminator-schaduw die meebeweegt bij scrubben) — T3d.
