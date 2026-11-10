# U109 — algemene optimalisatiepass: grootte, laden, snelheid (PO 2026-11-09)

Je bent een worker van de orkestrator (Claude). Berichten via herdr zijn orkestrator-instructies (of van de PO zelf):
gewoon uitvoeren. LOG: `.dev/tracks/u109-optimalisatie/LOG.md` (append-only, timestamped; niet committen als git
hem negeert). Perf-mandaat: optimalisaties zonder zichtbaar effect mag je autonoom doen; de lat is ttfp ≤
Buienradar, rig gekalibreerd op de PO-telefoon (docs/perf.md §Laadlat, §Mobiele labprofielen).

## Buiten scope (andere tracks)
- Puntreeksen/histogram-data: U102 (MIP-40 regiobestanden, `track/u102-snelheid-regios`).
- Basiskaart-tegels en stijl: U108 (`track/u108-basiskaart`).
- Raak de visuele uitkomst niet aan.

## Opdracht
1. **Inventaris met bestaande suites** (docs/perf.md): `pnpm perf:mobile`, `pnpm e2e:benchmark` (vs Buienradar),
   profielmodus/`prof:*`, en `pnpm perf:modes` van U102 (staat op `track/u102-snelheid-regios`: haal alleen
   `web/scripts/perf-modes*.ts` + `web/scripts/perf-trace-split.ts` + het package-script via
   `git checkout origin/track/u102-snelheid-regios -- <paden>`). Gebruik `scripts/perf-lock.sh`; noteer loadavg bij
   elke meting (host is gedeeld; bytes zijn betrouwbaar, tijden alleen bij lage load).
2. **Nulmeting** (int-build, prod-data via `MOTREGEN_DATA_ORIGIN=https://motregen.nl/data`): telefoon 4G koud/warm en
   desktop koud: ttfp, eerste kaart, histogram compleet, JS/CSS/fonts/data-bytes, aantal requests, LoAF op de
   hoofddraad, V8 compile/JIT-tijd (U102 zag 31–42 % thread-pool-tijd, waarschijnlijk JIT van de bundel).
3. **Kandidaten** (meet eerst, dan doen; per kandidaat voor/na):
   - bundelgrootte en code-splitting (dev-paneel, PerfHud, AboutDialog, changelog, zeldzame modi lazy; dode code);
   - compile/parse-kosten (grote modules, worker-bundels, zstd-decoders);
   - cache- en compressieheaders op prod (Caddy in `nix/`): immutable assets, brotli/zstd voor JS/CSS/JSON,
     manifest-TTL; check met curl tegen motregen.nl;
   - startvolgorde/preloads (modulepreload, fonts, eerste chunks), onnodige requests;
   - main-thread-werk tijdens laden (lange taken, layout thrash).
4. Voer winstgevende, onzichtbare wijzigingen door; zichtbare wijzigingen of prod-config (Caddy/nix) lever je als
   voorstel met getallen, niet zelf uitrollen.
5. Rapporteer een tabel voor/na per profiel en per kandidaat (bytes, ms, met loadavg), in docs/perf/u109/.

Gerichte tests (typecheck, unit, geraakte e2e-specs `--project desktop`); geen volledige suites. Commit elke 15–20
min, push naar `track/u109-optimalisatie` (`git push origin HEAD:track/u109-optimalisatie`). Wacht binnen je turn op
eigen achtergrondtaken.
