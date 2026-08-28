# Track T3e — PO-nitpickronde: frame, stad, histogram, uurtabel (gpt-5.6-sol) — START NA T3D-MERGE

Read first: `AGENTS.md`, MIP-4 changelog (ronde-4-amendement — alle punten
hieronder zijn PO-besloten), `docs/contract.md` (velden incl.
`rel_humidity`/`cloud_frac` uit T2c), `.dev/tracks/t3c-kaartlagen/LOG.md`
en `.dev/tracks/t3d-zon-en-nacht/LOG.md`. Your LOG:
`.dev/tracks/t3e-nitpicks/LOG.md` — committed met je werk (projectconventie).
Branch: `track/t3e-nitpicks`.

## De PO-punten

1. **Kaartframe (EU4-gevoel).** De regen mag nooit zichtbaar "wegclippen":
   begrens de kaart (maxBounds afgeleid uit het manifest-grid plus marge)
   en geef het datagebied een expliciet kaartframe — een rand/kader met
   buiten het frame een gedempte achtergrond, alsof je tegen de rand van
   een kaarttafel aankijkt. Uitvoering/taste is aan jou; subtiel > skeuomorf.
   (T2c vergroot het datagrid parallel; lees extent altijd uit headers.)
2. **Dichtstbijzijnde stad bij klik.** Kaartklik toont de dichtstbijzijnde
   plaats (PDOK reverse geocoding, of dichtstbijzijnde uit een lokale
   plaatsenlijst — kies en documenteer) in plaats van kale coördinaten.
3. **Histogram-scrubber-redesign.** De losse dynamische velden ("Droog",
   "0,73 mm/u") vervallen; die informatie verhuist naar de grafiek zelf:
   - y-as met labels én shaded horizontale classificatiebanden
     (droog/licht/matig/zwaar — gebruik de gangbare meteorologische
     grenzen, documenteer ze);
   - hover/touch-tooltip met exacte mm/u + tijdstip;
   - tijdlabels op de x-as;
   - regimes als gelabelde zones in de tijdlijn: Observaties | Nowcast |
     Model (vervangt losse dynamische regime-tekst);
   - **experiment lijn vs staaf**: implementeer beide achter een zichtbare
     dev-toggle; PO kiest visueel. Documenteer je eigen aanbeveling in LOG.
4. **Tijdlijncompositie: verleden = alleen observaties.** Geen model- of
   nowcast-frames meer voor t < nu; oude modelruns verdwijnen uit het
   verleden-deel van de tijdlijn (aanpassing in het time-model + tests).
5. **Uurtabel → vibe-based.** Per uur: weerpictogram (afgeleid uit
   `cloud_frac` + `rain_rate`, met zon/maan-varianten voor dag/nacht;
   afleidingsregels documenteren), (gevoels)temperatuur conform de
   switcher, luchtvochtigheid, wind (richting + Beaufort), regen. Compact
   en scanbaar; kolommen verbergen zich netjes zolang een veld ontbreekt.
   Pictogrammen: eigen minimale set of Meteocons (MIT) — licentiecheck
   KNMI-app-iconen mag je overslaan als Meteocons bevalt; PO stuurt op
   visual feedback.

## Out of scope

Ingest/Rust (T2c doet grid+velden), deploy, PWA. `docs/contract.md` niet
wijzigen.

## Gates & receipts

`pnpm build` / `pnpm typecheck` / `pnpm test` green (tests voor het nieuwe
time-model-gedrag, classificatiebanden, pictogram-afleiding); SYNCHRONE
receipts + repro's in je LOG; onafhankelijke re-run volgt. Eindstaat
handmatig beschreven, incl. het lijn-vs-staaf-vergelijk.
