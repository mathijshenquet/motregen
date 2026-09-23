# Track U1 — laadgedrag observeerbaar maken, dan repareren (claude opus)

Read first: `AGENTS.md`, MIP-8 (`.dev/proposals/0008-data-dieet.md`, §7 =
progressief laden L0/L1/L2), `docs/perf.md`, `web/e2e/`,
`.dev/tracks/t3h-progressief-laden/LOG.md` en
`.dev/tracks/t3l-auto-refresh/LOG.md` (hoe de huidige laadpijplijn is
ontstaan). Your LOG: `.dev/tracks/u1-laadprofiel/LOG.md` — committed,
append-only, timestamped. Branch: `track/u1-laadprofiel` vanaf main.
Werk uitsluitend in je eigen worktree.

## Klacht van de PO (2026-09-23)

"Loading gaat niet soepel; de indicator op het regenhistogram vult alleen
een tijdvak rond nu, de rest duurde ~30 s." PO-hypothese: we laden per
tijdslice verschillende datapunten en eisen coverage voordat een balk
'loaded' wordt; laadvolgorde en batching van datapunten zijn verdacht.

## Fase 1 — observeerbaar maken (eerst, en apart committen)

Bouw een headless Playwright-profiel (`pnpm e2e:profile` o.i.d., naast de
bestaande `pnpm e2e`/`e2e:live`) dat tegen prod (`https://motregen.nl`,
browser-UA vereist door Cloudflare) én tegen de lokale synth-set draait en
per run een JSON + leesbare tijdlijn schrijft naar `web/e2e/profiles/`
(gitignored) met minimaal:
- elke netwerkrequest naar `/data/*`: starttijd, duur, bytes, Range,
  bron/veld/frameindexen uit de URL, en de "priority"/laag (L0/L1/L2) die
  de app eraan gaf (instrumenteer `core/perf.ts` waar nodig);
- de fractie `rainLoaded` van het histogram als tijdreeks (sample op elke
  wijziging), plus het moment dat het volledige bereik geladen is;
- welke frames per request "bruikbaar" werden en waarom niet eerder
  (coverage-eis: welke datapunten ontbraken).
Lever in je LOG een ingevulde tijdlijn van een koude prod-run (desktop én
het mobiele 4G-profiel uit `docs/perf.md`) en benoem de kritieke keten die
de 30 s verklaart, mét cijfers. Geen fix in fase 1.

## Fase 2 — repareren

Op basis van de meting: slimmere laadvolgorde (buiten-naar-binnen vanaf nu
of dichtst-bij-scrubpositie), batching van datapunten per request, en/of
het loskoppelen van de histogrambalk van volledige coverage (toon wat er
is, markeer partieel). Doel: histogram van het volledige bereik visueel
gevuld ≤ 5 s desktop koud, ≤ 12 s op 4G, zonder de bestaande budgetten
(passief ≤ 3 MB, warm reload 0 B, tweede locatieklik 0 requests) te
breken. Het profiel uit fase 1 is de meetlat: vóór/na in LOG.

## Gates (synchrone exit status, in LOG met commando's)

`pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm e2e` 2× green, en het
nieuwe profiel vóór/na. Geen codex. Open een draft-PR zodra fase 1 staat.
Comments alleen voor niet-vanzelfsprekende waaroms.
