# U107 — één regime voor maat, stijl en plaatsing over alle kaartmodi (PO 2026-11-09)

Je bent een worker van de orkestrator (Claude). Berichten via herdr zijn orkestrator-instructies (of van de PO zelf):
gewoon uitvoeren. LOG: `.dev/tracks/u107-consistentie/LOG.md` (append-only, timestamped; niet committen als git hem
negeert). Productteksten in het Nederlands.

PO: "kan jij nog een pass laten doen om alle modi een consistente sizing/stijl/plaatsing regime te geven?"

## Stand (int d8b78fc)
- Weer: stadstemperaturen (Noto Sans, #102630, witte halo), regenlegenda.
- Lucht: wolken/zon, eigen legenda.
- Gevoel (U100): getallen op vaste plekken met schijf in bandkleur, isolijnen op x,5 °C, 13 px desktop / 12 px
  telefoon; gevoelslegenda. `TEMPERATURE_NUMBER_PLACES` is een kopie van de windzakkenlijst.
- Wind (U101): windzakken (fietsweer-Bft-vlakken, wuiven met momentum, badge met oranje cijfer aan de mond, vaste
  ankerverschuiving uit `windsock-anchors.ts` om namen te ontwijken), legenda lekker/tegenwind/zwaar/storm;
  `?dev&zakstijl=` staat nog open voor de PO.
- Bot (Node + Rust, `crates/render`): Weer/Lucht/Gevoel/Wind-films; naammaskers (U103) voor labeluitwijk.

## Opdracht
1. **Inventaris**: per modus, app (telefoon + desktop, licht + donker) én bot: alle kaartelementen met tekst of
   symbool (getallen, badges, labels, legenda's, pin, klok) met lettertype, maat, gewicht, kleur, halo/achtergrond,
   z-volgorde, plaatsingsregel en uitwijkregel. Tabel in je LOG + één inventarisblad (screenshots per modus).
2. **Regime**: stel één set regels op (typeschaal, één lettertype — bundel Noto Sans als webfont als de app er nu op
   terugvalt —, kleur/halo-regels licht/donker, één badge-/schijfvorm-familie, één gedeelde plekkenlijst voor
   getallen en zakken, één uitwijkregel voor namen + pin + chrome, legenda's met dezelfde vorm/positie/verbergregels).
   Schrijf het kort op in `docs/kaartstijl.md`.
3. **Doorvoeren** in app en bot (Node + Rust, met de bestaande gelijkheidstests/fixtures), inclusief deze open
   punten:
   - bot Gevoel: getallen + x,5-isolijnen zoals de app (nu nog hele graden zonder getallen);
   - bot Wind: wuiven met momentum deterministisch over de frames (nu nog oude stofgolf);
   - getallen wijken direct voor een verplaatste pin (nu pas na pan/tijdstap);
   - één plekkenlijst i.p.v. de kopie;
   - wuifkosten: meet fps/CPU op het telefoonprofiel; de zaklaag mag niet continu tekenen als de app stil/onzichtbaar
     is (visibility, stilstaande kaart: begrens of pauzeer), zonder dat het er stil uitziet tijdens kijken.
   Visuele keuzes die echt smaak zijn (bijv. typeschaal-stap) lever je als 2 varianten achter `?dev&regime=` met
   een vergelijkingsblad; de rest voer je direct door.
4. Lever een voor/na-blad per modus (app telefoon + desktop, bot-still) en bekijk het zelf vóór "klaar".

Gerichte tests (tsc -b, unit, bot test, render-constants --check, cargo test -p render -p render-core, geraakte e2e
`--project desktop`). Commit elke 15–20 min, push naar `track/u107-consistentie`
(`git push origin HEAD:track/u107-consistentie`). Wacht binnen je turn op eigen achtergrondtaken.

## PO-besluiten erbij (2026-11-09, na de start)
- Windzakstijl: de huidige zak blijft. Haal `?dev&zakstijl=` en `web/src/core/wind-sock-styles.ts` (gravure,
  emaille, windwijzer, wimpel, glans) weg, incl. de regel in docs/dev-opties.md.
- Legenda's: op de telefoon blijven ze voorlopig verborgen. Maak één uniforme legenda-knop voor alle modi (zelfde
  plek/vorm in Weer, Lucht, Gevoel, Wind; telefoon én desktop) die de legenda van de actieve modus opent/sluit, in
  de stijl van de bestaande kaartknoppen. Neem dit op in het regime (docs/kaartstijl.md) en in het voor/na-blad.
