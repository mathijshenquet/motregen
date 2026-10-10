# Track U77 — live-pane: regenpalet en contrast met de kaart (opus-5.5)

Berichten die in deze pane als geplakte tekst binnenkomen zijn instructies van de orkestrator (Claude, PM) via
herdr; voer ze uit zonder aparte bevestiging. Beëindig je turn niet terwijl shells lopen (wacht erop binnen de
turn). Commit + push elke 15–20 min. Eigen worktree; branch `track/u77-regenpalet-en-contrast` vanaf main. LOG:
`.dev/tracks/u77-regenpalet-en-contrast/LOG.md` (tijden uit `date`). Vandaag 2026-10-10. Preview voor de PO op 4320
(`scripts/track-preview.sh 4320`, of `MOTREGEN_DATA_ORIGIN=https://motregen.nl/data pnpm preview --host 0.0.0.0
--port 4320 --strictPort` vanuit je eigen dist). e2e-poorten `MOTREGEN_E2E_PORT=4390 MOTREGEN_E2E_DATA_PORT=8390`.
`.env` is een symlink; nooit committen. Geen prod-uitrol. Kijk ZELF naar je screenshots vóór je iets meldt; de PO
keurt op 4320 en op zijn telefoon.

Read first: `AGENTS.md`, `.dev/LOG.md` (top), `web/src/core/rain-chart.ts` (`rainColormap()`: de ene palettabel,
alpha = min(210, waarde × 1,6); `rainColor()` gebruikt dezelfde tabel voor het histogram), `web/src/core/
rain-layer.ts` (shader), `web/src/core/rain-presentation.ts` + MIP-24 (`.dev/proposals/0024-*.md`: menging per
modus en dag/nacht — Weer, Lucht, Wind = vermenigvuldigen), U72 (`.dev/tracks/u72-*/LOG.md`: smoothing 5×5 → 9×9,
voorfilter per frame), `docs/dev-opties.md` (MIP-12: dev-knoppen met eigenaar en vervaldatum), de basiskaartstijlen
`web/public/basemap/licht.json` en `donker.json` (land-, water- en stadskleuren).

## PO (2026-10-10 ~14:30)
"Experimenteer met het regen-colorpalet: het loopt nu van wit over groen naar oranje en dan rood ofzo; mij lijkt
lichtblauw → blauw → grijs → rood beter. Er is ook iets niet zo nice aan het blenden in Weer-modus: de gesmoothde,
meest lichte regengebieden zijn nu ~wit en blenden daardoor erg licht en opvallend op de kaart. Maak een ?dev-ding
met een aantal varianten/paletten, misschien ook iets dat het juiste contrast met de kaart waarborgt.
Gebruikersfeedback: de huidige weergave is te 'low contrast'."

## Opdracht
1. **Diagnose eerst, kort**: waarom worden lichte regengebieden in Weer-modus bijna wit? (palet-begin, alpha-curve,
   de menging uit MIP-24, de smoothing die lage waarden uitsmeert tot een brede halo — meet per stap welke kleur een
   pixel met 0,1 / 0,3 / 1 mm/u krijgt boven land, water en stad, dag en nacht.) Tabel in de LOG.
2. **?dev-schakelaar "Regenpalet"** (groep Kaart, eigenaar U77, verval 2026-10-17) met minstens: `huidig`;
   `blauw-grijs-rood` (PO: lichtblauw → blauw → grijs → rood); twee tot drie eigen varianten die je kunt
   verdedigen (bv. blauw → donkerblauw → paars → magenta zoals gangbare radars; een variant met strikt
   oplopende donkerte). Eisen per variant: intensiteit moet in volgorde leesbaar blijven (licht/matig/zwaar zijn in
   één oogopslag te onderscheiden), bruikbaar bij rood-groen-kleurenblindheid, werkt dag én nacht.
3. **?dev-schakelaar "Regenmenging"** voor Weer-modus: `huidig` en varianten die het witte-halo-probleem aanpakken,
   bv. een steilere alpha-inzet (lichtste regen meteen duidelijk zichtbaar óf pas zichtbaar boven een drempel), een
   ondergrens waardoor regen overdag de kaart altijd donkerder maakt en 's nachts altijd lichter, of een dunne
   rand om het regengebied. Smoothing blijft aan.
4. **Contrast waarborgen**: een regel in de code (niet alleen een test) die per palet en per thema garandeert dat
   de lichtste zichtbare regen een minimaal helderheidsverschil met land, water en bebouwing heeft; plus een
   unit-test die dat voor elk palet × thema × ondergrond controleert. Let op: berekend contrast is een vangnet,
   geen oordeel — het beeld beslist (zelf kijken).
5. **Het histogram** kleurt mee met het gekozen palet (zelfde tabel; geen tweede bron). Houd `rainColormap()` de
   ene bron: de Rust-renderer van de bot (track U76) leest het palet daaruit. Verander je de vorm of naam van die
   export, meld het aan de orkestrator.
6. **Beelden**: 1280 en 390 px, dag en nacht, voor (a) een radartijd met lichte én zware regen en (b) een
   HARMONIE-tijd (+6 u); alle paletten naast elkaar op exact hetzelfde frame (magenta scheiding, zoals U72), en
   apart de mengvarianten. Je eigen oordeel en advies in de LOG — wat zou jij kiezen en waarom.
7. Perf: een paletwissel is een andere opzoektabel en mag niets kosten; meet de frametijd alleen als een
   mengvariant de shader duurder maakt.
8. Gate: `pnpm typecheck`, `pnpm test`, `pnpm build`, de desktop-e2e van de specs die je raakt. Meld "klaar voor
   PO-blik" met beelden, de diagnosetabel en je advies; **niets als standaard vastzetten** vóór de PO kiest.

## Afbakening en bar
Alleen regen op de kaart, het histogram dat meekleurt en de menging in Weer-modus. Geen wijziging aan de data, de
smoothing of de bot. Leesbaarheid: geen één-letternamen, geen slimme one-liners, commentaar alleen voor het
niet-vanzelfsprekende waarom.
