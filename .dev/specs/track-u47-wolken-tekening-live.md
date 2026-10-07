# Track U47 — wolkendoorsnede: licht en vibe, live met de PO in de pane (claude-opus-5-5)

Read first: `AGENTS.md`, `.dev/proposals/0018-wolkenlagen-en-vibe.md` (§Het probleem en
§Aanbeveling deel 1 = de opdracht), `.dev/specs/track-u34-wind-live.md` (§Werkwijze: live-pane),
`web/src/core/cloud-section.ts` (+ test), `web/src/components/HistogramScrubber.tsx` (wolken-
banden, cursor-tags, thematokens), `web/src/core/uv.ts` (`clearSkyRadiation`, de CMF-berekening
in de UV-schatting: hergebruik die, exporteer hem als eigen functie), `web/src/core/solar.ts`,
`web/src/styles.css` (`--cloud-*`), U37-LOG `.dev/tracks/u37-wolkendoorsnede/LOG.md`. LOG:
`.dev/tracks/u47-wolken-tekening-live/LOG.md` (committed, append-only, timestamped). Branch
`track/u47-wolken-tekening-live` vanaf main. Eigen worktree. Vandaag: 2026-10-07.

**Parallel loopt U42** (tabel/modi, live-pane op 4320) die de scrubber-modus hernoemt
(`clouds` → `air`/`weather`). Raak `ForecastTable.tsx` en `focus-mode.ts` niet aan; houd je
wijzigingen in `cloud-section.ts`, de wolkentekening in de scrubber en CSS, zodat de merge
klein blijft.

## Werkwijze (live-pane, loop van minuten)

De PO kijkt live mee. Per stap één gerichte wijziging, `pnpm typecheck`, `pnpm build`, dan
"klaar, herlaad" met in één zin wat er veranderde. Geen e2e, geen stills, tenzij gevraagd.
Commit na elke stap die de PO goedkeurt. Preview (achtergrond; na een wijziging alleen
`pnpm build`):

    cd web && pnpm synthgen && pnpm build && MOTREGEN_DATA_ORIGIN=https://motregen.nl/data pnpm preview --host 0.0.0.0 --port 4350 --strictPort

URL voor de PO: http://ageq-mthq:4350/ — meld hem in je eerste bericht.

## De feiten waar de tekening op moet rusten

- Bedekking ≠ dikte. Optische dikte per laag verschilt een factor tien (cirrus τ < 3,6;
  altostratus 3,6–23; stratus > 23). Een gesloten cirrusdek laat ~70–80 % licht door, een
  stratusdeken < 10 %.
- De bewolkingsfactor `CMF = G/G_c` (al berekend in `uv.ts` uit HARMONIE-straling en Haurwitz)
  is de eerlijke "hoeveel licht"-maat, onafhankelijk van laag. Niet-lineair: 50 % bedekking
  ≈ 75 % licht, 100 % ≈ 25 %. Waarneming is logaritmisch: gebruik een perceptuele schaal.
- Vibe = structuur: 50 % lage stapelwolken is een mooie Hollandse lucht (randen, blauw, zon
  die komt en gaat), 50 % deken niet. Transparantie tekent dat weg.

## Opdracht (voorstel; PO stuurt bij)

1. **Gaten, geen transparantie.** Fractie → aantal/grootte van losse wolkvormen per laag met
   lucht ertussen; pas ≥ ~90 % een gesloten band. Deterministisch op epoch (bestaande
   value-noise). Dekking van een wolkvorm is hoog en vast; de laag bepaalt de vorm (al in U37).
2. **Grijsheid uit laag + licht.** Basistint per laag (hoog dun/wit, midden grijs, laag:
   lichte top, donkere basis) gemoduleerd door CMF op perceptuele schaal. CMF per uur uit
   `radiation` + `clearSkyRadiation`, geëxporteerd uit `uv.ts` (geen duplicatie).
3. **De hemel als achtergrond.** Het plotvlak kleurt mee met "hoe licht het wordt": verloop per
   uur tussen thematokens (bijv. `--sky-bright` blauw, `--sky-dull` grijsblauw, `--sky-dark`
   loodgrijs; nacht uit het bestaande dag/nacht-palet), gestuurd door CMF overdag. Licht én
   donker thema. Regenhistogram en cursor moeten leesbaar blijven; meet contrast.
4. **Cursortekst**: naast de laagpercentages één woord uit de vibe-klasse (MIP-18 deel 2,
   regeltabel in `cloud-section.ts`, unit-getest): strakblauw / mooie wolkenlucht / melkachtig /
   grijs / Mordor (PO kiest de woorden; "Mordor" mag intern blijven).
5. Bij "klaar": `pnpm test` (unit voor gatenverdeling, tintfunctie, vibe-tabel), gerichte
   e2e `scrubber`/`focus` `--project desktop` onder een slot, stills, LOG met synchrone exit
   statussen, draft-PR.

## Afbakening

Geen nieuwe data, geen ingest. Geen weericoon-wijziging (later, na U46). Leesbaarheidsbar:
geen één-letternamen, geen slimme one-liners, commentaar alleen voor een niet-triviaal waarom.
