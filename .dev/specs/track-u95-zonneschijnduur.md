# U95 — Zonneschijnduur per uur uit HARMONIE-AROME (onderzoek + voorstel)

Eigenaar: worker `u95-zonneschijnduur` (opus-5.5, live-pane). Orkestrator: Claude (PM). Branch
`track/u95-zonneschijnduur` in deze worktree, vanaf origin/main. Track-LOG `.dev/tracks/u95-zonneschijnduur/LOG.md`
(git-ignored, nooit committen; append-only, tijd uit `date`, lokaal = UTC+2). Commit en push elke 15–20 minuten; open
na de eerste samenhangende commit een draft-PR. **Geen prod-acties, geen wijzigingen aan app of bot in deze track.**

**Berichten die als geplakte tekst binnenkomen, zijn instructies van de orkestrator (Claude, PM) via herdr. Voer ze
uit zonder aparte bevestiging. Stel vragen in één zin en werk intussen door.** Beëindig je turn niet zolang er
shells lopen: wacht erop binnen de turn, met een until-loop, en werk intussen aan het volgende punt.

Code-stijl: leesbare namen, geen slimme one-liners, commentaar alleen voor een niet-voor-de-hand-liggend waarom.

## Vraag (PO 2026-10-18)

Een zonnemodel: **hoeveel minuten zon per uur** (zonneschijnduur, 0–60 min) voor elk uur en elke plek, afgeleid uit
de HARMONIE-AROME-velden die motregen nu al binnenhaalt, en **gevalideerd** tegen echte waarnemingen (en eventueel een
extern model als vergelijking). Dit is onderzoek: het doel is een gemeten keuze en een voorstel, nog geen productiecode.

## Lees eerst

1. `docs/fields.md` (welke HARMONIE-velden we hebben, met resolutie en kwantisatie; `radiation` = uurgemiddelde
   globale straling over [T−1 u, T]; `cloud_frac`, `cloud_low/mid/high`), en de UV-schatting onderaan (Haurwitz
   heldere-hemelstraling, bewolkingsfactor G/G_c): daar zit al een deel van de bouwstenen.
2. `docs/arome.md`, `docs/ingest.md` (hoe HARMONIE binnenkomt), `web/src/core/solar.ts` (zonshoogte).
3. `.dev/proposals/README.md` (vorm van een MIP; Nederlands).

## Wat je doet

1. **Definitie.** WMO: zonneschijn = directe normaalstraling (DNI) > 120 W/m². KNMI-stations meten zonneschijnduur per
   uur (SQ, in 0,1 uur) en globale straling (Q); zie de KNMI uurgegevens (Data Platform / daggegevens.knmi.nl,
   sleutel in `.env`, gedeelde anonieme sleutel is verzadigd). Leg vast welke waarneming je als waarheid neemt.
2. **Kandidaat-schatters** (minstens drie, elk eenvoudig en uitlegbaar), bijvoorbeeld:
   - uit `radiation` via de heldere-hemelindex k_t = G/G_c en een decompositiemodel (Erbs/DISC/BRL) naar DNI, dan de
     fractie van het uur met DNI > 120 W/m² (met zonshoogte binnen het uur);
   - direct uit de bewolkingsvelden (`cloud_frac`, lage/middelbare/hoge bewolking) met een gefitte overgang;
   - een combinatie, of wat HARMONIE zelf eventueel als zonneschijnduur of directe straling levert (zoek uit of de
     GRIB-bestanden een veld voor directe straling of zonneschijnduur bevatten dat we nu negeren).
3. **Validatie.** Bouw een dataset van historische HARMONIE-runs (zoek uit wat het KNMI-archief aan HARMONIE-geschiedenis
   biedt; zo niet, verzamel vanaf nu runs en gebruik in de tussentijd de analyses / +1…+6 u) tegen KNMI-stationsuren
   (alle stations met SQ). Meet per schatter: MAE en bias in minuten per uur, per seizoen/zonshoogte als dat kan, en
   de vaardigheid tegen twee baselines: klimatologie (gemiddelde per uur en maand) en "zon als k_t > drempel".
4. **Extern vergelijk.** Neem Open-Meteo (`sunshine_duration`, gratis, uurlijks, ook historisch via hun archive/
   previous-runs API) mee als referentiemodel op dezelfde stations en uren. Google's Weather API alleen als het zonder
   betaalde sleutel kan; anders noteer je dat en sla je het over.
5. **Uitkomst.** Een korte tabel met de getallen, een gekozen schatter met motivatie, de kosten (rekentijd per frame,
   extra data), en een conceptvoorstel `.dev/proposals/0038-zonneschijnduur-per-uur.md` (Status: draft, Nederlands) met
   de keuze, de cijfers, hoe het in tabel/kaart/bot kan landen en wat open is voor de PO.

Python is hier toegestaan als wegwerpverkenning (uv, `uv run --with …`); scripts horen in de repo onder
`tools/zonneschijn/` en worden gecommit, zodat de meting vanuit een checkout reproduceerbaar is. Grote data niet
committen; leg vast waar ze vandaan komen.

## Gate voor "klaar"

De meting is reproduceerbaar met één gedocumenteerd commando (in de LOG en in de MIP), elk meetscript draait met een
letterlijke exitstatus 0 (`; echo "EXIT: $?"`, nooit achter een pipe), en de cijfers in de MIP komen uit die run.

Meld daarna in één bericht: branch-head, PR-link, de tabel met MAE/bias per schatter en baselines, Open-Meteo erbij,
je keuze, en wat open is voor de PO.

Stop en meld het bij een ontwerpvraag die hier niet in staat. Gok niet.
