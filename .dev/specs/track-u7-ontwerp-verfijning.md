# Track U7 — ontwerpverfijning: histogram, hoeken, splash, about, temperatuurlabels, README (claude opus)

Read first: `AGENTS.md`, `web/src/components/HistogramScrubber.tsx`,
`web/src/App.tsx` (`.map-splash`, `.source`, `temperatureLabels`-aanroep),
`web/src/styles.css`, `web/src/core/temperature.ts` (`temperatureCities`,
`temperatureLayer`, `TEMPERATURE_VARIABLE_ANCHORS`), `web/src/core/places.ts`,
`docs/perf.md` (mobiele profielen), `README.md`. Referentie-app voor gevoel:
DWD WarnWetter (AGENTS.md). Your LOG: `.dev/tracks/u7-ontwerp-verfijning/
LOG.md` — committed, append-only, timestamped. Branch:
`track/u7-ontwerp-verfijning` vanaf main. Eigen worktree. Bekijk de
integratie-instantie http://ageq-mthq:4300/ (main + prod-data) en maak zelf
screenshots (Playwright, desktop + Pixel-5-portrait) vóór en na.

## PO-punten (2026-09-23), alle zes leveren

1. **Histogram/scrubber is cramped.** Meer lucht: hoogte, marges, labels en
   de "nu"-markering; balken leesbaar op telefoonbreedte; tijdlabels die
   elkaar niet raken. Lever een vóór/na-screenshot op beide profielen.
2. **Bronregel en kaart sluiten niet aan rechtsonder.** De regel "Bron: KNMI
   · Kaart: OpenFreeMap" (`.source`) en de kaartrand/hoekradius sluiten
   niet mooi aan op de hoek rechtsonder. Maak die hoek kloppend (radius,
   uitlijning, safe-area op telefoons).
3. **Splash: laadanimatie.** De splash (`.map-splash`, `map-splash-mark`)
   heeft geen bewegend laadsignaal. Iets kleins en liefs met de druppel
   (vallende/pulserende druppel, rimpel) — CSS-only, `prefers-reduced-
   motion` respecteren, en hij moet doorlopen tot `mapReady`. Bestaande
   splash-slowdown-knop in het debugpaneel blijft werken.
4. **About-popover.** Een klein "i"/"over"-knopje (plek kiezen: bij de
   bronregel ligt voor de hand) dat een popover/dialog opent (`<dialog>` of
   popover-API, toetsenbord/escape/focus netjes). Kernboodschap in het
   Nederlands, kort: **"Data rechtstreeks van KNMI, gratis, zonder reclame,
   open source"**, plus welke bronnen (radar, KNMI-nowcast, HARMONIE-AROME,
   UV) en kaartdata OpenFreeMap/OpenStreetMap. Link naar de GitHub-repo
   (URL uit `gh repo view`). Geen tracking, geen externe fonts.
5. **Meer temperatuurlabels op de kaart.** `temperatureCities` heeft 10
   steden, de PO ziet er maar 4 (Eindhoven, Nijmegen, Den Haag, Amsterdam):
   zoek uit waarom (symbol-collision, `text-allow-overlap`, sort-key,
   anchors?) en repareer. Breid uit naar een zoomafhankelijke set (~10 op
   NL-overzicht, ~20+ ingezoomd) met dekking van alle provincies — Zeeland
   (Middelburg/Vlissingen), Flevoland, Drenthe, Overijssel (Zwolle), Noord-
   Holland-noord (Alkmaar/Den Helder), Brabant-west (Breda), Gelderland
   (Arnhem/Apeldoorn), Friesland-kust. Label-dodging t.o.v. plaatsnamen
   (t3j-`temp-dodge`) blijft werken. Unit test op de set.
6. **README opschonen.** Alleen productinformatie: wat motregen is, voor
   wie, welke KNMI-bronnen, de één-tijdlijn-belofte, gratis/zonder reclame/
   open source, motregen.nl, korte "zelf draaien"-sectie (devenv, pnpm,
   cargo) en waar de docs staan (`docs/`). Géén `.dev/`-verwijzingen, geen
   MIP-nummers, geen proces. Nederlands. NB: er is geen LICENSE-bestand —
   zet dat als open vraag in je LOG voor de PO, kies er zelf geen.

## Randvoorwaarden

Geen nieuwe dependencies. Perf-budgetten uit `docs/perf.md` blijven staan
(`pnpm e2e` passief-budget). App.tsx: U4 (urenoverzicht, kaartklok) en U6
(kaartbegrenzing) werken parallel; houd je App.tsx-wijzigingen klein en
zet nieuwe UI in eigen componenten (`components/About.tsx`, splash in
eigen component als dat de diff verkleint). Smaakkeuzes: kies één vorm,
motiveer in LOG met screenshot; de PO beslist op zicht.

## Gates

`pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm e2e` green (synchrone
exit status in LOG; e2e-poorten 8185/4185 zijn gedeeld — wacht, kill
niets, en eindig je beurt NIET terwijl je wacht: poll in de voorgrond).
Screenshots vóór/na in de LOG-map. Draft-PR vroeg. Geen codex.
