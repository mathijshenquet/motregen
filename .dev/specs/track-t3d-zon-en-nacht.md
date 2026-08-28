# Track T3d — zonnetjes & day/night-cyclus (gpt-5.6-sol) — NOG NIET GESTART

Start pas na de merge van T3c (zelfde bestanden). Read first: `AGENTS.md`,
MIP-4 §5 + changelog (ronde-3-amendement), `docs/contract.md`,
`.dev/tracks/t3c-kaartlagen/LOG.md`. Your LOG: `.dev/tracks/t3d-zon-en-nacht/LOG.md`.
Branch: `track/t3d-zon-en-nacht`.

## PO-besluiten die dit track uitvoert

1. **Zon-iconen op de kaart, op proef.** Kleine zonnetjes op de kaart waar
   het (op het cursortijdstip) zonnig is — afgeleid uit `radiation`/`uv` en
   het dagvenster; spaarzaam geplaatst (zelfde anker-gedachte als de
   temperatuurlabels), relevantie-gated: 's nachts en bij dichte bewolking
   niets. Expliciet besluit: GEEN wolkenweergave of bewolkingslaag — de
   kaart moet zichtbaar blijven. Als het toch overweldigt: makkelijk
   uitzetbaar maken; PO beoordeelt visueel.
2. **Day/night-cyclus, gekoppeld aan de tijdcursor.** Een subtiele
   terminator-schaduw (nachtzijde iets donkerder, zachte overgangszone)
   die meebeweegt terwijl je scrubt — zonnestand berekend uit
   cursortijdstip (geen externe data nodig). Laagvolgorde: boven de
   basemap, onder wind/regen; werkt op beide thema's (in dark mode nóg
   subtieler). Scrubben blijft 60 fps.
3. Uurtabel: zon-kolom omschakelen van synthetisch naar echt (`radiation`
   uit T2b) en de insmeer-chip (zonkracht ≥ 3 uit veld `uv`, met sterkte)
   in header/tabel — relevantie-gated per MIP-4.

## Out of scope

Ingest/Rust, weersymbolen-iconenset voor de uurtabel (aparte ronde na de
licentiecheck), deploy. `docs/contract.md` niet wijzigen.

## Gates & receipts

Zoals T3c: `pnpm build`/`typecheck`/`test` green met SYNCHRONE receipts +
repro's in je LOG; onafhankelijke re-run voor merge; eindstaat manueel
beschreven (scrub door zonsondergang heen = zichtbaar bewegende terminator).
