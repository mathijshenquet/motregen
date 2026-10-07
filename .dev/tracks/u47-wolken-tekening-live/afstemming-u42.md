# Afstemming U47 ↔ U42 (dag/nacht in tabel en in de scrubber)

Van: U47 (wolkentekening, branch `track/u47-wolken-tekening-live`, preview http://ageq-dev2:4350/).
Aanleiding: PO 2026-10-07, "coördineer precies met U42, jullie werken aan een parallelle feature".

## Wat U47 doet
In de modus Lucht krijgt de scrubber een hemel die per uur meekleurt met het licht (blauw, loodgrijs,
nacht), met zonsop- en -ondergang als gloed. In Weer blijven de lagen rustig grijs.

## Wat ik van jullie heb overgenomen
1. Jullie branch is hier gemerged (laatst op `dabdbfb`); ik bouw op `mix.air`, `airMix()` en de
   regenbalken achter de wolken.
2. De schemergloed gebruikt jullie tabelkleuren als tokens in `:root` (`web/src/styles.css`):
   `--dusk-amber: #ffb85c`, `--dusk-rose: #ef4269`, `--dusk-purple: #7b3989` (donker thema:
   `#ffab52`, `#e24069`, `#6e2b80`). Jullie tabel heeft ze nu nog als losse rgba-waarden.

## Wat ik raak (zodat we niet botsen)
- `web/src/core/cloud-section.ts` (+ test), `web/src/core/uv.ts` (alleen `cloudModification` erbij).
- `HistogramScrubber.tsx`: prop `sky`, de memo's `sky`/`skyDetail`, de `<g class="sky">` vóór de
  regenbalken, de wolken-`defs`, `.sky-grain` vóór de nu-lijn. Verder niets.
- `styles.css`: het blok `.cloud-band` … `.cloud-low` en de tokens `--cloud-*`, `--sky-*`, `--dusk-*`.
- `App.tsx`: één regel, `sky={…}` op `<HistogramScrubber>`.
- `SkywatchRender.tsx`: vulling per pad (de dekkingsstops bestaan niet meer).

## Vragen aan U42
1. Willen jullie de `--dusk-*`-tokens in de tabel gebruiken, zodat tabel en scrubber één palet delen?
   Zo nee, dan houd ik ze handmatig gelijk.
2. De instelling "Dag en nacht in tabel" (`tableDayNight`): moet die ook de hemel in de scrubber
   uitzetten? Ik heb hem nu niet gekoppeld; dat is een PO-keuze.
3. Jullie zonregel gebruikt `sunEvents`; ik gebruik `solarElevationSin` (schemering tussen −0,1 en
   +0,1). Dat zou op dezelfde minuut moeten uitkomen; zeg het als jullie een andere grens hanteren.
4. Main (U56) mergen geeft hier vijf conflicten die allemaal U42 × U56 zijn (usage v2: `pinAir` naast
   `clockScrub`). Die los ik niet op; ik haal main binnen via jullie branch zodra jullie hem hebben.

Antwoord graag in dit bestand onder een kop "Antwoord U42", of via de orkestrator.
