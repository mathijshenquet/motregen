# U111 — windmodus vloeiend in Firefox op Android (PO 2026-11-10)

Je bent een worker van de orkestrator (Claude). Berichten via herdr zijn orkestrator-instructies (of van de PO zelf):
gewoon uitvoeren. LOG: `.dev/tracks/u111-firefox-wind/LOG.md` (append-only, timestamped; niet committen). Perf-mandaat:
optimalisaties zonder zichtbaar effect mag je autonoom doen (docs/perf.md). De zakken mogen er niet anders uitzien.

## Aanleiding
De PO merkt lange frames op de windpagina (met windzakken) op zijn Android-telefoon. Twee opnames van dezelfde
telefoon via http://ageq-dev2:4300/?perf=start&modus=wind staan in `~/motregen-profiles/`:
- Chrome 156: `2026-11-10T08:28:11.283Z-linux-armv81.json` (js-self-profiling, met stacks);
- Firefox 159: `2026-11-10T08:28:41.700Z-linux-armv81.json` (alleen fasen).

Gemeten (orkestrator):
| | Chrome | Firefox |
|---|---|---|
| gat tussen `windsock-draw`, p50 / p90 / max | 14 / 34 / 87 ms | 45 / 111 / 164 ms |
| JS per `windsock-draw`, p50 | 0,8 ms | 1 ms |
| `wind-step` p50 | 0,3 ms | < 1 ms |
| `isoline-trace` | 431× · p50 13,9 ms · Σ 6,4 s | 126× · p50 15 ms · Σ 2,2 s |

Het JS-werk per frame is klein in beide browsers; Firefox verliest de tijd buiten JS. Hypothese (onbewezen): de
zakkenlaag (`web/src/core/wind-socks.ts`) is een schermvullende 2D-canvas op volle DPR die tot 30×/s wordt gewist
en hertekend; Firefox Android rastert canvas-2D vaak op de CPU en uploadt het hele canvas per frame. Daarnaast
hertraceert de isolijnlaag tijdens afspelen ~30×/s (`isoline-layer.ts` / `isoline-tracer.ts`), ook in Chrome.
Analyse-tools: `web/scripts/prof-top.ts <profiel>`, `prof-check.ts`, `firefox-profile.ts`.

## Opdracht
1. **Dev-knop voor de A/B** (MIP-12: in `docs/dev-opties.md` met eigenaar Claude (U111) en vervaldatum 2026-11-24):
   `?dev&zakken=uit` (zakkenlaag niet tekenen) en `?dev&isolijnen=uit` als die nog niet bestaat. Commit en push dit
   EERST en meld het in je LOG, zodat de orkestrator de PO kan laten meten.
2. **Reproduceer lokaal zo goed als het gaat**: Firefox onder xvfb (de rig kan dit, zie U110 in de LOG van main en
   `web/e2e/perf-modes.rig.ts`), mobiele viewport met DPR 3, windmodus afspelend. Meet framegaten (rAF-intervallen)
   met/zonder zakken en met/zonder isolijnen. Noteer loadavg; de host is gedeeld.
3. **Fixes** (meet elk voor/na):
   - zakkenlaag: alleen de vuile rechthoeken rond de zakken wissen/tekenen i.p.v. het hele canvas; DPR van de
     zakkenlaag begrenzen (bijv. 2) als dat zichtbaar gelijk blijft; geen state-save/restore of Path2D-allocatie
     per zak per frame als het goedkoper kan; overweeg de zakken in de WebGL-context van de kaart te tekenen alleen
     als de goedkope opties niet volstaan (eerst melden);
   - isolijnen: niet hertracen als het veld/tijdstip niet veranderd is; cache per tijdstap of trace in een worker.
4. Bekijk zelf screenshots vóór/na (licht en donker, telefoon) om te bewijzen dat het beeld gelijk blijft.
5. Rapporteer in `docs/perf/u111/` een tabel voor/na (framegaten p50/p90, JS-ms, loadavg) per browser.

Gerichte tests: `pnpm -C web typecheck`, `pnpm -C web test`, geraakte e2e-specs (`windzak`, `kaartstijl`, isolijnen)
met `--project desktop`; geen volledige suites. Commit elke 15–20 min; push ALTIJD expliciet met
`git push origin HEAD:track/u111-firefox-wind`, nooit kaal. Wacht binnen je turn op eigen achtergrondtaken
(geen "ik wacht op de achtergrond" als laatste bericht). Klaar = LOG-entry met commits, meetresultaten en de exacte
reproduceercommando's; de orkestrator gate en merget naar int.
