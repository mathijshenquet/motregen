# MIP-20 — Intent-gedreven laden: één planner voor netwerk én decode, en tijdsneden als transport

Status: draft (PO 2026-10-07: "kunnen we netwerk niet ook time-major maken, of nog beter intent-
gedreven?")

## Het probleem

Na U49/U52 is het decoderen tijd-majeur, maar de requests niet: per veld een chunk, losse frames
via HTTP-Range, veld-voor-veld besteld. Op 4G is de wachtrij netwerk-gebonden (U52-meting:
bytes komen net zo snel binnen als ze gedecodeerd worden), dus de volgorde van requests bepaalt
wanneer histogram, wolken en tabel voor "nu" compleet zijn. Range-prefetches botsen bovendien
met Chromiums sparse HTTP-cache (LOG 2026-09-25).

## Aanbeveling

1. **Eén planner** (`Intent` → geordend wensenlijstje → fetch, decode, puntreeks): intent =
   modus (welke velden tellen), zichtbaar venster, afspelen + richting, scrubsnelheid als
   doelvoorspelling. Sleutel = afstand tot de cursor in tijd over alle velden; beperkte
   gelijktijdigheid (2–3 requests op krappe apparaten); buiten het venster alleen idle-werk; een
   nieuwe intent vervangt het lijstje (annulering bestaat sinds U49). Geen contractwijziging.
2. **Tijdsneden** (contractuitbreiding MIP-2): de ingest schrijft naast de veldchunks per
   tijdstap één bestand met de frames van álle velden plus index (per uur voor HARMONIE, per
   5 min in het nowcast-deel). Koude start = manifest + snede(nu): twee requests, geen Range,
   statisch en Cloudflare-cachebaar. Range alleen voor verre sprongen. Kosten: dubbele opslag
   (klein door MIP-8), ingest-werk, contract.
3. Volgorde: 1 in U52 (meetpunt window-ready per veld), 2 pas als de U52-meting laat zien dat
   het netwerk de grens blijft op 4G.

## Open vragen

1. Snedegrootte: per tijdstap of per uurblok (minder requests, meer bytes per request)?
2. Welke velden in de snede: alleen de kern (regen, motion, wolkenlagen, gevoel, wind) of alles?
3. Houden we de veldchunks voor desktop (bulk-prefetch is daar prima) — voorstel: ja.
