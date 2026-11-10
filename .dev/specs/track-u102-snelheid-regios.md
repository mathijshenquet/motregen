# U102 — Snelheid: meetsuite per modus en profiel, daarna puntreeksen per regio (MIP-40)

Eigenaar: worker `u102-snelheid-regios` (opus-5.5). Branch `track/u102-snelheid-regios`. Preview-poort 4393.
Je mag hier gericht benchmarken (dat is je taak), onder `web/scripts/perf-lock.sh`; geen andere testsuites.

## Wat de PO vroeg (2026-11-09)

"Het laden van het histogram is nu heel traag, volgens mij omdat hij eerst alles regulier downloadt en dan pas de
DWD-data. … het lijkt me beter Nederland spatieel te fine-grainen, bijv. in 200 regio's, en dan het tijdhistogram los
te downloaden: voor het histogram heb je alleen de data op een punt nodig, maar nu wachten we tot de data van alle
locaties. Deze techniek kan ook voor de weekverwachting." En: "een pass voor snelheid, wellicht een suite voor de
verschillende mapmodes en interactieprofielen."

## Fase 1 — meetsuite (C7, akkoord)
Een herhaalbare suite (script in de repo, `web/scripts/` of `web/e2e/perf-*`, met een `pnpm`-commando) over de vier
kaartmodi (Weer, Lucht, Gevoel, Wind) × profielen (telefoon 4G koud, telefoon 4G warm, desktop) op live data
(`https://motregen.nl` of je preview met live data). Per combinatie: tijd tot eerste kaart, tijd tot histogram
compleet, tijd tot tabel compleet, bytes en requests (per bron: HARMONIE, ICON-D2, ECMWF, radar …), en haperingen
(lange frames) bij scrubben, afspelen en wisselen van modus. Bouw op wat er is (`web/e2e/perf.spec.ts`, de rig
gekalibreerd op de PO-telefoon, `docs/perf.md`). Draait op aanvraag en nachtelijks, nooit per merge. Lever een
nulmeting-tabel (met eenheden) in de MIP.

## Fase 2 — MIP-40 (draft): puntreeksen per regio — eerst de knie
`.dev/proposals/0040-puntreeksen-per-regio.md`, Nederlands, Status: draft. De PO wil **de knie berekend zien**:
1. Wat de wachttijd nu veroorzaakt (uit fase 1: welke bytes/requests staan tussen openen en een compleet histogram).
2. Regiogrootte: zet regio's van verschillende grootte uit (bijv. 50, 100, 200, 400, 800 regio's over het
   HARMONIE-kader NL+Vlaanderen; noem de km per regio) en meet per grootte (a) bytes per regiobestand (alle puntvelden,
   tijdvolgorde, zstd zoals mrf), (b) aantal bestanden per run en totale ingest-schrijfkosten, (c) de **fout** als de
   client de reeks van de regio gebruikt i.p.v. zijn eigen gridpunt — als functie van de regiogrootte, per veld met
   eenheid (°C gevoel, mm/u regen, Bft wind, min zon/u, % bewolking), plus de variant "alle gridpunten van de regio in
   het bestand" (fout 0, meer bytes). Gebruik echte runs uit het archief (`tools/` of de prod-data).
3. De knie: een grafiek of tabel bytes/tijd-tot-histogram vs fout, en een aanbeveling.
4. Ook: welke bronnen erin (HARMONIE, ICON-D2, ECMWF voor de weekverwachting, UV …), hoe de client het gebruikt
   (histogram en tabel eerst uit het regiobestand, kaartframes daarna), en wat het de ingest kost op de 2-vCPU-VM.
**Nog niet bouwen.** Meld zodra de MIP staat; ik leg hem aan de PO voor.

## Gate
Geen productcode in fase 1 behalve de suite. Exitstatussen van de suite letterlijk.
## Werkwijze (geldt voor elke track)

Orkestrator: Claude (PM, pane w9:p1). PO: Mathijs. Base: main e575c65. Track-LOG `.dev/tracks/u102-snelheid-regios/LOG.md`
(git-ignored, nooit committen; append-only, tijd uit `date`, lokaal = UTC+1 in november). Commit elke 15–20 minuten
en **push altijd expliciet met `git push origin HEAD:track/u102-snelheid-regios`**, nooit kaal. **Geen prod-acties, geen main.**

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
naar `tmp/shots/u102-snelheid-regios/` met per beeld één zin in de LOG. Varianten voor de PO: elk als `?dev`-parameter, plus een
screenshot per variant op dezelfde plek en tijd, zodat ze naast elkaar te leggen zijn.

Meld daarna in één bericht: branch-head, de screenshotpaden met je zinnen, de exitstatussen, en wat open is.
Stop en meld het bij een ontwerpvraag die hier niet in staat. Gok niet.
