# Track U30 — dev-opties snoeien volgens MIP-12 (claude opus 5.5)

**Start pas na de merges van U22, U24 en U25.** Rebase eerst op main en
herhaal de inventaris: die tracks halen zelf al knoppen weg.

Read first: `AGENTS.md`, `.dev/proposals/0012-dev-opties-snoeien.md` (de
tabel is de opdracht), `web/src/App.tsx` (URL-params, dev-paneel),
`web/src/components/PerfHud.tsx`, `web/src/core/wind-layer.ts` (tuning v3,
`loadWindTuning`/`storeWindTuning`, controls), `web/src/core/isolines.ts`
(`DEFAULT_ISOLINE_TUNING`), `web/src/core/dev-settings.ts`. Your LOG:
`.dev/tracks/u30-dev-opties-snoeien/LOG.md` — committed, append-only,
timestamped. Branch `track/u30-dev-opties-snoeien` vanaf main. Eigen
worktree.

## Opdracht

1. Voer de "weg"-kolommen van MIP-12 uit: URL-parameters, dev-paneelknoppen,
   windknoppen. Elke verwijderde knop wordt een constante met de gekozen
   default en één regel herkomst (track). Verwijder dode code en tests van
   verliezende varianten; verwijder de bijbehorende CSS.
2. Wind-tuning v3 → v4 met alleen Dichtheid, Intensiteit, Lijnbreedte,
   Tempo; migratie laat onbekende sleutels vallen; JSON-export blijft.
3. `?perf` weg; PerfHud via triple-tap én een knop in het dev-paneel.
4. Schrijf `docs/dev-opties.md`: één regel per overgebleven knop (naam,
   doel, eigenaar-track, vervalt bij). Voeg aan `AGENTS.md`-conventies één
   regel toe: "Dev-knoppen: alleen via `?dev`, met eigenaar en vervaldatum
   in de spec (MIP-12)."
5. Meet: bundlegrootte vóór/na (`pnpm build`-output) en aantal knoppen
   vóór/na, in de LOG.

## Gates

`pnpm typecheck`, `pnpm test`, `pnpm build`, `MOTREGEN_E2E_PORT=4376
MOTREGEN_E2E_DATA_PORT=8376 pnpm e2e` groen, synchrone exit statussen in de
LOG. Draft-PR vroeg. Geen codex.

## Aanvulling PO (2026-09-25, 11:10)

"Er zijn nog steeds veel te veel opties in ?dev, ik weet van de meeste niet wat ze
betekenen. Wolkrand mag sowieso weg. Misschien opties groeperen en info geven wat het zou
doen."

- **Wolkrand** (cloud-edge-layer + knop) gaat er helemaal uit, inclusief de laag en de
  opslag-sleutel (`motregen-cloud-edges`), niet alleen de knop.
- Het dev-paneel wordt **gegroepeerd** (Kaart / Temperatuur / Wind / Focus / Diagnose) met
  per knop een **korte uitleg** (één zin: wat verandert er zichtbaar) als `title` én als
  grijze regel eronder; de groep is een `<details>` die dicht start behalve de eerste.
- Start nu (niet wachten op U24): rebase op main zodra U24 gemerged is voor de windknoppen;
  de rest van de snoei kan al.
