# MIP-8: data-dieet na veilige ruimtelijke integratie

Status: draft
Auteur: T2g (codex), 2026-08-31

## 1. Het probleem na de veilige winst

T2g reduceert de zeven AROME-uurveldchunks contract-compatibel van 11,24 MB
naar 1,92 MB. Regen blijft bewust op 1 km. Daardoor daalt de actuele
manifest-werkset naar circa 12,59 MB en de gemeten volledige browser-
chunktransfer naar circa 8,45 MB. Dit voorstel beoordeelt de resterende
opties die het mrf-contract of clientgedrag raken; T2g implementeert ze niet.

De smaakvraag is niet langer „hoe krijgen we koste wat kost onder 20 MB?”,
maar of extra complexiteit na de veilige halvering nog productwaarde heeft.

## 2. Metingen

Werkset: 12 live chunks, manifest van 2026-08-31 13:52:05Z. Volledige
methode en veldtabellen staan in `docs/data-dieet.md`.

- manifest-chunks: 21.904.585 B, waarvan regen 10.456.776 B, uurvelden
  11.235.449 B en UV 212.360 B;
- passief openen: 17.096.316 B chunktransfer; volledige scrub:
  17.768.318 B; passief veroorzaakt dus al 96,2% van de uiteindelijke
  chunkbytes;
- inclusief app/HTTP-overhead: 21.498.845 B passief en 22.170.607 B na
  scrubben (97,0% passief);
- veilige T2g-projectie op hetzelfde browserpad: circa 7,78 MB passief en
  8,45 MB na scrubben;
- een dictionary tot 64 KiB, getraind op alle frames van zijn eigen chunk,
  vergroot het totale beeldpayload van 21.720.023 B naar 22.325.966 B:
  **−0,606 MB winst** oftewel +2,8%; per veld is de uitkomst +0,5…+7,9%;
- exacte regen-delta's vergroten 10.302.316 B intra-payload naar
  14.507.956 B (XOR) of 14.516.398 B (subtractie): beide circa **−4,21 MB
  winst** oftewel +40,8…40,9%;
- van de passieve chunktransfer is circa 5,65 MB regen. Dat is de gemeten
  bovengrens die een current-first client kan uitstellen; de resterende
  circa 2,13 MB na T2g bevat de uurvelden, UV, headers en het huidige
  regenvenster.

## 3. Optie A — per-chunk zstd-dictionary

**Byte-effect:** ongunstig: +0,606 MB op de gemeten werkset, nog vóór de
JSON/base64-representatie van de dictionary. Op de na T2g veel kleinere
uurframes wordt vaste dictionary-overhead relatief nog duurder.

**Complexiteit:** hoog. De client valideert nu `dict === null`; Rust en
TypeScript moeten een bytecodering vastleggen, dictionary-decompressie
ondersteunen en Range-/cachetests uitbreiden. Het gereserveerde veld in MIP-2
maakt dit ontwerpbaar, maar niet gratis.

**Risico:** meer decoderpaden en een grotere header vóór het eerste frame,
zonder bytewinst.

**Aanbeveling:** niet adopteren. Alleen heropenen op een nieuwe corpusvorm
waar een onafhankelijke meting na dictionarybytes minstens 10% wint.

## 4. Optie B — deltaframes voor regen

**Byte-effect:** ongunstig: +4,21 MB (+40,8%) voor zowel XOR als subtractie.
Advectorende regen verplaatst patronen; een simpele celdelta tekent daardoor
twee veranderingsranden. Motion-compensated delta is niet gemeten en zou een
veel groter codecproject zijn.

**Complexiteit:** hoog. Heropent het intra-only-besluit uit MIP-2, maakt
willekeurig scrubben afhankelijk van een voorganger/keyframe en vraagt nieuw
Range-, cache-, fout- en progressive-decodegedrag.

**Risico:** slechtere random access en foutpropagatie, precies in de
kerninteractie, met aantoonbaar meer bytes voor de eenvoudige varianten.

**Aanbeveling:** MIP-2 intra-only handhaven. Motion-compensated codecs pas als
afzonderlijk onderzoek met de bestaande ≥3×-gate uit MIP-2.

## 5. Optie C — current-first lazy loading

**Byte-effect:** geen totale winst voor een gebruiker die alsnog de hele
reeks bekijkt, maar potentieel tot circa 5,65 MB minder op een korte passieve
sessie na T2g. Dat is een gemeten bovengrens: een huidig regenframe plus zijn
buurframes moet direct blijven laden, dus de echte winst ligt iets lager.

**Gedrag:** laad eerst het zichtbare regenpaar, huidig wind-/temperatuurpaar
en de 24-uurtabel. Stel de volledige regenreeks voor het histogram uit tot
eerste interactie of een expliciete idle-fase. Toon tot die tijd eerlijk een
gedeeltelijk histogram; geen verborgen fetch die dezelfde passieve bytes
alleen enkele seconden verschuift.

**Complexiteit:** middel. Alleen clientplanning en loading-states; mrf en
server blijven gelijk. De bestaande LRU, batchfetch en e2e-journey moeten
worden aangepast.

**Risico:** de regenlijn is een kernproduct. Een incompleet histogram kan
meer kwaliteitsverlies voelen dan 5–6 MB op een Cloudflare-cachebare sessie.
Te agressieve lazy loading kan bovendien requeststorms bij de eerste scrub
terugbrengen.

**Aanbeveling:** eerst T2g live meten. Alleen prototypen als de resterende
circa 8,45 MB full-sessiontransfer nog als gebruikerspijn zichtbaar is; dan
een PO-smaaktest doen op onmiddellijk compleet histogram versus current-first.

## 6. Gevraagde PO-calls

1. Dictionary sluiten op basis van de negatieve meting? Aanbeveling: ja.
2. Intra-only uit MIP-2 handhaven? Aanbeveling: ja.
3. Na livegang van T2g een current-first prototype laten maken, of de
   resterende bytes accepteren voor een onmiddellijk complete regenlijn?
   Aanbeveling: eerst de nieuwe live baseline bekijken.

## Changelog

- 2026-08-31: draft op basis van de T2g-livecorpus- en sessiemetingen.
