# U114 — plekkenorde (MIP-43): opties om te proberen (PO 2026-11-10)

Je bent een worker van de orkestrator (Claude). Berichten via herdr zijn orkestrator-instructies (of van de PO zelf):
gewoon uitvoeren; de PO kan zelf in deze pane met je itereren (noteer zijn berichten in je LOG). LOG:
`.dev/tracks/u114-plekkenorde/LOG.md` (append-only, timestamped; niet committen).

Lees eerst `.dev/proposals/0043-een-plekkenorde-voor-de-kaart.md` (aanleiding, huidige vier regimes, voorstel, de vier
PO-keuzes). De PO zei op dat voorstel: "bouw een paar opties die ik kan proberen". Dit is dus een **verkenning in de
app (web) achter `?dev`**; de bot volgt pas na de PO-keuze (niet in deze ronde).

## Opdracht
1. **De orde als data** in `web/src/core/map-places.ts`: plekken met rang (1–4), handgekozen; rang 1 ±6–8 plekken
   die NL dekken + 1–2 zeepunten; buurland (Antwerpen, Brussel, Gent, Düsseldorf, Keulen, Aken, Münster…) als
   aparte vlag. Zoomdrempels per rang per schermklasse (telefoon/desktop). Inzoomen voegt alleen toe.
2. **Knoppen** (MIP-12: `docs/dev-opties.md`, eigenaar Claude (U114), vervalt 2026-11-24), te combineren:
   - `?dev&plekken=nu|orde` — huidige gedrag vs de orde (alle lagen: Weer, Gevoel, Wind, namen);
   - `?dev&dichtheid=weinig|midden|veel` — bijv. telefoon 6/9/12 en desktop 10/14/18 plekken uitgezoomd op NL;
   - `?dev&namen=samen|naast|later` — (a) één label "Utrecht 5°" / naam onder de zak; (b) getal of zak op de plek,
     naam klein ernaast; (c) uitgezoomd geen namen, namen pas vanaf de rang-2-zoom;
   - `?dev&weergetal=plekken|isolijn` — in Weer temperatuurgetallen op de plekken vs de huidige isolijnlabels
     (isothermen als lijnen blijven in beide);
   - `?dev&buurland=later|meteen`.
   Met `plekken=orde` komen de plaatsnamen uit de orde: de `place`-laag van de basiskaart gaat dan uit of krijgt
   een filter op deze namen (`web/src/core/basemap.ts`). Namen zonder plek bestaan dan niet meer.
3. Hergebruik de bestaande lagen (temperature-numbers.ts, wind-socks.ts, isoline-layer.ts, MapLabelPlacer); houd de
   wijziging klein. U111 (`track/u111-firefox-wind`, tekenpad van wind-socks.ts) en U113 (`track/u113-zakken`, badge
   met eenheid in wind-sock-draw.ts) lopen parallel: raak hun stukken niet aan en herformatteer niets.
4. **Preview op poort 4314** met prod-data (`MOTREGEN_DATA_ORIGIN=https://motregen.nl/data`). Maak screenshots
   (telefoon en desktop, uitgezoomd en 2 zoomstappen in, Weer/Gevoel/Wind, dag) voor `nu` en 2–3 goede
   combinaties; bekijk ze zelf en zet ze in `.dev/tracks/u114-plekkenorde/`. Kies zelf een aanbevolen combinatie.
5. Laatste bericht en LOG: de klikbare links (http://ageq-dev2:4314/?dev&…) per combinatie, de screenshotpaden, het
   aantal plekken/namen per scherm, en je aanbeveling.

Gerichte tests: `pnpm -C web typecheck`, `pnpm -C web test`, e2e `kaartstijl`, `windzak`, `basemap` met
`--project desktop`. Commit elke 15–20 min; push ALTIJD expliciet met `git push origin HEAD:track/u114-plekkenorde`,
nooit kaal. Wacht binnen je turn op eigen achtergrondtaken.
