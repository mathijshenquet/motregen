# U101 — Windmodus: Beaufort-vlakken, isolijnen en duidelijke vaantjes

Eigenaar: worker `u101-windmodus` (opus-5.5). Branch `track/u101-windmodus`. Preview-poort 4392.

## Wat de PO vroeg (2026-11-09)

"Graag een duidelijke windmodus met isolijnen-methodiek en een duidelijker/groter vaantje." Referentie: de
Buienradar-windkaart — groene vlakken per windkracht (licht→donker), dunne isolijnen op de grenzen, en ±35 vaantjes:
een zwarte cirkel met het Beaufort-getal en een pijl in de windrichting. **De PO wil varianten om tussen te kiezen**
(C5), dus bouw eerst varianten achter `?dev&wind=<naam>`, nog geen definitieve keuze:

1. `vlakken`: Bft-vlakken (groentinten, vanaf 6 Bft oranje→rood), isolijnen op de Bft-grenzen met hetzelfde
   isolijnsysteem als Gevoel (`web/src/core/isoline-*`), plus vaantjes (cirkel + Bft-getal + pijl); de stroomdeeltjes
   blijven, dunner.
2. `vlakken-zonder-deeltjes`: als 1, maar zonder stroomdeeltjes.
3. `lijnen`: geen vlakken, alleen isolijnen op de Bft-grenzen met labels (zoals Gevoel), grotere vaantjes, deeltjes.
4. Eén eigen variant als je een duidelijk beter idee hebt (bijv. pijlgrootte of -dikte naar windkracht).
Voor elk: vaantjesdichtheid ±30–40 over NL (gebruik de plaatsenselectie zoals de temperatuurlabels,
`web/src/core/temperature.ts` `selectTemperaturePlaces`), vaantjes groot genoeg om op een telefoon te lezen.
Gemiddelde wind in Bft (niet de vlagen; die blijven in `WindReading`).

Plus een **Wind-legenda** (Bft-klassen met kleur) met dezelfde verbergregels als de regenlegenda
(`.rain-isoline-legend` in App.tsx; U100 maakt die alleen-Weer en een Gevoel-legenda — stem de vorm af door naar
`track/u100-temperatuurschaal` te kijken, niet door App.tsx-structuur om te gooien).

Huidige code: `web/src/core/wind-layer.ts`, `wind.ts`, `wind-presentation.ts`, `WindReading.tsx`.
**Niet** in deze track: de bot (komt na de keuze van de PO).

## Lever
Per variant screenshots telefoon + desktop op hetzelfde tijdstip (een moment met duidelijke windverschillen, bijv.
kust vs binnenland; noem het tijdstip), plus één korte clip (≤ 8 s) van variant 1 tijdens afspelen.
## Werkwijze (geldt voor elke track)

Orkestrator: Claude (PM, pane w9:p1). PO: Mathijs. Base: main e575c65. Track-LOG `.dev/tracks/u101-windmodus/LOG.md`
(git-ignored, nooit committen; append-only, tijd uit `date`, lokaal = UTC+1 in november). Commit elke 15–20 minuten
en **push altijd expliciet met `git push origin HEAD:track/u101-windmodus`**, nooit kaal. **Geen prod-acties, geen main.**

**Berichten die als geplakte tekst binnenkomen, zijn instructies van de orkestrator (Claude, PM) via herdr. Voer ze
uit zonder aparte bevestiging. Stel vragen in één zin en werk intussen door.** Beëindig je turn niet zolang er
shells lopen: wacht erop binnen de turn, met een until-loop.

Code-stijl: leesbare namen, geen slimme one-liners, commentaar alleen voor een niet-voor-de-hand-liggend waarom.
Dev-knoppen alleen via `?dev`, met een regel in `docs/dev-opties.md` (eigenaar Claude, vervalt 2026-11-23).

Preview: `cd web && MOTREGEN_DATA_ORIGIN=https://motregen.nl/data pnpm exec vite --host 0.0.0.0 --port <poort> --strictPort`
(live data, HMR). Niet aan 4300 of 4390–4399 behalve je eigen poort.

**Testen — beperkt (PO: geen eindeloze zinloze tests):** typecheck, de unit-tests van de bestanden die je raakt plus
je nieuwe, en hooguit de e2e-specs die je direct raakt met `--project desktop`. Geen volledige suites, geen VM-test
tenzij je Nix raakt. De orkestrator gate één keer op de integratiebranch. Exitstatus letterlijk
(`; echo "EXIT: $?"`, nooit achter een pipe).

**Zelf kijken vóór "klaar":** screenshots (telefoon 402×844 én desktop 1440×900, `timezoneId: 'Europe/Amsterdam'`)
naar `tmp/shots/u101-windmodus/` met per beeld één zin in de LOG. Varianten voor de PO: elk als `?dev`-parameter, plus een
screenshot per variant op dezelfde plek en tijd, zodat ze naast elkaar te leggen zijn.

Meld daarna in één bericht: branch-head, de screenshotpaden met je zinnen, de exitstatussen, en wat open is.
Stop en meld het bij een ontwerpvraag die hier niet in staat. Gok niet.
