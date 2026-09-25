## 2026-09-25 — stap 1 (live met PO)
- Preview: `cd web && MOTREGEN_DATA_ORIGIN=https://motregen.nl/data pnpm preview --host 0.0.0.0 --port 4310 --strictPort` (buiten sandbox; binnen sandbox alleen localhost).
- Dekking: intensity 0,75→0,55; WIND_FOCUS_INTENSITY 1,905→1,2.
- Staart zwakke wind: begrenzer is de bufferfade (staart ≈ snelheid × ~0,8 s), niet maxAge. weakWindTempo: (6/v)^½ onder 6 m/s, max 2,5×; kleur/demping op echte snelheid.
- Korrel: RGBA16F-trailbuffer als EXT_color_buffer_float/_half_float er is (fallback RGBA8), vloer 2/255 per s i.p.v. 36/255 per s.
- typecheck 0, build 0. Wacht op PO-oordeel.
## 2026-09-25 — stap 2 (PO-feedback batch)
- Nu `pnpm dev` (HMR) op :4310, buiten sandbox; vite.config: dev-proxy volgt MOTREGEN_DATA_ORIGIN (lokaal geen caddy op :8080).
- Zee rustiger: speedDamping 0,7→1 (volle compensatie boven 3 m/s).
- Zonrij: dashed→solid. Tabelscrollbar desktop 12 px. Tijdsbereikknoppen verborgen (SHOW_TIME_HORIZON=false, horizon blijft +8u).
- Zoekbalk 44 px (field 42 + rand), 16 px tekst, icoon 20; merkdruppel 44×44, img 20×24. Bron: 9 px, tekst .62, achtergrond .26.
- UV: klasse altijd tonen (ook "laag"); fill/clear min-width = balkhoogte (9/6 px) → rond bolletje.
- typecheck 0. Tests nog niet gedraaid (UV-label < 3 kan een unit-test raken; bij afsluiting).
## 2026-09-25 — stap 3 (versheidspaneel)
- Leeftijden als tikkend label (LiveAge: pil + pulserende stip). Cadanstekst weg.
- Tabel Data/Bron/Uitleg/Frequentie/Volgende data; freshness.ts rijen + provider/explanation/cadenceMs/delayMs, expectedNext(). Vertragingen: radar 3 min (u17), rest geschat uit één prod-manifest 13:43Z (nowcast 3 min, blend 15 min, HARMONIE 2 u, UV 0) — nog niet gemeten.
- Footer: "Laatste check HH:MM" links, "Nu verversen" rechts; "Gepubliceerd" weg. Paneel 640 px.
- typecheck 0.
## 2026-09-25 — stap 4 (instroom aan loef; na rebase op origin/main incl. U24b)
- Commit 8e52533 = stap 1–3, gerebased op origin/main (schoon).
- PO-idee: respawn kiest het levensmidden in de leegste cel (viewBounds), `rewind()` spoelt langs de wind terug over halve afstand/halve maxAge (stap 0,05 s, max 80) tot de domeinrand. Domein simBounds = beeld + OVERDRAW_PX 60 rondom; sterven bij domein-uit óf beeld-uit (lij verspilt geen slots). Budget/raster blijven op het zichtbare beeld. Aanvullers (fill) ongewijzigd.
- Eerste poging (marge met volle dichtheid, budget ×1,28) verlaten vóór test.
- typecheck 0.
## 2026-09-25 — stap 5 (momentum)
- Dev-server herstart na rebase (vite had tijdens de rebase de main-config geladen → proxy naar :8080, 500 op manifest).
- Momentum met drag: velocityEast/North per particle, relaxeert naar de wind met DRAG_SECONDS 0,25 (exp); NaN bij respawn = neemt eerste sample over. Kleur/demping op windsnelheid, tempo op eigen snelheid. typecheck 0.
## 2026-09-25 — stap 6 (zwieriger + anti-klonteren)
- DRAG_SECONDS 0,25→0,5.
- Oorzaak klonteren (analyse): stap 4 koos de leegste cel voor het levensmidden op basis van de huidige posities, maar de particle staat daar pas een halve levensafstand later → het gat is dan meegedreven; plus leastOccupiedCell = "eerste lege cel vanaf willekeurige start".
- Fix: best-candidate (Mitchell), 6 kandidaat-levensmiddens uniform in beeld, elk teruggespoeld; het geboortepunt in de leegste cel van het raster over beeld+marge wint. Rewind grover (0,1 s, max 40). Aanvullers binnen beeld (acceptance inView).
- Declump (PO-idee): elk frame, paren levende koppen < 10 CSS-px (raster + 4 buurcellen) → de verste-in-zijn-leven van het paar sterft via die() (uitdoven + vervanger).
- typecheck 0; `pnpm vitest run src/core/wind` exit 0 (38 tests).
- stap 7: intensity 0,55→0,42 (focus blijft 1,2 via WIND_FOCUS_GAIN). typecheck 0.
- stap 8: anti-aliasing in de lengte van het segment (box-filter, quad 1 px verlengd, v_along/v_length); typecheck 0; PO kijkt zelf (geen smoke tests, PO-verzoek).
## 2026-09-25 — stap 9 (zeeregel + Bron-label)
- Zeeregel: masker uit de basemap-laag `water` (querySourceFeatures op de geladen tegels), 4 CSS-px cellen over beeld+marge, herbouwd ≤ 200 ms na move/resize/sourcedata; kop-alpha × (1 − 0,33 × waterfractie). Geen extra data.
- Bron-label light mode: wit (.9), tekst --muted; dark ongewijzigd. typecheck 0.
- stap 10: alle wind +15 % (default 0,42→0,48, focus 1,2→1,38). PO: 'echt top', zee uniform. typecheck 0.
- stap 11: default 0,5, windmodus 0,75 (PO: windmodus veel te intens). typecheck 0.
- stap 12: windmodus 0,8.
- stap 13: scrubber à la WarnWetter (vaste cursor midden, tijdlijn schuift, 8 u in beeld, slepen+uitloop, wiel/trackpad, tik = glijden naar moment, pijltjes), pills en cursor-tijd weg, rand-tot-rand. typecheck: alleen HistogramScrubber.test.tsx faalt (oude props) — herschrijven bij afsluiting. Historie-idee (24 u, niet opnieuw downloaden) = ingest-werk, buiten U34: voorstel voor orkestrator.
- stap 14: cursor op 1/3, pil (afspelen/tijd) weg, grafiek sluit bovenaan aan (scrubber padding-top 0, surface 180/198 px), Nu-label bovenin de grafiek.
- stap 15: tijdas boven de grafiek; sticky th houdt onderrand (inset box-shadow).
- stap 15b: x-as-labels bottom 0 (hingen half in de grafiek).
- stap 16: scrubber padding-bottom 0, grafiek loopt tot de tabel.
- stap 17: Weer-kolomkop rechts uitgelijnd.
- stap 18: versheidspaneel 760 px, 14 px tekst, uitvouwen vanaf de klok (transform-origin onder de pil), Nu verversen als stille tekstknop.
- stap 18b: titel 'Hoe actueel is de data?' (ook in e2e/freshness.spec.ts).
- stap 18c: paneel schuift van boven het scherm naar binnen.
- stap 19: 'Laatste check HH:MM · n seconden geleden' (secondeklok alleen bij open paneel).
- stap 20: versheidspaneel = klokpil die uitrolt (clip-path van pilvorm naar paneel, top = pil-top, klok bovenin op dezelfde plek, geen bovenrand), backdrop fade; afspelen pauzeert zolang het paneel open is.
- stap 21: sectiekop 'Plaatsen' in de zoekresultaten weg.
- stap 22: klok in het paneel is een knop die sluit; grijs (muted) = gepauzeerd.
- stap 23: sluiten rolt terug naar de pil (reverse animatie, dan close; Esc/backdrop/knoppen via closePanel).
- stap 24: Weer-kolomkop gecentreerd.
- stap 25: UV zonder visueel onderscheid gemeten/geschat (geen ≈, cursief, streepjes); aria-label houdt 'ongeveer'.
## 2026-09-25 — tussenstand voor merge (PO: "klaar, mergebaar, zeer tevreden"; sessie gaat door)
- Stap 13–25: WarnWetter-scrubber (cursor vast op ⅓, tijdlijn schuift, 8 u in beeld, slepen+uitloop, wiel, tik glijdt, tijdas boven, rand-tot-rand, geen pills/pil), versheidspaneel ("Hoe actueel is de data?", klokpil rolt uit/op als papier, klok grijs + afspelen gepauzeerd, 'Laatste check · n seconden geleden'), Weer-kop gecentreerd, "Plaatsen"-kop weg, UV zonder onderscheid gemeten/geschat.
- Gevolg pil weg: geen afspeel/pauze-knop meer → spatie op de tijdslider schakelt afspelen (data-playing op de slider); e2e-helper `e2e/playback.ts`. Open met PO: zichtbare afspeelbediening terug?
- Usage-veld `range` blijft altijd null (bereikknoppen weg); usage.spec verwacht nu null.
- Tests: HistogramScrubber.test herschreven (8 tests); focus-mode/wind-layer/Freshness tests op nieuwe waarden. e2e aangepast (niet gedraaid): focus, wind-zoom, perf, freshness, usage. competitive.benchmark.ts gebruikt nog +3u/Afspelen (geen gate).
- Receipts: `pnpm typecheck` exit 0; `pnpm test` exit 0 (45 bestanden, 292 tests) na `pnpm synthgen` (lokale synth-data was verouderd; buiten sandbox vanwege tsx-IPC).
- Open voor orkestrator: historie-idee PO (24 u verleden, niet elke verversing opnieuw ophalen) = ingestwerk (--history-hours 3, --arome-history-hours 6, ~83 MB/3 u extra download).
## 2026-09-25 — integratiegate na rebase op origin/main c719a82 (U36)
- Rebase: conflict e2e/usage.spec.ts (range null + unit bft) — rerere-oplossing gecontroleerd.
- Fixes n.a.v. orkestrator-e2e: (1) focus.spec verwacht 0,5/0,8 (PO-waarden); (2) freshness: bronnaam in eigen <span> (exacte tekstmatch) en test verwacht paneel dat de pil bedekt (bovenkant gelijk, klok op de pilpositie); (3) sluiten: eigen keyframes `freshness-roll-up` — dezelfde animatienaam achterstevoren herstartte niet, dus nooit animationend, paneel bleef open (+ vangnet 600 ms); (4) wind-zoom continu: bij kaartbeweging overleeft alleen wie in beeld is of als pasgeborene nog nooit binnen was (`entered`), en aanvullers kiezen alleen cellen in beeld (`emptiestCell(…, allowed)`) — de lege marge won anders altijd en de aanvuller belandde onzichtbaar in de marge.
- Receipts: `pnpm typecheck` exit 0; `pnpm test` exit 0 (na `pnpm synthgen`); e2e `direnv exec /home/mthq/motregen pnpm e2e e2e/focus.spec.ts e2e/freshness.spec.ts e2e/wind-zoom.spec.ts --project desktop` → E2E-EXIT 1 (alleen wind-zoom continu 0,692), na fix `… pnpm e2e e2e/wind-zoom.spec.ts --project desktop` → E2E-EXIT 0 (2 passed). Logs: /tmp/u34-e2e2.log, /tmp/u34-e2e3.log.
## 2026-09-25 — rebase op origin/main 33649d9 (U37 wolkendoorsnede)
- Conflict HistogramScrubber.tsx: U37 (cloudBands, CLOUD_LAYER_LABELS, slim-regen, data-scrubber-view) ingebouwd in de schuivende baan: wolkpaden één keer over de hele tijdlijn in baancoördinaten (width = xAt(einde), start/end = tijdlijn) i.p.v. per zichtbaar venster — de baan schuift met een transform, dus geen hertekening per afspeelframe; laaglabels vast links op het plot; regen halve breedte gecentreerd; data-playing én data-scrubber-view op de slider.
- e2e/cloud-section.spec: pauzeren via `pausePlayback` (oude pil-selector bestond niet meer).
- Receipts: `pnpm typecheck` exit 0; `pnpm test` exit 0 (46 bestanden, 306 tests); `direnv exec /home/mthq/motregen pnpm e2e e2e/cloud-section.spec.ts --project desktop` → E2E-EXIT 0 (1 passed). Visuele controle op synth-data (MOTREGEN_SYNTH=1, tijdelijke dev-server 4311, `web/tmp/u34-clouds-look.mjs`, niet gecommit): wolken en regen schuiven samen met de tijdas, labels blijven staan. Prod-manifest heeft nog geen cloud_low/mid/high, dus op 4310 zijn de wolken niet te zien.
## 2026-09-25 — "de timeline springt telkens terug" (PO, main 1a4a537)
- Dev-server 4310 nu op synth (MOTREGEN_SYNTH=1; kale `pnpm dev` proxyt naar :8080), na `pnpm synthgen` op de gerebasete head: 44 chunks, cloud_low + rain_rate.
- Repro (`web/tmp/u34-jump-repro.mjs`, niet gecommit, tegen 4310 synth): tijdens afspelen met het wiel naar voren scrollen → bij het passeren van de +8u-horizon (23:00) sprong de cursor van 22:36 naar 12:00 (tijdlijnbegin). Oorzaak: de afspeellus in App wrapt naar frame 0 zodra de volgende stap ≥ horizon is, ook als de gebruiker de cursor daar neerzette; het wiel pauzeerde het afspelen niet.
- Fix: afspeellus stopt (setPlaying(false)) als de cursor al ≥ horizon staat; alleen een rondje dat de horizon zelf haalt begint opnieuw. Wiel pauzeert zoals slepen en hervat 800 ms na de laatste wielstap. Na fix dezelfde repro: scrollt door tot 02:45 en blijft staan.
- Receipts: `pnpm typecheck` exit 0; `pnpm test` exit 0 (46 bestanden, 307 tests, incl. nieuwe wiel-test). Geen e2e (orkestrator).
## 2026-09-25 — snap-back, tweede oorzaak (live ingest :8080)
- 4310 op MOTREGEN_DATA_ORIGIN=http://localhost:8080. Repro `web/tmp/u34-refresh-repro.mjs` (niet gecommit): gepauzeerd over 2,5 min met verversingen → cursor blijft 21:04 (index 48→47 bij een vooraan weggevallen frame; epoch-mapping werkt). Afspelend → 20:36…03:56 (horizon) en dan in één frame naar 17:10 (tijdlijnbegin), elke ~50 s: dát is de "snap back"; verversingen (60 s, 121 s) hadden geen effect.
- Fix: aan het eind van een rondje glijdt de cursor in PLAYBACK_REWIND_MS 700 (ease-in-out) terug naar het begin i.p.v. `return 0`. Repro na fix (100 ms samples): 04:04 → 04:01 → 03:28 → 00:30 → 20:20 → 17:36 → 17:10, dan verder spelen.
- Receipts: `pnpm typecheck` exit 0; `pnpm test` exit 0. Geen e2e.
## 2026-09-25 — A: windlijn in CSS-px (retina)
- lineWidth was device-px (U3): op DPR 2 half zo dik als op 1× (PO: MacBook te dun). Nu CSS-px, omgerekend naar bufferpixels via clientWidth; default 2,5 blijft → 1×-beeld ongewijzigd, retina 2× zo dik. Smalle schermen (≤ 430 CSS-px, mobiele layout) × WIND_NARROW_LINE_FACTOR 0,6 = 1,5 CSS-px, om mobiel fijn te houden (oude U3-reden); op een telefoon met DPR 2,75 is dat ~4 dpx i.p.v. 2,5 — PO moet oordelen. Dev-knop eenheid dpx → px.
- Receipts: `pnpm typecheck` exit 0; `pnpm test` exit 0. Geen e2e.
## 2026-09-25 — B: wolken (PO-besluit)
- Weermodus: één band totale bewolking (cloud_frac, stijl 'mid', 30 % van de plothoogte) boven het regenhistogram; regen weer op volle breedte (geen halvering). data-scrubber-view 'cover'.
- Nieuwe modus Wolken (FocusKind 'clouds', kaart ongemoeid — alleen temperatuur/wind hebben een tween): tabelkolom "Wolken" met modeknop en per uur een mini-stapel hoog/midden/laag in %; in die modus alleen de drie lagen over de hele plothoogte, met labels, geen regen ('clouds'). Gevoel/Wind: alleen regen ('rain'). Lagen laden nu altijd na de initial-fase (kolom). Pinnen van Wolken markeert geen usage-feature (privacycontract ongewijzigd).
- Tests: scrubber (3 weergaven), tabel (Wolken-kolom), cloud-section.spec herschreven.
- Receipts: `pnpm typecheck` exit 0; `pnpm test` exit 0 (46 bestanden, 309 tests); `… pnpm e2e e2e/cloud-section.spec.ts --project desktop` → E2E-EXIT 0 (1 passed, één run).
## 2026-09-25 — C: kolomhighlight
- Hele kolom (th + alle td van Gevoel/Wind/Wolken) is hoverdoel; verlaten wacht 80 ms zodat cel→cel/zonrij de focus niet onderbreekt; data-hover op de tabel tint de hele kolom (lichter dan pin); pin-tint nu ook voor Wolken; toetsenbordfocus op de kopknop ongewijzigd.
- focus.spec: de toetsenbordtest tabde van Gevoel exact één stap naar Wind; sinds B staat Wolken ertussen → tabt nu door tot de Wind-kop (robuust voor kolomvolgorde).
- Receipts: typecheck 0; `pnpm test` 0 (46, 310); `pnpm e2e e2e/focus.spec.ts --project desktop` → E2E-EXIT 1 (alleen die toetsenbordtest, oorzaak B-kolomvolgorde); na fix `… -g "keyboard focus on the column heading"` → E2E-EXIT 0.
## 2026-09-25 — E: vlaag-opmaak
- Vlaag altijd in de ingestelde eenheid (Bft-modus: Bft i.p.v. km/u; `gustUnit` weg), weergave "3 ⌇ 6 Bft" / "18 ⌇ 26 kn" (één eenheid achteraan), alleen bij ≥ 1 stap boven de hoofdwaarde (ongewijzigd); aria-label/title "…, windstoten tot 6 Bft".
- Tests: weather.test, ForecastTable.test; e2e/table.spec regexen bijgewerkt (niet gedraaid).
- Receipts: typecheck 0; `pnpm test` 0 (46, 310). Geen e2e.
## 2026-09-25 — D: kolom Lucht + bewolkingssluier
- Tabel: UV- en Wolken-kolom → één kolom "Lucht" (modeknop 'clouds'): bewolkingsglyph op cloud_frac in 4 stappen (helder <20, licht <50, half <80, bewolkt; bedekkingsrondje leeg/kwart/half/vol) + overdag de UV-balk (relatief dagmax), 's nachts alleen het glyph. Wolkenlagen-reeksen laden weer alleen als Lucht gepind is.
- Kaartmodus: derde isolijnset kind 'cloud' op cloud_frac (alleen bij cloudFocus > 0 geladen), hergebruik van de vulpas met grijswit palet (licht/donker), `lines: false`, nieuwe stijl `fillByValue` [15, 95] % → dekking 0…0,55 via één extra uniform in de bestaande vulshader; geen labels. FocusMode heeft nu een tween voor 'clouds'.
- LET OP: docs/contract.md en MIP-4 ronde 3 zeggen "cloud_frac nooit als kaartlaag" — dit PO-besluit wijkt daarvan af; MIP-4 heeft een amendement nodig (PM).
- Tests: tabel (Lucht-kolom, glyphstappen), cloud-section.spec (knop Lucht + sluier-canvas).
- Receipts: typecheck 0; `pnpm test` 0 (46, 311); `… pnpm e2e e2e/cloud-section.spec.ts e2e/focus.spec.ts --project desktop` → E2E-EXIT 0 (9 passed, 2 skipped), één run.
