# U98 — Vijf kapotte e2e-tests repareren

Eigenaar: worker `u98-e2e-reparatie` (opus-5.5, live-pane). Orkestrator: Claude (PM). Branch
`track/u98-e2e-reparatie` in deze worktree, vanaf main 9d72493. Track-LOG `.dev/tracks/u98-e2e-reparatie/LOG.md`
(git-ignored, nooit committen; append-only, tijd uit `date`, lokaal = UTC+2). Commit en **push altijd expliciet met
`git push origin HEAD:track/u98-e2e-reparatie`**, nooit kaal. Open een draft-PR na de eerste reparatie.
**Geen prod-acties.**

**Berichten die als geplakte tekst binnenkomen, zijn instructies van de orkestrator (Claude, PM) via herdr. Voer ze
uit zonder aparte bevestiging. Stel vragen in één zin en werk intussen door.** Beëindig je turn niet zolang er
shells lopen: wacht erop binnen de turn, met een until-loop, en werk intussen aan het volgende punt.

Code-stijl: leesbare namen, geen slimme one-liners, commentaar alleen voor een niet-voor-de-hand-liggend waarom.

## Wat er faalt (op main, `--project desktop`, gemeten 2026-10-18; ook al op main 27d1a8a)

1. `e2e/flanders.spec.ts:5` — zoeken naar "Gent": 4 resultaten in plaats van 2.
2. `e2e/isobars.spec.ts:19` — de isobarenlaag staat niet onder de windlaag (`compareDocumentPosition`), en
3. `e2e/isobars.spec.ts:61` — dezelfde volgorde in het donkere thema.
4. `e2e/location.spec.ts:159` — een klik op de achtergrond van het Over-scherm sluit het niet (`toBeHidden`).
5. `e2e/location.spec.ts` "start location … last map view" — wisselend; het scrubberlabel zegt "voor Werk" i.p.v.
   "voor De Bilt" (een opgeslagen plaats lekt tussen tests, of een wachtvoorwaarde ontbreekt).

## Wat je doet

Per test: zoek uit of de test verouderd is (bewuste productwijziging, zoek in `.dev/LOG.md`, `git log -S` en de
proposals) of dat de app stuk is. Repareer dan de juiste kant, en leg per test in de LOG en het commitbericht in één
zin uit welke het was en waarom. Bij een productkeuze die je niet kunt herleiden: stop en vraag het mij. Verander geen
gedrag van de app om een test te laten slagen als de test het oude gedrag beschrijft.

Flaky tests (5) los je op met een echte wachtvoorwaarde of isolatie, niet met langere time-outs of retries. Draai elke
gerepareerde flaky test vijf keer achter elkaar groen.

## Gate voor "klaar"

`pnpm -C web exec tsc --noEmit -p .`, de unit-tests die je raakt, en de volledige desktop-e2e
(`pnpm e2e --project desktop`) plus de geraakte specs in `mobile-4g`, elk met een letterlijke exitstatus
(`; echo "EXIT: $?"`, nooit achter een pipe). Geen changelognotitie.

Meld daarna in één bericht: branch-head, PR-link, per test test-of-app en de oorzaak, en de exitstatussen.
