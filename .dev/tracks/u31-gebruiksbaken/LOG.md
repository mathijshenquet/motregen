# U31 — gebruiksbaken (client, MIP-13) — worker LOG (claude opus 5.5)

## 2026-09-25 — start
- Spec, MIP-13, App.tsx, manifest-refresh.ts, About.tsx, Freshness.tsx, HistogramScrubber, ForecastTable gelezen.
- Ontwerp: `core/usage.ts` framework-vrij: `UsageSession` (booleans + enums), `mark()`, `sessionBody()`,
  `installUsageBeacon()` (visibilitychange→hidden én pagehide als vangnet, eenmalig), `sessionManifestUrl()`
  (alleen eerste manifest `?s=1`). Beacon als string (text/plain → geen CORS-preflight/Blob-type-gedoe).
- Interpretaties: "pin gesleept" — er bestaat geen sleepbare pin; de pin verplaatsen gebeurt door op de kaart
  te tikken → veld `pinMoved` = locatie via kaarttik gekozen. "hover" = Gevoel-kolomkop met muis (bron 'table').
  `range` = null als bereikknop nooit gebruikt, anders laatste keuze; `theme` = huidige themakeuze bij verzenden.

## 2026-09-25 10:30 — implementatie + eerste gates
- Body-vorm: alleen GEBRUIKTE features als `true` (ontbrekend = niet gebruikt) + altijd `range` (null|'3'|'8'|'24'|'all'),
  `theme` ('light'|'system'|'dark'), `coarse` (bool), `width` ('<430'|'<960'|'>=960'), `dur` ('<1'|'1-5'|'5-30'|'>30').
  Reden: met expliciete `false` voor 12 features werd het ~250 B, boven de < 200 B uit MIP-13; nu typisch ~100 B,
  alles-gebruikt ~230 B. Featurekeys: pinFeel pinWind hover search geo fav pin play scrub history fresh about.
  Voor U32/docs/analytics.md: `USAGE_FIELDS` in `web/src/core/usage.ts` is de bron.
- `play` alleen bij expliciete afspeelkeuze (nieuwe prop `onPlayPressed` in HistogramScrubber), niet bij hervatten na
  hover-scrubben of de autoplay bij laden. `history` alleen bij openen (niet sluiten).
- About/Freshness kregen een optionele `onOpen`-prop. `?dev`-regel "Gebruiksbaken: {json}" in het debugpaneel (5 s tik voor de duurbak).
- Geen `v`-schemaversie toegevoegd ("exact de lijst"); open punt voor orkestrator/U32 als die wel gewenst is.
- Worktree had geen synth-data: `pnpm synthgen` nodig (tsx-IPC faalt in de Claude-sandbox → buiten sandbox gedraaid).
- Receipts (synchroon):
  - `cd web && pnpm synthgen` → SYNTH-EXIT 0
  - `cd web && pnpm typecheck` → TYPECHECK-EXIT 0
  - `cd web && pnpm test` → UNIT-EXIT 0 (43 files, 254 tests)
  - `cd web && pnpm build` → BUILD-EXIT 0
- Draft-PR: https://github.com/mathijshenquet/motregen/pull/57
- Volgende: gerichte e2e `MOTREGEN_E2E_PORT=4231 MOTREGEN_E2E_DATA_PORT=8231 pnpm e2e e2e/usage.spec.ts e2e/perf.spec.ts` (na load < 16).

## 2026-09-25 10:4x — e2e wacht op slot
- Orkestrator-procesnoot: load-drempel voor gerichte e2e naar < 22, slotlock is de echte begrenzer.
  Mijn wachtlus (drempel < 16) was al door op startload **14.58 15.24 15.83**; de run staat nu in de wachtrij van
  `scripts/e2e-slot.sh` (beide slots bezet door andere tracks). Eén Chromium. Volgende runs: drempel < 22.
- Output: /tmp/e2e1.txt (buiten de sandbox; TMPDIR=/tmp daar).
- Run 1 (`/tmp/e2e1.txt`): E2E-EXIT 1 — GEEN testresultaat: webServer exit 127 `caddy: command not found`; devenv
  was niet actief in mijn shell (worktree-.envrc nog niet ge-allowed). Fix: `.envrc` gecontroleerd = main, `direnv allow .`.
- Run 2 gestart met drempel < 22: `cd web && MOTREGEN_E2E_PORT=4231 MOTREGEN_E2E_DATA_PORT=8231 direnv exec .. pnpm e2e
  e2e/usage.spec.ts e2e/perf.spec.ts > /tmp/u31-e2e2.txt`; startload/eindload in de taakoutput.
- Run 2 (`/tmp/u31-e2e2.txt`, startload 12.15, eindload 18.61): E2E-EXIT 1, 9/9 rood. Diagnose:
  - usage test 1: alles t/m het hidden-baken + whitelist groen; faalde pas op `page.waitForTimeout` NA `page.close()` (testfout).
  - usage test 2 (sluiten): `context.route` ziet het baken van een sluitende tab niet → poll bleef 0.
  - perf: `requestfailed: /hit (net::ERR_ABORTED)` — het baken van de koude pagina bij de reload. vite preview
    had geen /hit.
  - Fix: vite-plugin `motregen-usage-beacon` beantwoordt POST /hit met 204 in dev/preview (zoals Caddy in prod, U32)
    en schrijft bodies naar `MOTREGEN_HIT_LOG` (playwright: `tmp/hits-<port>.jsonl`); usage.spec telt serverkant.
- Run 3 gestart (`/tmp/u31-e2e3.txt`), drempel < 22.
- Procesnoot orkestrator: drempel nu < 28, slotlock regelt de rest. Run 3 was al door de wachtlus op startload
  **19.21 23.45 22.39** en draait/wacht in `e2e-slot.sh` (één Chromium). Vervolgruns: drempel < 28.
- Run 3 (`/tmp/u31-e2e3.txt`, startload 19.21, eindload 23.46): E2E-EXIT 1 — usage.spec 6/6 GROEN (3 profielen);
  perf 3/3 rood op `requestfailed /hit ERR_ABORTED` bij de warme reload. Bewijs dat dat geen verloren baken is:
  `web/tmp/hits-4231.jsonl` bevat 9 regels = 6 usage + 3 perf-reloadbakens (koude sessie: pin, scrub, range "all").
  Playwright meldt de keepalive-POST van het ontladen document als ERR_ABORTED, terwijl de server hem ontvangt.
  Voorbeeldbodies 70–100 B, bv. `{"about":true,"range":"24","theme":"light","coarse":false,"width":">=960","dur":"<1"}`.
- Fix perf.spec: alleen `/hit` + ERR_ABORTED negeren in requestfailed; nieuwe asserts: 0 bakens tijdens de koude
  sessie ("geen extra verzoek tijdens de sessie") en precies 1 na de warme reload. typecheck EXIT 0.
- Run 4 gestart (`/tmp/u31-e2e4.txt`), drempel < 28 (orkestrator).
