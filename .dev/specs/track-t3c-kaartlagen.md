# Track T3c — kaartlagen: dark-parity + wind-particles + temperatuur (gpt-5.6-sol)

Read first: `AGENTS.md`, MIP-4 §5 + changelog (het wind/dark-amendement is
PO-besloten), `docs/contract.md` (nieuwe veldenlijst, wind-paar-regel,
versoepelde quant-regel), `.dev/tracks/t3b-ux-round1/LOG.md`. Your LOG:
`.dev/tracks/t3c-kaartlagen/LOG.md`. Branch: `track/t3c-kaartlagen`.

Context: dev op 4173 draait tegen ECHTE data via de vite-proxy → caddy
:8080. De echte velden uit track T2b landen parallel; jij bouwt tegen een
uitgebreide synthgen en test met `MOTREGEN_SYNTH=1` (synthetische dataset);
zodra T2b merged werkt hetzelfde zonder die vlag.

## PO-besluiten die dit track uitvoert

1. **Dark-kaart naar het niveau van light.** PO: light is nu duidelijk
   beter. Concreet: (a) economische-zone-/maritieme grenslijnen (EEZ)
   verdwijnen uit de dark-stijl (en check light op hetzelfde); (b)
   terrain-/landcover-tinten die light wél heeft komen terug in dark —
   baseer de dark-variant desnoods op een hertintte liberty in plaats van
   de kale dark-stijl. Zelfde wegen-filter als nu.
2. **Wind-particles, Windy-stijl maar subtieler.** Een WebGL
   particle-advectielaag ÓNDER de regenlaag (~60% opacity): dichtheid
   duidelijk lager dan Windy, particle-snelheid evenredig met de lokale
   windsnelheid, subtiele kleurcodering op Beaufort-schaal. Data: het
   `wind_u_ms`/`wind_v_ms`-paar uit het contract (zip per frame tot
   vectoren; interpoleer in tijd met de bestaande frame-blending-mix).
   Performance-eis: 60 fps op mobiel; degradeer dichtheid vóór framerate.
3. **Temperatuur op de kaart** (MIP-4): stads-verankerde getallabels uit
   `temp_c`/`feels_like_c`, met de switcher temperatuur ↔
   gevoelstemperatuur, default gevoelstemperatuur. Labels blijven leesbaar
   op beide thema's en verdwijnen niet onder de regen.

## Tasks

- `synthgen` uitbreiden: plausibele `wind_u_ms`/`wind_v_ms` (coherent
  stromingsveld, paar-regel!), `temp_c`, `feels_like_c` per contract.
- mrf-client: quant-validatie versoepelen conform contract (alleen index
  255 = null universeel; `quant[0]==0` alleen voor rain/radiation) —
  vergeet de bestaande test niet.
- De drie PO-punten hierboven; layer-volgorde: basemap → wind → regen →
  labels/markers.
- Velden die in een manifest ontbreken (zolang T2b nog niet merged):
  features verbergen zich netjes — geen errors, geen lege UI-resten.
- Documenteer je bft-kleurramp en dichtheidskeuzes kort in je LOG (PO
  stuurt op visual feedback; maak de dichtheid/opacity makkelijk tweakbaar
  als constants).

## Out of scope

Ingest/Rust, uurtabel-uitbreiding, insmeer-chip, weersymbolen (volgende
ronde), deploy. `docs/contract.md` niet wijzigen.

## Gates & receipts

- `pnpm build` / `pnpm typecheck` / `pnpm test` green (nieuwe tests: quant-
  validatie per veld, wind-zip, synthgen-paar-invariant); SYNCHRONE receipts
  + repro's in je LOG; onafhankelijke re-run volgt.
- Eindstaat: `MOTREGEN_SYNTH=1 pnpm dev` toont wind-particles onder
  synthetische regen + temperatuurlabels + verbeterde dark-kaart; beschrijf
  je handmatige checks in je LOG.
