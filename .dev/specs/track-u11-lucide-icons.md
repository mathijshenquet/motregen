# Track U11 — Lucide-iconen voor de UI (claude opus)

Read first: `AGENTS.md`, `web/src/App.tsx` (themaknop `themeMeta`/`☀`,
geolocatieknop, `round-action`-knoppen, `map-brand`), `web/src/components/
LocationSearch.tsx` (zoekveld, opslaan-ster, verwijderen ×), `About.tsx`
("i"-knop, sluiten ×), `HistogramScrubber.tsx` (play/pauze `▶`/`Ⅱ`),
`Freshness.tsx` (op branch `track/u10-versheid`, wordt zo gemerged: pil met
statusdot en verversknop), `PerfHud.tsx`, `web/src/styles.css`. Your LOG:
`.dev/tracks/u11-lucide-icons/LOG.md` — committed, append-only,
timestamped. Branch: `track/u11-lucide-icons` vanaf main. Eigen worktree.
Integratie-instantie: http://ageq-mthq:4300/.

## PO-opdracht (2026-09-23)

"Gebruik Lucide-iconen. Weericonen zijn prima zoals ze zijn, maar bv. het
zoekicoon, het lichtmodus-icoon etc."

## Opdracht

1. Voeg `lucide-solid` toe (pnpm; tree-shaken named imports, geen icon-
   font, geen hele set). Dit is een sanctioneerde nieuwe dependency.
2. Vervang alle UI-glyphs door Lucide: zoeken (`Search`), thema licht/
   donker/systeem (`Sun`/`Moon`/`SunMoon` of `Monitor`), geolocatie
   (`LocateFixed`), opslaan/favoriet (`Star`, gevuld bij opgeslagen),
   verwijderen (`X`), about (`Info`), sluiten (`X`), afspelen/pauzeren
   (`Play`/`Pause`), verversen (`RefreshCw`, draaiend tijdens verversen),
   horizon/tijdsbereik als dat een icoon verdraagt (`Clock`), UV-chip
   (`Sun` mag blijven als tekstglyph of Lucide `Sun` — kies één), en de
   ★-kaartmarkers (Lucide `Star` als inline SVG in de Marker-element).
   NIET: `WeatherIcon.tsx`, de zon-glyph in de tabel, het droplet-logo.
3. Eén maatsysteem: 18 px in knoppen, 16 px inline, `stroke-width` 2
   (1,75 bij 16 px), `currentColor`, `aria-hidden` op het icoon en het
   label op de knop (bestaande `aria-label`s blijven). Consistente
   knopgrootte/aanraakdoel ≥ 44 px mobiel.
4. Bundelgrootte vóór/na in LOG (`pnpm build`-output); e2e-budgetten
   blijven (passief ≤ 800 kB synth). pnpm-lock wijzigt → meld in LOG dat
   `nix flake check` nodig is bij merge (de orchestrator draait die).

## Gates

`pnpm typecheck`, `pnpm test`, `pnpm build`, `MOTREGEN_E2E_PORT=4305
MOTREGEN_E2E_DATA_PORT=8305 pnpm e2e` green (host is druk: draai e2e één
keer, niet parallel met eigen andere runs), synchrone exit statussen in
LOG. Screenshots vóór/na desktop + Pixel 5, licht + donker. Draft-PR
vroeg. Geen codex. U9 (histogram) en U8b (isolijnen) werken parallel:
houd je diffs klein en per component; play/pauze in HistogramScrubber
alleen de glyph-regel.
