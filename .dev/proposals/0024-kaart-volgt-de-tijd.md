# MIP-24 — Kaart volgt de tijd: dag/nacht als tween i.p.v. als stand

Status: accepted (PO 2026-10-08 11:20) · 2026-10-08 · aanzet PO ("kan de kaart ook tweenen van dag naar nacht? dan hebben we
niet echt meer een dag- en nachtmodus; moet nadenken hoe we dat coherent terughalen")

## Waarom
Sinds U47/U62 kleurt het chrome met de tijd: hemel achter de scrubber, liniaal op de hemel, tabelkop
in de kleur van de bovenste rij, dag/nacht-rijen. De kaart is het enige grote vlak dat nog vast licht
of donker is (About › Weergave › Thema). Als de kaart de cursortijd volgt, wordt "scrubben naar
vannacht" één beweging over het hele scherm.

## Spanning
Een vaste themastand (licht/donker) is ook een toegankelijkheids- en voorkeurskeuze (zonlicht op het
scherm, oogvermoeidheid, OLED), en Expressief (U58) is al de schakelaar voor "het scherm leeft mee".

## Voorstel (coherent)
Thema krijgt drie standen: **Licht**, **Donker**, **Automatisch**. Automatisch = de kaart (en het
chrome) volgt de zonnestand van het cursoruur met een zachte tween; Licht/Donker blijven vaste
standen waarin het chrome wel meekleurt maar de kaart niet. Default: Automatisch onder Expressief
aan; Expressief uit → Licht/Donker zoals nu (systeemvoorkeur). Zo blijft de bestaande modus bestaan
als expliciete keuze en is "volgt de tijd" de rijkere default.

## Techniek
Eén stijl, paint-property-transities (achtergrond, water, land, grenzen, labels) geïnterpoleerd tussen
de licht- en donkerwaarden op `sinElevation(cursor)`, dezelfde bron als de hemel; geen twee stijlen
crossfaden (geheugen/parse op mobiel). Regen- en windlagen ongewijzigd; labelcontrast ≥ 4,5:1 in elke
tussenstand. Experiment via U62 achter `?dev` (meting frametijd/geheugen op po-android rond zonsondergang).

## Decision
PO 2026-10-08 (laptop, na het ?dev-experiment van U62): **de kaart gaat mee onder Expressief** — de
dag/nacht-tween is de default zolang Expressief aan staat; Expressief uit houdt het vaste thema (licht/
donker, systeemvoorkeur). Daarbij tinten ook de klokpil, de zoekbalk en het druppelmenu mee met het
cursoruur. Eén nuance open: een subtiele scheiding tussen kaart en zijpaneel (voorstel U62, twee varianten).
