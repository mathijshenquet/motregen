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
- Run 4 (`/tmp/u31-e2e4.txt`, startload 22.66, eindload 25.24): **E2E-EXIT 0**, usage+perf 9/9 groen (desktop warm TTFR
  594 ms, warm chunks 0 B, second click 0 requests; mobiel idem 0 B / 0).
- Na commit 1530983: gate-herhaling typecheck 0 / unit 0 (254) / build 0.
- Run 5 geraakte specs (`/tmp/u31-e2e5.txt`, startload 26.44): EXIT 1, 22 groen / 3 rood (desktop): location:61 (About-
  backdrop), freshness:152 (themaknop), focus:180 (isolijnlabels). location: screenshot toonde dat mijn langere privacyzin
  de About-dialog op 1280×720 tot y=704 liet lopen → de testklik `onder de dialog` viel buiten beeld. Fix gemaakt, maar
  weggegooid na de rebase (zie hieronder); run 6 (herhaling van de 3) gestopt voor de rebase.

## 2026-09-25 — rebase op origin/main a1a905a (U22b)
- Orkestrator: rebase + privacyzin als tabelrij. Conflict About.tsx opgelost: U22b-structuur behouden, rij `Privacy` =
  "Anoniem geteld: sessies en gebruikte functies, zonder IP of identificatie; locatie en favorieten blijven in je browser"
  (letterlijk de orkestratortekst; "geen tracking, geen advertenties" staat dus niet meer in de rij — PO/orkestrator
  let op als dat wel moet blijven). About.test bijgewerkt (klik-binnen-target, nieuwe tekst). `onOpen` intact; alle 12
  instrumentatiepunten nagelopen.
- Receipts op 50416bd: SYNTH 0, TYPECHECK 0, UNIT 0 (46 files, 282 tests), BUILD 0. Force-push with lease → origin 50416bd.
- Run 7 gestart: `pnpm e2e e2e/usage.spec.ts e2e/perf.spec.ts e2e/location.spec.ts e2e/focus.spec.ts e2e/freshness.spec.ts`
  (poorten 4231/8231) → `/tmp/u31-e2e7.txt`; beslist of de location-fix nog nodig is.
- Run 7 (`/tmp/u31-e2e7.txt`, startload 26.62): EXIT 1 zonder test — `ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL: Command "e2e" not
  found`, direct na de rebase (devenv-bestanden gewijzigd → direnv herevaluatie vermoedelijk). Reproductie `pnpm e2e --list
  e2e/usage.spec.ts` daarna EXIT 0 (6 tests). Geen testresultaat; run 8 identiek herstart → `/tmp/u31-e2e8.txt`.
- Run 8 op 50416bd (`/tmp/u31-e2e8.txt`, startload 23.69, eindload 22.28): **E2E-EXIT 0** — 35 passed, 0 failed,
  25 skipped (profiel-skips in de specs). Specs: usage, perf, location, focus, freshness × desktop/mobile-4g/mobile-fast-3g.
  perf: warm TTFR 605 / 2471 / 2078 ms, warm chunks 0 B, second click 0 requests; asserts "0 bakens tijdens sessie" en
  "precies 1 na reload" groen. location:61 groen ZONDER mijn testfix (U22b-modal is korter) → fix blijft weg.
  focus:180 en freshness:152 groen → de run-5-fails waren load-flakes (load 26).

## Afsluiting — receipts (synchroon, op 50416bd = origin/main a1a905a + 2 U31-commits)
- `cd web && direnv exec .. pnpm synthgen` → 0
- `cd web && direnv exec .. pnpm typecheck` → 0
- `cd web && direnv exec .. pnpm test` → 0 (46 files, 282 tests)
- `cd web && direnv exec .. pnpm build` → 0
- `cd web && MOTREGEN_E2E_PORT=4231 MOTREGEN_E2E_DATA_PORT=8231 direnv exec .. pnpm e2e e2e/usage.spec.ts e2e/perf.spec.ts
  e2e/location.spec.ts e2e/focus.spec.ts e2e/freshness.spec.ts` → 0 (35 passed)

## Open punten
- Voor orkestrator/PO: de About-rij heeft nu de orkestratortekst; "geen tracking, geen advertenties" is daaruit verdwenen.
- Voor U32/docs/analytics.md: veldenlijst = `USAGE_FIELDS` in `web/src/core/usage.ts`; body bevat alleen gebruikte
  features (als true) + altijd range/theme/coarse/width/dur; Content-Type text/plain (sendBeacon met string).
  Geen schemaversieveld (`v`) — toevoegen als U32 dat wil.
- `pin` = pin verplaatst via kaarttik (er bestaat geen sleepbare pin).
- `web/.mcp.json` (untracked, door devenv aangemaakt) niet meegecommit.

## 2026-09-25 — afronding (orkestrator): pin via U26, v: 1, About-rij
- `pin` markeert nu ook bij pin loslaten na slepen (`onDrop`) en bij dubbeltik-centreren (nieuwe optionele
  `onDoubleTap` in `core/pin-navigation.ts`), naast tik op de kaart. e2e: nieuwe desktop-test in usage.spec.
- `v: 1` (`USAGE_SCHEMA_VERSION`) altijd in de body en in `USAGE_FIELDS`; unit + e2e eisen hem.
- About-rij Privacy: "Geen tracking, geen advertenties. Anoniem geteld: sessies en gebruikte functies, zonder IP of
  identificatie; locatie en favorieten blijven in je browser".
- Receipts op afb9e42 (basis origin/main a1a905a):
  - `direnv exec . bash -c 'cd web && pnpm typecheck'` → 0
  - `direnv exec . bash -c 'cd web && pnpm test'` → 0 (46 files, 282 tests)
  - `cd web && MOTREGEN_E2E_PORT=4231 MOTREGEN_E2E_DATA_PORT=8231 direnv exec .. pnpm e2e e2e/usage.spec.ts e2e/perf.spec.ts
    e2e/pin-navigation.spec.ts` → **0** (14 passed, 10 skipped = profiel-skips; startload 25.34, eindload 22.01);
    perf warm chunks 0 B, second click 0 requests op alle drie profielen.
- `pnpm build` niet opnieuw gedraaid in deze ronde (de e2e-webserver bouwt wel: `pnpm build` in playwright.config → groen).

## 2026-09-25 — rebase op origin/main 99d9525 (U25b)
- Eén conflict: `<About …>` in App.tsx. Opgelost als main (`sourcePrefix` met de temperatuurlegenda) + alleen mijn
  `onTheme`/`onOpen`. `git diff origin/main HEAD -- web/src/App.tsx` bevat alleen U31-instrumentatie.
- Receipts op ca0d582:
  - `direnv exec . bash -c 'cd web && pnpm synthgen'` → 0
  - `… pnpm typecheck` → 0
  - `… pnpm test` → 0 (46 files, 289 tests)
  - `… pnpm build` → 0
  - `cd web && MOTREGEN_E2E_PORT=4231 MOTREGEN_E2E_DATA_PORT=8231 direnv exec .. pnpm e2e e2e/usage.spec.ts e2e/perf.spec.ts
    e2e/pin-navigation.spec.ts` → **0** (14 passed, 10 skipped = profiel-skips; startload 27.93, eindload 27.41);
    perf warm chunks 0 B en second click 0 requests op alle drie profielen.
