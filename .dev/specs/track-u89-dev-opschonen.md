# U89 — `?dev`-knoppen opschonen (YAGNI)

Eigenaar: worker `u89-dev-opschonen` (gpt-6.1-sol). Orkestrator: Claude. Branch `track/u89-dev-opschonen` vanaf
`origin/main`. Track-LOG `.dev/tracks/u89-dev-opschonen/LOG.md` (append-only, tijd uit `date`). **Slice**: typecheck,
de unit-tests die je raakt, en de gerichte desktop-e2e `pnpm e2e e2e/dev-panel.spec.ts --project desktop` plus elke
spec die je raakt. De orkestrator gate op de integratie. Commit en push elke 15–20 minuten. Geen prod-acties.

## PO-besluit (2026-10-17)

Deze knoppen verdwijnen uit `?dev`; hun huidige standaardwaarde wordt een constante (één regel herkomst erbij,
zie de MIP-12-regel in `docs/dev-opties.md`):

1. Regen › Regenpalet → `violet-laat`.
2. Regen › Regenmenging → de huidige standaard in `DEFAULT_RAIN_LOOK` (`rand`). `docs/dev-opties.md` noemt nog
   drempel-zacht; de code is leidend.
3. Regen › Regencontrast → 0.
4. Regen › Regen in Wind/Lucht → `per-modus`.
5. Kaart › Regenveld radar/nowcast en Regenveld HARMONIE → `auto`.
6. Temperatuur › Isolijnen, Vulling-stijl en Vervagen → hun huidige standaard.
7. Wind › Dichtheid, Intensiteit, Lijnbreedte, Tempo en "Kopieer wind als JSON" → huidige standaard.
8. Laden › Eerste regen → `vroeg`.

Blijven: Regen › **Regenisolijnen** (de orkestrator tunet die nu; raak `RAIN_ISOLINE_*`, `rainOutlines`,
`rain-contour*`, `isoline-line-shaders.ts` en de legenda niet aan), Wolkenkaart, Lucht nu, Meting en Diagnose.
Lege groepen verdwijnen.

## Hoe

- Haal ook de **code** weg die alleen via die knoppen bereikbaar was: alternatieve paletten, mengingen,
  smoothing-standen, opslagsleutels, hints, `data-*`-attributen voor e2e. Let op wat elders nog gebruikt wordt:
  `PRE_U77_RAIN_LOOK` en het palet `huidig` zijn nog nodig voor de bot (zie het commentaar in `rain-palette.ts`);
  check met grep op `bot/`, `crates/` en `web/` vóór je iets verwijdert.
- Oude localStorage-sleutels van verwijderde knoppen hoeven niet gemigreerd te worden; "Reset alle instellingen"
  ruimt `motregen-*` toch al op.
- Pas `docs/dev-opties.md`, `web/e2e/dev-panel.spec.ts` en geraakte unit-tests aan. Tests die alleen een verwijderde
  variant testten gaan mee weg.
- Geen gedragsverandering voor gewone gebruikers: wat iemand zonder `?dev` ziet blijft pixel-gelijk. Kijk zelf naar
  een schermbeeld van Weer, Wind en Gevoel vóór en na (eigen preview op poort 4311, daarna stoppen).
- Geen changelog-notitie (geen gebruikerswijziging).

Leesbaarheid: geen één-letternamen, geen slimme one-liners, commentaar alleen voor het niet-vanzelfsprekende waarom.
Meld **"U89 slice"** met head-sha, de exitstatussen, het aantal verwijderde regels en wat je bewust liet staan.
