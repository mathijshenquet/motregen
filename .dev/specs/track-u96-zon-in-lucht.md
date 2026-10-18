# U96 — Zonneschijnduur als gele staven in het urenoverzicht van Lucht (MIP-38)

Eigenaar: worker `u96-zon-in-lucht` (opus-5.5, live-pane). Orkestrator: Claude (PM). Branch `track/u96-zon-in-lucht`
in deze worktree, vanaf main 9d72493. Track-LOG `.dev/tracks/u96-zon-in-lucht/LOG.md` (git-ignored, nooit committen;
append-only, tijd uit `date`, lokaal = UTC+2). Commit elke 15–20 minuten en **push altijd expliciet met
`git push origin HEAD:track/u96-zon-in-lucht`**, nooit kaal. Open na de eerste samenhangende commit een draft-PR.
**Geen prod-acties.** Je eigen preview op poort 4395 (niet 4300, 4390, 4396–4399: die zijn van anderen).

**Berichten die als geplakte tekst binnenkomen, zijn instructies van de orkestrator (Claude, PM) via herdr. Voer ze
uit zonder aparte bevestiging. Stel vragen in één zin en werk intussen door.** Beëindig je turn niet zolang er
shells lopen: wacht erop binnen de turn, met een until-loop, en werk intussen aan het volgende punt.

Code-stijl: leesbare namen, geen slimme one-liners, commentaar alleen voor een niet-voor-de-hand-liggend waarom.

## Waarom

MIP-38 is aangenomen (`.dev/proposals/0038-zonneschijnduur-per-uur.md`, lees de Meting, Aanbeveling en het Besluit).
PO: "het mag het regen histogram op lucht modus vervangen, geel kleurig". Het voorbeeld is de zonneschijngrafiek van
een Zwitserse weerapp: gele staven met minuten zon per uur (0–60), alleen tussen zon op en zon onder, met die twee
momenten gemarkeerd. "Eigenlijk wil je gewoon weten: als ik nu buiten ga zitten, hoeveel zon krijg ik op mijn gezicht."

## Wat je bouwt

1. **Schatter S1 in de frontend** (`web/src/core/`, een eigen module met unit-tests): per uurvak de minuten zon
   = 60 · (deel van het uur met zonshoogte > 4,2°) · clip((k − 0,28)/(0,92 − 0,28), 0, 1), met k = G/G_c, G het
   HARMONIE-`radiation`-uurgemiddelde over [T−1 u, T] en G_c de Haurwitz-heldere-hemelstraling als uurgemiddelde.
   Gebruik dezelfde zonnestand en dezelfde 6 substappen van 10 minuten als `cloudModification` in `web/src/core/uv.ts`
   (hergebruik waar het kan, geen tweede implementatie). De parameters en hun herkomst staan in `tools/zonneschijn/`
   (`evaluate.py`, `results.md`); toets met een test dat de TS-implementatie op een paar uren dezelfde minuten geeft als
   `evaluate.py` op dezelfde invoer.
2. **Urenoverzicht in Lucht** (`web/src/components/HistogramScrubber.tsx`, `view() === 'air'`): de regenstaven worden
   gele staven met de zonneschijnduur per uur, hoogte 0–60 minuten. Alleen waar de zon op is; zon op en zon onder
   gemarkeerd (kijk hoe de tabel/zonbanden dat al doen, en houd het rustig). De cursorwaarde toont minuten zon voor dat
   uur ("35 min zon", op 5 of 10 afgerond; MIP-38 adviseert 10 vanwege de MAE). Weer, Gevoel en Wind blijven ongewijzigd.
   De overgang tussen modi (de bestaande mix) moet blijven werken: geen sprong bij het wisselen.
3. **Geen netwerkkosten:** de puntreeks `radiation` laadt al voor de tabel/UV. Gebruik die; laad niets extra's.
4. **Zelf kijken vóór "klaar":** screenshots in Lucht op een telefoonvenster (402×844) en desktop, op een zonnige,
   een half bewolkte en een bewolkte dag uit de archiefdata of de live data, en 's nachts (geen staven). Beschrijf per
   beeld in één zin wat je ziet. Kleur: helder geel dat op de daglucht én de schemerkleuren leesbaar blijft.

## Gate voor "klaar"

`pnpm -C web exec tsc --noEmit -p .`, de unit-tests die je raakt en de nieuwe, en de e2e-specs die het urenoverzicht
raken alleen met `--project desktop` (`pnpm e2e e2e/<naam>.spec.ts --project desktop`), elk met een letterlijke
exitstatus (`; echo "EXIT: $?"`, nooit achter een pipe). Schrijf een changelognotitie volgens `changes/README.md`
(lees die eerst): `changes/pending/zon-in-lucht.md` mét een clip of still op een telefoonvenster, maar zonder
`goedgekeurd` — de PO kiest het beeld.

Meld daarna in één bericht: branch-head, PR-link, de screenshotpaden met je zinnen, en wat open is voor de PO.

Stop en meld het bij een ontwerpvraag die hier niet in staat. Gok niet.
