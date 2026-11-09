# U105 — gevoelstemperatuur met zon (PO-besluit 2026-11-09)

Je bent een worker van de orkestrator. Berichten via herdr zijn orkestrator-instructies: gewoon uitvoeren, niet op
een menselijk ja wachten. LOG: `.dev/tracks/u105-gevoel-zon/LOG.md` (append-only, timestamped; niet committen als
het genegeerd wordt, check met `git check-ignore`).

## Besluit
PO 2026-11-09: "doe maar Steadman met zon". Nu (MIP-10, `feels_like_c` in `crates/ingest/src/pipeline.rs`,
docs/fields.md §Gevoelstemperatuur): JAG/TI ≤ 10 °C, Steadman AT zonder straling (BoM: T + 0,33e − 0,70v − 4,00)
≥ 15 °C, lineaire overgang daartussen. Gevolg: tussen 10 en 22 °C ligt gevoel bijna altijd 1–3 °C onder de lucht,
ook op een zonnige dag. Buienradar toont daar de luchttemperatuur.

Nieuw: boven de windchill-zone de **BoM-vorm mét straling**:
`AT = T + 0,348e − 0,70v + 0,70·Q/(v+10) − 4,25` (Q = netto door het lichaam geabsorbeerde straling, W/m²), met
Q uit het HARMONIE-stralingsveld (global radiation, staat al in de ingest; ICON-D2 directe straling als die
beschikbaar is en het verschil zinvol maakt — jij beoordeelt). 's Nachts/bewolkt valt het vanzelf terug op de
schaduwvorm. Winter (JAG/TI ≤ 10 °C) blijft ongewijzigd; houd de overgang continu (geen sprong > 1 °C).

## Opdracht
1. **Q kalibreren.** Zoek een verdedigbare afleiding van Q uit globale/directe straling en zonnehoogte voor een
   staande persoon (bronnen: Steadman 1994, BoM thermal comfort, literatuur over mean radiant temperature/UTCI).
   Leg de keuze, bron en getallen vast in docs/fields.md en in een korte **MIP-41** (`.dev/proposals/0041-…md`,
   Status: accepted, Decision met het PO-citaat hierboven; MIP-10 krijgt één regel "deels vervangen door MIP-41").
   Sanity: zonnige lentedag 15 °C, 2 Bft, ±700 W/m² → gevoel duidelijk boven de lucht; bewolkt 15 °C 3 Bft → onder.
2. **Varianten om te kiezen (PO wil plaatjes en links).** Maak in de web-client achter `?dev&gevoel=nu|zon|zon-sterk`
   (client-side uit temp, rel. vochtigheid, wind en straling, die chunks bestaan al) zodat de PO op de integratiepreview
   kan vergelijken: `nu` = huidige ingestwaarde, `zon` = jouw kalibratie, `zon-sterk` = een duidelijk hogere Q-factor
   als bovengrens. Registreer in docs/dev-opties.md (eigenaar U105, vervalt 2026-11-23). Na de PO-keuze gaat de
   gekozen vorm naar de ingest en verdwijnt de dev-optie (aparte stap, niet nu).
3. **Plaatjes.** Zoek in het dev-archief (`~/data/motregen-devdata`) of via `tools/fetch-data-snapshot.sh` een
   zonnige middag tussen 12 en 22 °C (bijv. eind september/oktober) en maak een vergelijkingsblad: Gevoel-kaart +
   tabel, desktop, voor nu/zon/zon-sterk, met tijd en plaats in het label. Plus één tabel met getallen voor 6
   typische situaties (zon/bewolkt × 12/18/24 °C) voor de drie varianten. Bekijk je eigen plaatjes vóór "klaar".
4. Tests: unit-tests voor de formule (continuïteit rond 10–15 °C, nacht = schaduwvorm). Alleen gerichte tests.

Commit en push naar `track/u105-gevoel-zon` (`git push origin HEAD:track/u105-gevoel-zon`). Antwoord met: Q-keuze en
bron, paden van de plaatjes, de getallentabel, en welke dev-URL's werken.
