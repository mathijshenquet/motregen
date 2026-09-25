# Track U22b — klok nog kaler: tijd + kleine statusstip; regimemarkering weg (claude opus 5.5, zelfde worker als U22)

Read first: `.dev/specs/track-u22-bovenrand-en-shell.md` + je eigen LOG,
`web/src/components/Freshness.tsx`, `web/src/components/HistogramScrubber.tsx`
(`.scrubber-source`-chip en `.regimes`-balk), `web/src/core/time-model.ts`
(`timelineZones`), `web/src/styles.css`. LOG: `.dev/tracks/u22-bovenrand-en-
shell/LOG.md` (zelfde track-LOG, nieuwe entries). Branch
`track/u22b-klok-kaal` vanaf main (U22 is gemerged).

## PO (2026-09-25, na het zien van U22 op de preview)

"Waarom is die dot amber en zo groot? Hij is toch up to date nu? Die dot kan
beter naast de tijd, en observatie/voorspelling daar helemaal weg. Grijs is
geen top kleur voor observatie. In principe kan ook de observatie-vs-model-
marker weg in de scrubber."

## Opdracht

1. **Klok** = alleen de kaarttijd (groot) met direct rechts ervan, op de
   x-hoogte, een **kleine statusstip** (6–7 px): `fresh` → rustige, niet-
   opvallende kleur (bv. `--fresh`-groen of de tekstkleur op 40 %; amber
   is voor *aging*), `aging` → amber, `stale`/`offline` → rood. De regel
   "observatie/voorspelling" verdwijnt uit de klok; de dagafkorting (kaartdag
   ≠ vandaag) blijft klein achter de tijd. De hele klok blijft de knop voor
   het versheidspaneel; aria-label houdt de status in woorden.
2. **Regimekleur weg**: de gekleurde zijranden van de klok gaan eruit
   (gewone rand rondom); `--history`/`--forecast` verdwijnen als
   regimekleuren uit klok, scrubber-chip ("● Voorspelling" in de toolbar)
   en de `.regimes`-balk onder het histogram (balk verwijderen). Wat
   observatie van verwachting scheidt is de **Nu-lijn** in het histogram en
   de tabel; dat volstaat (PO). `timelineZones` blijft bestaan voor de
   aria-tekst en het versheidspaneel, maar rendert niets meer.
3. Zoek de plekken waar de regimekleuren nog gebruikt worden (grep
   `--history`, `--nowcast`, `--forecast`, `--model`, `data-source`) en
   ruim op wat alleen daarvoor bestond; About/versheidspaneel-teksten
   blijven.
4. Tests: Freshness-unit en `freshness.spec.ts` bijwerken (stip naast de
   tijd, kleur per status, geen regimewoord), scrubber-tests zonder balk/chip.
   Stills vóór/na desktop + Pixel 5, licht/donker.

## Gates

`pnpm typecheck`, `pnpm test`, `pnpm build`, gerichte e2e onder een slot
(freshness, location, perf). Synchrone exit statussen in de LOG. Draft-PR.

## Aanvulling PO (2026-09-25): About-modal strakker

Volgorde en inhoud van de modal:
1. Instellingen (Weergave: licht / systeem / donker) bovenaan, zoals nu.
2. Kop: druppel + "motregen.nl".
3. Twee korte regels (geen alinea's): "Rechtstreeks van het KNMI" en "Gratis en zonder
   reclame".
4. De detailtabel, met erin ook de regels **Privacy** ("geen tracking, geen advertenties;
   locatie en favorieten blijven in je browser") en **Broncode** (link GitHub). De losse
   alinea's "Eén tijdlijn…", "De kaart dekt…", de privacy-alinea en de losse broncode-knop
   verdwijnen; de dekking (Nederland en Vlaanderen) mag als korte toevoeging in de rij
   Observatie of Kaart.
Minder tekst in het algemeen: elke tabelrij één regel waar het kan.

## Aanvulling PO (2026-09-25, 11:25): zoekpil te klein

"Die zoekbalk is nog steeds te klein gemaakt; eergisteren (U17-versie) was een stuk beter;
smaller is wel goed." Dus: de pil houdt de smalle breedte (icoon + plaatsnaam), maar krijgt
de hoogte en tekstgrootte van vóór U22 terug (U17: hoogte ~36–40 px, tekst 14–15 px, ruimere
padding), op desktop én mobiel; het icoon schaalt mee. Stills vóór/na.
