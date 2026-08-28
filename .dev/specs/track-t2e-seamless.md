# Track T2e — seamless blend (+2…+6 u) (gpt-5.6-sol) — START NA T2D-MERGE

Read first: `AGENTS.md`, MIP-1 §2 (het seamless-product stond daar al als
post-MVP-kandidaat; PO heeft het nu in scope gezet), `docs/contract.md`
(source `"seamless"`, regime-prioriteit), de T2/T2b/T2c-LOG's. Your LOG:
`.dev/tracks/t2e-seamless/LOG.md` — committed. Branch: `track/t2e-seamless`.
Keys in `.env`.

## Goal

KNMI's **seamless precipitation forecast** (operationele nowcast⊕NWP-blend,
5-min resolutie tot +6 u) vult het venster +2…+6 u van de regen-tijdlijn,
zodat de overgang nowcast→model niet langer een harde knik op +2 u is.

## Tasks

1. **Discovery.** Er zijn twee varianten op het Data Platform: "5 minute
   ensemble members" en "5 minute exceedance probabilities" (beide "…up to
   6 hours ahead"). Ontdek exacte API-namen, formaat (HDF5?), grid, cadans,
   bestandsgroottes en members-structuur; documenteer in
   `docs/seamless.md`. Kies voor de kaart een deterministische
   best-estimate: de median/controle-member als die bestaat, anders de
   ensemble-mediaan per cel (motiveer; de kans-varianten zijn latere
   feature-stof, sla die dataset niet op).
2. **Ingest**: decode → reprojecteer naar het gedeelde grid → publiceer als
   `rain_rate`-chunks met `source: "seamless"`, alleen het venster dat
   verder reikt dan de verse pySTEPS-nowcast (+2…+6 u; als discovery leert
   dat het product de eerste 2 u identiek aan de nowcast levert, mag je dat
   venster ook gewoon publiceren — de client-prioriteit `nowcast >
   seamless` regelt de overlap). Cadans conform het product; atomaire
   publicatie + pruning zoals altijd.
3. **Motion-annexen** (T2d is dan gemerged): ook op de seamless-frames.
4. **Python-cross-check** (spot_check-patroon) + manifestvalidator
   uitbreiden met de nieuwe source.
5. **E2e**: daemon-run met seamless erin; laat in je LOG een tijdlijnbewijs
   zien: welke bron elk 5-min-slot tussen +0 en +6:30 u levert.

## Out of scope

Kansen/percentielen-features, frontend, deploy. `docs/contract.md` niet
wijzigen; walls (bijv. dataset achter aparte autorisatie) eerlijk loggen.

## Gates & receipts

Workspace fmt/clippy/test green, SYNCHROON met pipefail; repro's in je LOG;
onafhankelijke re-run volgt voor merge.
