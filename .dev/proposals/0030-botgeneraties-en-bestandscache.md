# MIP-30 — Botgeneraties samenvoegen en ruimte voor bestandscache

Status: draft · auteur: PM (sol) · 2026-10-11 14:15 CEST

## 1. Het probleem
De bot maakt alle drie Rust-films en 170 stills na iedere manifestpublicatie. Ingest publiceert vaak twee tot drie manifesten binnen een halve minuut; daardoor wordt vrijwel dezelfde generatie meerdere keren samengesteld. Een normale generatie duurt ongeveer 40 seconden op de VM.

De gecombineerde bot-unit heeft MemoryMax=1200M. Op 11 oktober om 14:14 lokaal waren er 404 hits op de geheugengrens, nul OOM-kills en nul herstarts. De 3,8 GB-VM had 2,8 GB beschikbaar geheugen. Het grootste tijdelijke deel is bestandscache plus renderwerk; de grens dwingt reclaim af terwijl andere diensten nog ruimte hebben.

## 2. Eerder werk
MIP-29 verplaatst de beeldgeneratie naar Rust. U80 meldde de dubbele generaties en stelde een wachttijd voor; dat voorstel is nog niet gebouwd. De PM-overdracht noemt beide punten als E1 en E2. U80 integreert nu de gekozen klok en het nieuwe filmtempo; die reeds gevraagde uitrol kan onafhankelijk doorgaan.

## 3. Aanbeveling
1. Verhoog uitsluitend MemoryMax van de gecombineerde bot-unit van 1200M naar 1600M. Houd de begrenzing, MemorySwapMax en overige hardening gelijk. Controleer na uitrol grenshits, OOM-kills, herstarts en generatietijd.
2. Start een nieuwe botgeneratie wanneer de laatst waargenomen manifestversie 30 seconden stabiel is. Een nieuw manifest herstart die wachttijd; een al gestarte generatie mag afmaken. Render daarna uitsluitend de nieuwste stabiele versie. Nieuwe botbeelden komen daardoor maximaal 30 seconden na de laatste publicatie later beschikbaar, met minder dubbele generaties. De app blijft het manifest direct volgen.

## 4. Open keuzes voor de PO
1. E1: MemoryMax naar 1600M voor de gecombineerde bot-unit, of 1200M behouden?
2. E2: 30 seconden stabiliteit vóór generatie, of meteen bij iedere manifestversie blijven starten?

## Changelog
- 2026-10-11 14:15 CEST: voorstel uit de PM-overdracht, aangevuld met een actuele productiecontrole. Geen implementatie of productieaanpassing voor deze keuzes uitgevoerd.
