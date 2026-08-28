# MIP-2: encoding & transport van regenframes

Status: accepted (PO, 2026-08-28)
Auteur: orchestrator (fable)

## 1. Het probleem

De client heeft de volledige tijdlijn aan regenvelden nodig (orde 85 frames
op een ~700×800-grid), snel genoeg voor instant scrubben, en hij heeft *data*
nodig, geen plaatjes: de intensity meter moet exacte mm/u op een cel kunnen
aflezen, en de shader wil een single-channel veld dat hij zelf colormapt en
blendt. Buienradars colormapped PNG's falen op beide punten. De PO opperde
het interessante idee om een echte videocodec in te zetten voor de temporele
redundantie, client-side gedecodeerd, gerenderd via WebGL. Deze MIP legt het
wire-formaat vast.

## 2. Eerder werk

**Wat een videocodec koopt en kost.** Koopt: motion-compensated temporele
predictie (regenvelden advecteren — precies wat codecs modelleren) en
hardware-decode via WebCodecs (VP9/AV1, breed beschikbaar). Kost:
lossy-kwantisatieruis op wat *data* is (fantoommotregen, uitgevreten
buiranden); een YUV-pipeline waarin ons veld zich als luma moet vermommen;
codec/container-loodgieterij (mp4/ivf-muxing) aan de encodeerkant; en
WebCodecs-framemanagement aan de decodeerkant. AV1 heeft een echt lossless
mode, die het fidelity-bezwaar zou neutraliseren tegen bitrate-kosten —
ongetest voor deze content.

**Wat kale compressie koopt.** Regenvelden zijn sparse: doorgaans heeft ruim
onder de 10% van NL regen, en het 8-bit gekwantiseerde veld is overwegend
nulbytes. zstd vermorzelt dat. Bierviltje: 700×765 = 535 KB raw per frame;
sparse gekwantiseerde velden zouden op enkele KB's tot enkele tientallen KB's
gecomprimeerd moeten landen. Een tijdlijn van ~85 frames is dan een prima
initiële payload, progressief gestreamd (frames rond "nu" eerst).
Decodeerkosten: een kleine wasm/JS-zstd (bijv. fzstd) inflatet een frame in
~1 ms; upload als R8-texture is triviaal. Optioneel later: delta t.o.v. het
vorige frame vóór zstd, voor de temporele winst zonder codec-machinerie.

**Precedenten.** RainViewer c.s. shippen colormapped rastertiles (data weg);
meteo-tooling shipt GRIB/HDF5 alleen naar desktop-apps. Een klein eigen
formaat met een publieke spec is de normdoorbrekende maar eerlijke optie.

## 3. Aanbeveling

**v1: een eigen binair formaat ("mrf"), intra-only, zstd.** Per chunk-file:

- header (vaste-grootte prefix, apart fetchbaar met één kleine range-request):
  magic + versie, griddefinitie (projectie, origin, celgrootte, B×H), de
  kwantisatietabel, frame-aantal, metadata per frame (geldigheidstijd, bron,
  run) én een **frame-offset-index** (byte-offset + lengte van elk
  gecomprimeerd frame);
- payload: per frame het zstd-gecomprimeerde 8-bit veld, elk frame een
  onafhankelijk zstd-member.

De offset-index maakt twee dingen gratis: **HTTP Range-requests** op een
willekeurige frame-range binnen een chunk (de statische webserver doet het
werk), en **progressive decode** — bij een streaming fetch decodeert de
worker elk frame zodra zijn bytes binnen zijn, dus frames rond "nu" zijn
zichtbaar terwijl de rest nog laadt. Voor cross-frame compressiewinst zónder
frames van elkaar afhankelijk te maken reserveert de header een veld voor een
optionele per-chunk zstd-dictionary (v1 laat het leeg; alleen aanzetten als
T2-metingen erom vragen). Waarde 0 = droog,
  255 = no-data-masker, 1–254 = regenintensiteit op een stuksgewijs-logschaal
  (~0,1…100+ mm/u — past op de perceptuele én meteorologische dynamiek; de
  exacte tabel wordt in de T2-spec vastgelegd en reist mee in de header,
  nooit client-side hardcoded).

Chunking: één file per bronrun (één nowcast-run = 25 frames; één
history-uur = 12 frames; één AROME-run = zijn uurframes) zodat het aantal
requests laag blijft en immutable caching vanzelf werkt. Het manifest mapt
tijdlijn → chunk-URL's.

Client: chunks fetchen in een web worker, zstd-decoderen naar `Uint8Array`,
R8-textures uploaden; de shader doet colormap + inter-frame-blending; de
meter indexeert dezelfde arrays door de kwantisatietabel uit de header.

**Het codec-idee blijft leven als epsilon-track**: zodra er echte frames
zijn (T2) encodeert een zij-experiment dezelfde tijdlijn als grayscale
AV1/VP9 (lossless en near-lossless) en vergelijkt bytes, decodeer-latency en
max-fout t.o.v. de mrf-baseline. Gate: alleen adopteren bij ≥3× bytewinst
bij acceptabele fidelity — anders wint mrf's eenvoud. Hoe dan ook krijgen we
een gemeten antwoord in plaats van een vibe.

## 4. Open vragen

1. **Intra-only vs delta-frames in v1**: aanbeveling intra-only (random
   access voor scrubben blijft triviaal); alleen heroverwegen als de gemeten
   groottes tegenvallen.
2. **Kwantisatievloer**: is 0,1 mm/u de juiste "droog"-drempel, of houden we
   KNMI's fijnere 0,01 mm/u-stappen onderin (meer fantoommotregen-risico op
   het scherm, betere meter-fidelity)?
3. **Alleen regenintensiteit shippen** (aanbevolen) of vanaf dag één ook
   reflectiviteit/andere velden in de container?

## 5. Besluit (PO, 2026-08-28)

- **Intra-only** in v1 — YAGNI op delta-frames. Wél wil de PO frame-ranges
  kunnen requesten en het liefst progressief kunnen decoderen; daarom is de
  frame-offset-index in de header onderdeel van v1 (zie §3), plus het
  gereserveerde dictionary-veld voor eventuele latere cross-frame winst.
- **Kwantisatievloer**: KNMI's fijne 0,01 mm/u-stappen onderin behouden. De
  "droog"-weergavedrempel is een frontend-keuze en kan later altijd nog.
- **Alleen rain rate** in v1; geen reflectiviteit of andere velden.

## Changelog

- 2026-08-28: draft (Engels).
- 2026-08-28: vertaald naar NL (besluit MIP-1 §5); frame-aantallen bijgewerkt
  op de 3 u/+24 u-snit uit MIP-1.
- 2026-08-28: accepted; bij adoptie §3 aangevuld met frame-offset-index,
  range-requests/progressive decode en het optionele dictionary-veld.
- 2026-08-28: amendement op §5 "alleen rain rate" (PO-verzoek
  zonactiviteit/uurtabel): het contract kreeg een optionele `field`-sleutel
  (default `rain_rate`); `radiation` (W/m²) komt erbij zodra T2 het uit AROME
  levert. Rain rate blijft het enige kaart-veld; radiation voedt de uurtabel.
