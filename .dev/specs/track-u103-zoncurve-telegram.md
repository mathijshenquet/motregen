# U103 — Zoncurve in Lucht repareren, zonsondergang-merkteken, Telegram-films 1,5× grotere elementen

Eigenaar: worker `u103-zoncurve-telegram` (opus-5.5). Branch `track/u103-zoncurve-telegram`. Preview-poort 4394.

## Wat de PO vroeg (2026-11-09)

1. **Zoncurve loopt niet goed door** (`web/src/components/HistogramScrubber.tsx`, `sunArea`): op een PO-screenshot
   (desktop, Lucht, middag) loopt de gele curve vlak op 60 min/u tot een punt rechts en stopt daar; het vlak sluit met
   een **schuine lijn** van dat eindpunt naar linksonder in plaats van recht naar de basis. Reproduceer (live data;
   kijk o.a. naar de overgang ICON-D2 → HARMONIE, het einde van de geladen uren, en runs die na een gat beginnen —
   `afterGap` start zonder basispunt), vind de oorzaak, repareer, en voeg een unit-test toe die het pad controleert.
   De curve moet tot zon onder doorlopen zolang er straling is, en bij ontbrekende uren netjes breken (sinds e8971fb).
2. **Zonsondergang-merkteken onderin het histogram** (`sun-marker`, zonnetje + "16:56"): de PO wil keuze (C9). Bouw
   `?dev&zonmerk=`: `tijd` (alleen de tijd, gecentreerd onder het moment, geen zonnetje), `weg` (merkteken helemaal
   weg), `huidig`. Screenshots van alle drie op hetzelfde moment, telefoon en desktop.
3. **Telegram-films: elementen 1,5× groter** (C8a, akkoord): ze worden vaak klein weergegeven. Labels, klok, lijnen,
   pijlen, merktekens en voetregel 1,5× groter ten opzichte van het beeld; zelfde kaartuitsnede; zelfde uitvoer
   960×1224 px. Kern: `bot/config.ts` `FRAME` (640×816 CSS bij schaal 1,5) — bijv. een CSS-viewport van 1,5× kleiner
   bij schaal 2,25, met de kaartzoom zo aangepast dat de uitsnede gelijk blijft. Let op vaste pixelmaten
   (`bot/native-overlay.ts` boxes, Rust-renderer `crates/render*`, isolijntoleranties, cache-sleutels). Alle vier de
   films (Weer, Lucht, Gevoel, Wind) en de stills. Voor/na-stills naast elkaar in `tmp/shots/`. Geen bot-uitrol.

## Gate
Zie Werkwijze. Plus `pnpm -C bot test` en typecheck, en `cargo test -p render-core -p render`, clippy, fmt als je Rust
raakt, en de bestaande pariteitscheck van de bot (`bot/parity.ts`/`air-parity.ts`) op één generatie.
## Werkwijze (geldt voor elke track)

Orkestrator: Claude (PM, pane w9:p1). PO: Mathijs. Base: main e575c65. Track-LOG `.dev/tracks/u103-zoncurve-telegram/LOG.md`
(git-ignored, nooit committen; append-only, tijd uit `date`, lokaal = UTC+1 in november). Commit elke 15–20 minuten
en **push altijd expliciet met `git push origin HEAD:track/u103-zoncurve-telegram`**, nooit kaal. **Geen prod-acties, geen main.**

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
naar `tmp/shots/u103-zoncurve-telegram/` met per beeld één zin in de LOG. Varianten voor de PO: elk als `?dev`-parameter, plus een
screenshot per variant op dezelfde plek en tijd, zodat ze naast elkaar te leggen zijn.

Meld daarna in één bericht: branch-head, de screenshotpaden met je zinnen, de exitstatussen, en wat open is.
Stop en meld het bij een ontwerpvraag die hier niet in staat. Gok niet.
