# Prospect-synthese: de weermarkt rond motregen.nl

Datum: 2026-08-31. Vijf parallelle sol-sweeps (buienradar, KNMI, WarnWetter,
yr+Windy, brede sweep — volledige rapporten in deze map). Dit is de
orchestrator-synthese; bronnen en bewijsstatus per claim staan in de
deelrapporten.

## Situational awareness in vijf zinnen

1. **Buienradar** bezit de NL-massamarkt (iOS #1, 154K ratings, ±10 mln
   maandbereik geclaimd) op gewoonte en één ijzersterk mentaal model
   (kaart + regengrafiek), maar bloedt vertrouwen door reclame/tracking,
   de pay-or-ok-muur, performance-regressies en interface-churn.
2. **KNMI** heeft wat niemand kan kopiëren — autoriteit (73% vertrouwen,
   61% wil KNMI als afzender bij gevaar) — maar nog geen dominante
   dagelijkse interface (17% app-gebruik vs 50% buienradar); de
   radarprognose van mei 2026 verlaagt de overstapdrempel al zichtbaar.
3. **WarnWetter** bewijst dat waarschuwings-UX een keten is (land → regio →
   punt → detail → persoonlijke push) en dat kleur=ernst en
   arcering=onzekerheid gescheiden dimensies horen te zijn.
4. **yr** is geliefd om conditionele eenvoud ("regn nå" verschijnt alleen
   bij regen), **Windy** om diepte-met-behoud-van-context — motregen zit
   bewust op de open middenpositie: yr-snelheid als default, Windy-diepte
   achter één bewuste handeling.
5. De sweep-trends: eerst een handelingsantwoord, één doorlopende tijdas,
   inspecteerbare kaarten (versheid!), zichtbare onzekerheid, rust/privacy
   als premiumkwaliteit — en de antipatronen zijn exact waar buienradar
   c.s. op stukgaan (reclame op het beslismoment, paywall-architectuur,
   scanroute-brekende redesigns, stil verouderde data, schijnprecisie).

## Waar motregen vandaag al wint

Snelheid (2,1–7,4× snellere radar, e2e-bewezen), geen reclame/tracking,
naadloze tijdlijn met échte databronovergangen, flow-interpolatie,
wind-particles, 632 kB passieve load, open source. Dat adresseert vrijwel
elke top-klacht over buienradar zonder dat we iets extra hoeven te doen —
behalve het vertellen.

## De gededuplicieerde steel-lijst (gerangschikt)

| # | Idee | Uit | Waarom | Omvang | Status bij ons |
|---|---|---|---|---|---|
| 1 | **Provenance & versheid op de tijdlijn**: "radar · 3 min oud" / nowcast / blend / model + onzekerheidstaal per zone | RainViewer, meteoblue, WarnWetter, sweep-trend 3/4 | Maakt onze seamless blend contróleerbaar i.p.v. impliciet; wij hébben de metadata al in het manifest | S–M | data aanwezig, UI ontbreekt |
| 2 | **KNMI-waarschuwingen als laag + objectmodel** (fenomeen, tijdvak, regio, handelingsadvies; kleur=ernst, arcering=vooraankondiging) | KNMI #1, WarnWetter #1-3 | Het enige grote inhoudsgat t.o.v. álle gevestigde spelers; open data beschikbaar | M | niet aanwezig |
| 3 | **"Droog venster"-antwoordregel** boven de kaart ("Nu droog; jas mee vanaf 16:20"), conditioneel zoals yr | sweep #1+8, yr #1, buienradar #1 | Vertaalt onze data naar de primaire vraag; microcopy-merkstem er gratis bij | S–M | histogram bestaat; de zín ontbreekt |
| 4 | **Tik-op-kaart**: intensiteit, aankomsttijd, scan-leeftijd op elk punt | RainViewer | Kaart wordt bewijs; wij hebben picker+data al | S | grotendeels aanwezig, verrijken |
| 5 | **Per-favoriet meldingsprofielen** (drempel × tijdvak × leefritme) + push | buienradar #2, WarnWetter #1, KNMI #3, sweep #4 | Dé retentie-feature van alle concurrenten; vergt infra | L | niet aanwezig |
| 6 | **Widgets/glanceable** (PWA/lock-screen eerst, native later) | buienradar #3, WarnWetter #5, sweep-trend 6 | Dagelijks bereik zonder app-open; hardste klacht bij concurrenten als het niét ververst | M (PWA) / L (native) | niet aanwezig |
| 7 | **Onzekerheidsband/pluim** (KNMI-stijl 50/90%, of model-agreement als badge) | KNMI #2, Windy #3, meteoblue | Wij hebben seamless-ensembledata al liggen (bewust niet opgeslagen — herzien!) | M–L | data beschikbaar bij KNMI |
| 8 | **Configureerbare uurtabel + vaste startweergave** | Foreca, yr #2 | Personalisatie zonder default-verzwaring | M | tabel bestaat, config ontbreekt |
| 9 | **Sky/expert-peek-diepte** (verticale structuur, modelvergelijking) | Windy #5 | Voor later; alleen achter bewuste handeling | L | parkeren |

**Niet stelen** (unaniem): reclame vóór het antwoord, pay-or-ok,
abonnements-architectuur als product, menu-bomen, redesigns die
spiergeheugen breken, stil verouderde data, always-on GPS als default.

## Aanbevolen fasering

- **Ronde A (quick wins, puur frontend/bestaande data):** #1 provenance-
  labels, #3 antwoordregel, #4 tik-verrijking, aanzet #8.
- **Ronde B (nieuwe ingest, bescheiden):** #2 waarschuwingen (KNMI open
  data), #7 kansen uit de seamless-ensembleset (heropent één T2e-besluit).
- **Ronde C (infra):** #5 push-profielen + #6 widgets — het echte
  retentiewerk, pas als A+B het product "af" maken.
