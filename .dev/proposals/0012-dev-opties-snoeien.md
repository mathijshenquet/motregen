# MIP-12 — Inventaris en snoei van `?dev`-, URL- en tuningopties

Status: draft (PO 2026-09-25: "alle ?dev opties inventariseren, inclusief
hidden ?-opties, en terugsnoeien, anders loopt het uit de klauwen")

## Inventaris (main, 2026-09-25, `4c06c49d`)

### URL-parameters (8)

| param | doet | herkomst | voorstel |
| --- | --- | --- | --- |
| `?dev` | dev-paneel op de kaart | T3 | **houden** — de enige poort |
| `?perf=1` | PerfHud aan | T5 | **weg**: triple-tap op het merk doet dit al; binnen `?dev` een knop |
| `?labelfade=<ms>` | MapLibre `fadeDuration` | U8b (stadslabels in place) | **weg**: constante 0 (besluit U8b) |
| `?histogram=wait` | histogram wacht op volledige reeks i.p.v. skeleton | U1 | **weg**: skeleton won; dev-toggle "Grafiek vult" ook weg |
| `?zon=markering` | zon op/onder als markering in de uurcel i.p.v. eigen rij | U4 | **weg**: rij is default en U23 herwerkt de rij |
| `?uvbalk=stip` | UV-balk variant B | U15 | **weg**: variant A gekozen |
| `?klok=stip` | bronaccent als stip | U21 | **weg** (U22 doet dit al) |
| `?zoekpaneel=omsluit` | zoekpaneel variant B | U21 | **weg** (U22 doet dit al) |

### Dev-paneel op de kaart (28 knoppen)

Isolijnen (16): Isolijnen-stap, Oneven lijnen, Tijdvenster, Label-afstand,
Label-spatiëring, Vectorlijnen, Lusjes <, Verdichting, Bicubisch, Contour
px/CSS-px, Contour max Hz, Glad (labels), Vervagen, |∇T| laag, |∇T| hoog,
Snelheid laag, Snelheid hoog, Veldblur.
Focus (3): Focus dim, Tween in, Tween uit. Overig (9): Wolkrand, Grafiek
vult, Min. breedte, Temp-afstand, Splash ×, Herhaal splash, Reset alle
instellingen, maximale-zoomnotitie.

Voorstel — **houden (7)**: Isolijnen-stap, Vervagen, Label-afstand, Focus dim,
Min. breedte, Herhaal splash, Reset alle instellingen (PO 2026-09-25: Wolkrand weg,
inclusief de laag). Gegroepeerd per onderwerp met één regel uitleg per knop. Plus wat
U25 en U29 tijdelijk toevoegen (vulling-opacity/afval, tijdas, smoothing),
elk met vervaldatum (zie regel hieronder).
**Weg (20)**: alles wat een genomen besluit herhaalt (Vectorlijnen — U13;
Bicubisch, Verdichting, Contour px, Contour max, Glad, Lusjes — U13/U16
uitgetuned; Oneven lijnen — U25 maakt lijnen uniform; Tijdvenster — U8b;
|∇T|- en Snelheid-grenzen — gradiëntfade staat default uit, U13; Veldblur;
Tween in/uit — U19 vastgezet; Grafiek vult — U1; Temp-afstand — U7 auto;
Splash × — U7; Label-spatiëring — U7). De waarden worden constanten met de
gekozen waarde en één regel herkomst.

### PerfHud windknoppen (15, `motregen-wind-tuning-v3`, met JSON-export)

Dichtheid, Afstand per leven, Fade-in, Fade-out, Max. leeftijd, Spawn-jitter,
Snelheidsdemping, Buffer-rest, Buffer-DPR max, Kopintensiteit, Lijnbreedte,
Tempo, Intensiteit, Contrast, Max. fps.

Voorstel na U24: **houden (4)**: Dichtheid, Intensiteit, Lijnbreedte, Tempo.
De rest wordt constante; de tuning-v3-opslag houdt alleen die vier (v3 →
v4-migratie: onbekende sleutels vallen weg). JSON-export blijft (het is de
PO-terugkoppelweg).

### Opslag (`localStorage`, prefix `motregen-`)

Gebruikersstaat (blijft): `theme`, `saved-places`, `last-saved-place`,
`map-view`. Tuning: `wind-tuning-v3` (+ oude v1/v2 die reset al wist),
`splash-slowdown`. Alle isolijn-/focus-/wolkrand-instellingen zijn niet
persistent (goed). `splash-slowdown` gaat weg met de knop.

## Regel voortaan

1. **Eén poort**: alleen `?dev`. Geen losse `?`-parameters meer; een
   smaakvariant is een toggle in het dev-paneel.
2. **Elke knop heeft een eigenaar en een vervaldatum**: de spec die hem
   toevoegt noemt de track waarin hij verdwijnt (meestal: "bij merge, na
   PO-keuze"). Uiterlijk twee tracks later is hij weg of gepromoveerd tot
   product-instelling met een MIP.
3. **Smaakvarianten leven één track**: de PO kiest op stills in de LOG; de
   verliezer wordt in dezelfde merge verwijderd (U21/U22 als tegenvoorbeeld).
4. **Reset alle instellingen** blijft de vluchtweg en moet elke nieuwe
   tuning-sleutel meenemen (`PRESERVED_STORAGE_KEYS` is de whitelist).

## Uitvoering

Track U30 (na de merges van U22, U24 en U25, omdat die de betrokken knoppen
zelf al deels verwijderen): de tabel hierboven uitvoeren, constanten met
herkomst, tests van weggehaalde varianten verwijderen, `docs/dev-opties.md`
als de levende lijst (één regel per knop: naam, doel, eigenaar, vervalt bij).
