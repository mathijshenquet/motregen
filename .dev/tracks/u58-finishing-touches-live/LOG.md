# U58 finishing touches (live) — LOG

## 2026-10-07 17:15 — start, stap 1 (globale Expressief-schakelaar) gebouwd, wacht op PO

- Worktree had geen `node_modules`: `pnpm install --frozen-lockfile` (root). `pnpm synthgen`, de preview en
  de screenshots moeten buiten de Claude-sandbox (tsx-IPC-pipe en poort-bind geven daar EPERM).
- Main gemerged vóór de eerste gedeelde build (fast-forward naar `15365cc`: permalink `?plaats=`, compacte `?t`).
- Preview draait: http://ageq-dev2:4320/ (`MOTREGEN_DATA_ORIGIN=https://motregen.nl/data pnpm preview --host
  0.0.0.0 --port 4320 --strictPort`; na een wijziging alleen `pnpm build`).
- Stap 1: `core/table-appearance.ts` → `core/expressive.ts` (`motregen-expressive`, standaard aan). Eén signaal
  in `App.tsx` stuurt `HistogramScrubber expressive` (U47; die ingang was nog nergens aangesloten) én
  `ForecastTable dayNight` (U42). About › Weergave: "Expressief — Hemel in de grafiek, dag en nacht in de tabel"
  vervangt "Dag en nacht in tabel". Migratie bij het laden: oude `motregen-table-day-night` = off → expressief
  off (tenzij er al een Expressief-keuze is), oude sleutel wordt verwijderd. `PRESERVED_STORAGE_KEYS` en
  `docs/dev-opties.md` §Opslag bijgewerkt.
- Zelf bekeken (`scripts/expressive-shot.ts`, desktop 1280 en 390 px): aan = hemel achter de scrubber +
  gekleurde tabel met zonsondergang-rij; uit = kale scrubber en vlakke tabel; paneel toont de schakelaar.
- Receipts (synchroon): `pnpm typecheck` exit 0; `pnpm test` exit 0 (68 bestanden, 451 tests); `pnpm build` exit 0.
- Repro: `cd web && pnpm typecheck && pnpm test && pnpm build`;
  `scripts/e2e-slot.sh pnpm exec tsx scripts/expressive-shot.ts http://localhost:4320 <uitmap>`.
- Volgende: PO-akkoord op stap 1 → commit; dan stap 2 (klokpil-jog, PO kiest richting/schaal live).
