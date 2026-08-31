# Track T2g — data-dieet: waarom is de sessie 20 MB en wat mag weg? (gpt-5.6-sol)

Read first: `AGENTS.md`, MIP-2 (accepted; let op het gereserveerde
`dict`-veld én het intra-only-besluit), MIP-4 §5 (welk veld waarvoor
gebruikt wordt: cloud_frac/rel_humidity/radiation zijn ALLEEN
uurtabel/pictogram-input; temp/feels-like zijn stads-labels; wind voedt de
particles), `docs/perf.md` (baselines: sessie 20,1 MB), `docs/grid.md`
(T2c-vergroting), `docs/mrf.md`. Meetdata: de live werkset in `data/chunks`
(23,7 MB; uitsplitsing in orchestrator-LOG 2026-08-31). Your LOG:
`.dev/tracks/t2g-data-dieet/LOG.md` — committed. Branch:
`track/t2g-data-dieet`. Keys in `.env`.

## Goal

Eerst BEGRIJPEN waar de bytes zitten, dan de veilige winsten implementeren,
en de contract-rakende opties als onderbouwd voorstel aan de PO voorleggen.
Geen kwaliteitsverlies op het kernproduct (regen op de kaart).

## Fase 1 — meten (rapport in `docs/data-dieet.md`)

Per veld/bron, op de echte werkset: bytes/frame, resolutie, aandeel
no-data/zee, gecomprimeerde entropie-analyse (wat doet 2×/4×/8×
subsampling met de bytes én met de zichtbare kwaliteit voor het
daadwerkelijke gebruiksdoel), effect van een per-chunk zstd-dictionary
(train op de frames, meet winst per veldtype), effect van delta-encoding op
de regenreeksen (informatief — MIP-2 koos intra-only; heropening is aan de
PO). Splits ook: wat kost een PASSIEVE sessie (openen, niks doen) vs de
volledige scrub-journey — dat verschil bepaalt de echte gebruikerspijn.

## Fase 2 — veilige winsten implementeren (contract-compatibel, alleen server)

1. Tabel-/pictogramvelden (`cloud_frac`, `rel_humidity`, `radiation`)
   agressief subsamplen — de client leest het grid per chunk-header, dus
   dit is puur een ingest-knop. Kies de resolutie op het gebruiksdoel
   (stads-niveau volstaat) en onderbouw met een before/after op de tabel.
2. `temp_c`/`feels_like_c`: idem afwegen (labels + tabel; particles-eis
   geldt hier niet).
3. Wind: meet welk niveau de particles visueel nodig hebben; conservatief.
4. Overweeg land+kust-crop voor velden waar zee betekenisloos is —
   alleen als de winst na subsampling nog materieel is.
Doel: uurvelden van 11,3 MB naar ≤ ~2 MB zonder zichtbaar verlies.

## Fase 3 — voorstel voor de rest (NIET implementeren)

Concept-MIP-8 (`.dev/proposals/0008-data-dieet.md`, Status: draft, met jouw
metingen als §2): per-chunk dictionary (vereist client-wijziging: de
mrf-client valideert nu `dict === null`), delta-frames (heropening
MIP-2-besluit), en eventuele lazy-loading-strategieën (client-gedrag).
Elke optie met gemeten MB-winst, complexiteit en risico — zodat de PO per
optie een korte taste call kan doen.

## Out of scope

Frontend-wijzigingen, contract-wijzigingen (voorstellen mag, doorvoeren
niet), regen-kwaliteit verlagen.

## Gates & receipts

Workspace fmt/clippy/test green; e2e-suite (`pnpm e2e` op main-web tegen je
nieuwe data) blijft green; SYNCHRONE receipts; daemon-e2e met de nieuwe
resoluties incl. gemeten totaal vóór/na. Onafhankelijke re-run volgt.
