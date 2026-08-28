# MIP-1: motregen.nl MVP-architectuur

Status: draft — herzien na PO-ronde 1; alleen de stack-sanctie (§4) ligt nog voor
Auteur: orchestrator (fable)

## 1. Het probleem

Bouw motregen.nl: een regen-app van buienradar-klasse voor Nederland op KNMI
open data. Producteisen van de PO:

- **Eén unified time slider** over drie regimes: history (gemeten radar),
  nowcast (KNMI's operationele model, ~2 u) en AROME-achtige midcast.
- **Kaart van NL met regen eroverheen** — geen server-gerenderde PNG's maar
  binaire data, client-side uitgepakt en geanimeerd (WebGL). De
  codec-vraag is afgesplitst naar MIP-2.
- **Locatie-picker** + browser-geolocation.
- **Rain intensity meter**: de neerslagintensiteit op de gekozen locatie,
  afleesbaar over de hele tijdlijn.
- Gevoel/referentie: DWD WarnWetter.

Deze MIP legt de databronnen, de pipeline-vorm, de frontend-stack en de
MVP-snit vast. Het is het funderende architectuurbesluit.

## 2. Eerder werk

**Referentie-apps.** Buienradar (2 u nowcast als colormapped PNG-frames op een
statische kaart; de klassieke regengrafiek per locatie). DWD WarnWetter
(volwaardige pan/zoom-kaart, timeline-scrubber, detail per locatie).
RainViewer (wereldwijde radartiles, vloeiende WebGL-animatie).

**KNMI-data (geverifieerd op het Data Platform, 2026-08-28).** Alles
CC-BY-4.0, alles bereikbaar via één API
(`api.dataplatform.knmi.nl/open-data/v1/datasets/{name}/versions/{v}/files`,
list + presigned download-URL per file), plus een MQTT-notificatieservice die
per nieuw bestand een bericht pusht — KNMI verkiest dat expliciet boven
pollen. Portaal-technisch zijn **Open Data API** en **Notification Service**
aparte key-aanvragen; EDR en WMS hebben we niet nodig.

| regime | dataset | inhoud |
| --- | --- | --- |
| history | `nl_rdr_data_rtcor_5m` 1.0 | 5-min radaraccumulaties, realtime regenmeter-gecorrigeerd, 1×1 km, HDF5, elke 5 min; archief sinds 2018-12 (aparte `..._tar`-dataset voor bulk-backfill) |
| nowcast | `radar_forecast` 2.0 | KNMI's operationele pySTEPS-nowcast, geïnitialiseerd op RTCOR-5m: 25 stappen × 5 min (+0…+120 min), 1×1 km, HDF5, elke 5 min een verse run |
| midcast | `harmonie_arome_cy43_p1` 1.0 | HARMONIE-AROME cy43 (UWC-West), regulier lat-lon ~2 km, uurstappen tot +60 u, GRIB, 4 runs/dag; archief sinds 2026-01-08 |

Noemenswaardig: KNMI publiceert ook een **seamless precipitation ensemble
forecast** (nowcast⊕NWP-blend, 5-min resolutie tot +6 u, members +
overschrijdingskansen). Dat is de natuurlijke latere upgrade voor de lelijke
naad bij +2 u en voor WarnWetter-achtige kans-arcering — bewust buiten de MVP.

**API-keys.** De publieke anonieme key wordt gedeeld door alle
ongeregistreerde gebruikers en was bij elke probe vandaag rate-limited. Een
geregistreerde key (gratis, 200 req/s, 1000 req/u) is in de praktijk vereist.

**Grids.** De radarproducten leven op het KNMI polair-stereografische 1
km-composietgrid (700×765); AROME op een regulier lat-lon-grid. Twee
projecties en resoluties die op het scherm één product moeten lijken.

## 3. Aanbeveling

Drie componenten, verbonden door een statisch file-contract.

**Ingest (Rust).** Een kleine daemon: MQTT-notificaties (poll-fallback) →
HDF5/GRIB downloaden → elke bron reprojecteren naar **één gedeeld grid**
(EPSG:3857 over NL + marge, ~1 km; de polair-stereografische transformatie is
gepubliceerde, vaste wiskunde — we prebakken index-maps zodat reprojectie een
gather wordt) → kwantiseren naar 8-bit regenintensiteit (curve in MIP-2) →
per tijdstap één gecomprimeerd binair frame (formaat: MIP-2) plus één
`manifest.json` met de hele tijdlijn (atomair geswapt). De naad
radar-vs-AROME één keer serverside oplossen houdt de client triviaal: elk
frame is hetzelfde grid, dezelfde encoding, ongeacht herkomst.

*Waarom Rust en niet Python?* De eerlijke afweging: Python's enige echte
troeven zijn exploratiesnelheid (h5py/cfgrib/xarray/matplotlib) en de
referentie-implementaties in het meteo-ecosysteem. Performance is irrelevant
(één frame per 5 min). Voor de productie-daemon wint Rust op ops: één
statische binary (nix-vriendelijk, huisstijl), geen venv-drift, robuust
long-running (MQTT-reconnects, geheugen), en de frame-encoder deelt zijn
typemodel met de format-spec. HDF5 is in Rust volwassen (`hdf5-metno`); het
échte risico is GRIB — gemitigeerd via de eccodes-FFI-crate (libeccodes zit
in nixpkgs) en afgedekt in T1: één AROME-bestand end-to-end decoderen vóór
dit besluit definitief is. Python blijft toegestaan als wegwerp-verkenning en
als onafhankelijke validator (uv-scripts die in T2 de Rust-output
cross-checken tegen h5py/cfgrib) — nooit in het productiepad.

Tijdlijncompositie: history = RTCOR-frames (3 u terug); +0…+2 u = laatste
nowcast-run; daarna = laatste AROME-run, uurlijks tot +24 u. Totaal ~85
frames. Het manifest draagt per frame provenance (bron, run, geldigheidstijd)
zodat de UI de regimes eerlijk kan labelen.

**Serving.** Frames zijn immutable → statische file-tree achter een
webserver, lange cache-lifetimes; de client pollt alleen het kleine manifest.
Geen runtime-backend in de MVP. Dev draait op **ageq-mthq**; deploy later
naar een eigen box (zelfde statische contract, dus een rsync-doelwijziging).

**Frontend (Vite + TypeScript + MapLibre GL + SolidJS).** MapLibre met
OpenFreeMap-vectortiles; regen als custom WebGL-layer: gedecodeerde frames
als single-channel textures, een fragment shader doet de colormap-LUT en
blendt aangrenzende frames voor vloeiend scrubben.

*Waarom SolidJS?* De kern van deze app (decoder, WebGL-layer, tijdmodel) is
sowieso framework-vrije TS — het framework is een dunne schil voor slider,
meter en chrome. Solid's fine-grained signals passen precies op de hete
toestand (de tijdcursor verandert op 60 fps tijdens scrubben; geen
vdom-re-render-churn), de bundle is klein, en de PO is nieuwsgierig. React
blijft de vluchtroute: doordat de kern framework-vrij is, is de schil
verwisselbaar. *Styling:* geen shadcn — deze app heeft vrijwel geen
stock-chrome (geen forms/tables/dialogs) en shadcn is bovendien
React-centrisch. Tailwind v4 plus een klein eigen componentensetje, zodat de
visuele identiteit (druppel-logo, kaart-first, WarnWetter-gevoel) echt van
ons is.

UI: de unified slider met zichtbare regime-segmentatie
(history | nu | nowcast | model) en play/pause; tap-to-pick + geolocation; de
intensity meter leest dezelfde gedecodeerde arrays op de gekozen cel — meter
en kaart zijn per constructie consistent — als actuele waarde plus regengrafiek
over de hele tijdlijn (de buienradar-grafiek, maar scrubbaar).

**Uitvoeringsplan** (tracks in herdr-worktrees, spec per track):

- T0 scaffold: devenv, repo-layout, CI-skelet — terra.
- T1 ingest-spike: keys, van elk dataset één bestand gedecodeerd,
  reprojectie-PoC met plots; de Rust-GRIB-gate — sol (meetgevoelig).
- T2 encoder + manifest conform MIP-2, incl. Python-cross-check — sol
  ontwerpt, terra hardt af.
- T3 frontend-shell op synthetische frames: kaart, WebGL-layer, slider — sol.
- T4 integratie + intensity meter + geolocation — terra onder strakke spec.
- T5 polish-pass vs WarnWetter-referentie, druppel-logo/favicon —
  orchestrator + PO-review.

T1 en T3 lopen parallel zodra T0 landt; het manifest/frame-contract (MIP-2)
staat op papier vóór een van beide kanten het consumeert.

**MVP-snit.** History 3 u terug (archief-backfill is een vlag, geen feature);
geen PWA/push, geen waarschuwingslaag, geen ensemble/kans-arcering;
responsive web, geen native apps.

## 4. Open vragen

1. **Stack-sanctie**: akkoord met Rust-ingest (met de T1 GRIB-gate als
   ontbindende voorwaarde) en SolidJS + Tailwind v4 zonder shadcn? Dit is de
   laatste openstaande keuze van deze MIP.

## 5. Besluiten (PO-ronde 1, 2026-08-28)

- Kaartaanpak akkoord: MapLibre GL + OpenFreeMap-tiles.
- History in de slider: **3 u** voor v1.
- Midcast-horizon: **+24 u** (korter dan de voorgestelde +48 u).
- Hosting: dev op **ageq-mthq**; deploy t.z.t. op een eigen box. Domein
  motregen.nl is al geregeld (Porkbun).
- Logo: **een druppel**.
- Proposals en productteksten in het **Nederlands**.
- Aan te vragen KNMI-keys: **Open Data API** + **Notification Service**
  (aparte aanvragen; EDR/WMS niet nodig).

## Changelog

- 2026-08-28: draft (Engels).
- 2026-08-28: herzien na PO-ronde 1 — vertaald naar NL; besluiten §5
  vastgelegd; backend-aanbeveling Python→Rust na PO-verzoek tot afweging;
  frontend-framework (SolidJS) en styling (Tailwind, geen shadcn) toegevoegd;
  horizon +48 u → +24 u; history 3 u.
