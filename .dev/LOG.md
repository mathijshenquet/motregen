# motregen — orchestrator log (newest first)

## 2026-10-07 — perf-dag: profielmodus, twee gemeten daders gefixt; PWA, Telegram, skywatch; tabel/modi en wolken live

- **Dev-host heet nu ageq-dev2** (was ageq-mthq): Vite `allowedHosts` + AGENTS.md bijgewerkt;
  previews op http://ageq-dev2:43xx/. De stats-rsync-pull en de prod-authorized-key wijzen nog naar
  ageq-mthq (oorzaak van "stats doet het niet", E5) — nix-wijziging + sleutel van deze host nodig.
- **Gemerged op main (in volgorde)**: micro-fix ▶/1 s hervatten/wolkenlabels; U44 presets + PWA
  (naam "motregen.nl", tagline "Regenradar en weersverwachting", SW NetworkOnly voor data/hit/tiles,
  update-toast; workspace-lock naar de root); U43 profielmodus `?perf` (MIP-16: acht fasen, LoAF,
  JS Self-Profiling, Chrome Trace-export, prof-sink op de dev-host; `?perf=start` = koude start,
  HUD linksonder/compact, opname-pil met Stop); U46 skywatch-meetrig De Bilt (MIP-18 deel 3: poller
  elke 10 min vanuit de main-checkout, dagboekknop, Decisions-grading-pijplijn; rooktest wacht op
  OPENAI_API_KEY + 10 daglichtbeelden); U45 Telegram (MIP-17: @motregen_bot, inline, stills,
  Mini App bij ?tg=1, Nix-service; identifier-overdracht naar de server in review verwijderd);
  U48 watermasker in worker (buildWaterMask 66 % → 0,4 % van de hoofddraad-samples; `pnpm
  prof:top --dist` met sourcemap); micro-fix gecachte Intl-formatters (~2,5 s/30 s op Android);
  U49 decode-budget (mobile-4g passief 492→223 decodes, 4,2→1,9 s; scrub p95 1439→73 ms).
- **Metingen (PO-opnames in ~/motregen-profiles)**: Mac-Chrome 54 % in buildWaterMask; Android-
  Firefox 893 decodes / 23,6 s in 29 s; Android-Chrome (echt) 152 LoAF / 15 s, Worker.onmessage
  tot 286 ms, basemap-tiles p50 0,3–1 s. Na U48/U49 is de hoofddraad vlak; resterende posten:
  decode (ingest zonder zstd content size → U50), basemap-tiles (netwerk+parse; E8 PMTiles),
  ~750 van ~830 decodes waren puntreeksen die een heel rooster uitpakten voor één pixel.
- **Proposals**: MIP-16, MIP-17, MIP-18 accepted (PO in chat); MIP-14 amendement tabel/modi met
  de live-besluiten (Weer standaard gepind mét ambient wind en rustige wolkenlagen; Lucht = UV+
  wolken met sluier, regen erachter op 0,35 zonder label; RV uit beeld; subtiele Uur-tekstkop;
  geen wolkje in de Lucht-cel; contract v2 = share + pinAir); MIP-19 laadchoreografie (draft:
  splash = kaart + eerste regenlaag, histogram van binnen naar buiten, fog of war, ttfr/ttfh/ttfc).
- **Lopend**: U42 tabel/modi live-pane (4320, draft-PR #73, wacht op PO "klaar"; mobiele
  view-switch als native scroll + kaartpauze), U47 wolkentekening live-pane (4350, opus 5.5,
  wacht op PO-review stap 1), U50 ingest zstd content size (terra), U51 perf-journey e2e (terra;
  de journey klikte op de verdwenen bereikknop "Alles" — pre-existing rood sinds U34).
- **Middag (vervolg)**: gemerged U50 ingest zstd content size (fzstd 2,3×/4,4×/17,6× sneller;
  bijvangst: spec/ Python <3.14 gepind, cross-check-tests weer 3/3 groen), U51 perf-journey
  herschreven + budgetten gekalibreerd (continue-zoom `test.fixme` met tien metingen), U53 mobiele
  laadrig `pnpm perf:mobile` (wire weight uit twee bronnen byte-gelijk, baselines 0 % spreiding,
  --compare; getrouwheid eerlijk begrensd: CDP-throttle remt workers niet), U52 tijd-majeur
  decoderen + intent-planner (MIP-19 p4/MIP-20 p1: wolkenlagen nu±1u mobile-4g +1,3→+0,3 s,
  journey +2,9→+0,6 s; scrub p95 202→75 ms; rig wire −4…−10 %; mobiel passief RT-budget 587→686 kB
  met reden). Telegram poke-test met de PO (bot lokaal op deze host vanaf main/preview 4330, dev-
  only `MOTREGEN_DEBUG_CHAT_ID`-log, web_app-knoppen alleen bij https-origin): stills/edits werken;
  PO-feedback → U55 (file_id-cache, kaal, zonder Wind-still, minder knoppen, video-loops via
  sendAnimation uit dezelfde framereeks, Wind alleen als loop, 400 op oude-generatie-knoppen
  afvangen, optionele vooraf-upload via `MOTREGEN_CACHE_CHAT_ID`). U55 loopt (gpt-6.1-sol); de PO
  stuurt daar live bij (tijdstappen-keuze open). MIP-20 intent-gedreven laden (draft).
- **Open (nieuw)**: autoplay loskoppelen van fase "venster compleet" (U52-prijs op desktop
  2,9→3,7 s) → laadchoreografie-track (U54); PO-kanaal voor vooraf-upload van de bot-matrix;
  tijdsneden als transport (MIP-20 p2) pas na meting op 4G.
- **Modeltabel (nix-config)**: opus-5.5 + gpt-6.1-sol voorkeurswerkers; gpt-6 code-golf-tic als
  bekend risico; gpt-6-luna = Decisions-grader; codex-default is gpt-6-sol, model altijd expliciet.
  Datapoints vandaag: 5.6-sol (U42/U43/U46) en 6.1-sol (U45/U48) zonder false greens; U48 en U49
  (opus 5.5) exemplarisch in eerlijke metingen; terra nog te zien (U50/U51).
- **Search Console** via gcloud ADC (quota-project Personal, scope webmasters.readonly): 3
  vertoningen sinds 1-9, geïndexeerd, laatste crawl 25-9; link op mathijshenquet.nl geplaatst.
- **Open MET PO**: `TG_BOT_KEY` in prod `secrets.env` vóór de deploy; deploy (nachtelijk of
  "deploy"); reviews U42/U47; MIP-19 adoptie; productkeuze decode-rest (histogram grover buiten
  ±2 u / geen autoplay op krappe toestellen); OPENAI_API_KEY voor de skywatch-rooktest; E5 stats-
  pull naar ageq-dev2; A1 nog een Android-Chrome-opname op de nieuwe main (4330).
  **VOOR AGENTS**: U38 kolomset (na U42), U50 (MIP-19) na U42, skywatch-rooktest na ~10 beelden,
  U41b, U29, U40, E8 PMTiles-meting.
- **Avond (16:00–18:00)**: gemerged op main t/m `15365cc1`: U55 Telegram-loops (video via
  sendAnimation uit dezelfde framereeks, Wind alleen loop, Lucht uit Telegram, delta-knoppen
  −1u·−10m·nu·+10m·+1u, file_id-cache + vooraf-upload naar privégroep `MOTREGEN_CACHE_CHAT_ID`,
  auto-verwijderen na een week), U56 klokpil (sleepbaar, tijdlijn bij uitklappen, afspeelknop na
  slepen; jog 120 s/px), U42 tabel/modi (Weer standaard, Lucht als kaartmodus, RV uit beeld, mobiele
  view-switch met animatie), U47 wolkendoorsnede met licht en vibe (MIP-18 deel 1, één ingang
  `expressive`), micro-fixes: zoekpil-animatie, scrubber-hervatten wacht op gesloten klokpaneel,
  permalink "Deel dit moment" (`?plaats=` i.p.v. lat/lon, `t` alleen bij open klokpaneel, als
  compacte Amsterdamse tijd `2026-10-08T0757` zonder dubbele punten; ISO/Z blijft leesbaar;
  MIP-17 aangevuld). Spec U57 pad-URI's (`/weer/utrecht`) geschreven, nog niet gestart.
- **Regressie gemeten en gefixt**: PO-opnames (Android-Chrome, 4330-builds 14:58 en 15:07) toonden
  na U42/U47 28 lange frames / 8,4 s blocking per 30 s en 374 decodes; rig mobile-4g koud
  113 → 297 decodes (vóór/na U42), 1,07 → 1,65 MB. Drie daders: U42 laadde alle 25 uurrijen per veld
  (ook RV), de tabel herrenderde per afspeeltik, U47 herbouwde de hemel-SVG per tik (cloneNode +
  insertBefore 1,66 s). U58 (opus 5.5, live-pane 4320) fixte alle drie: 128 decodes / 1,13 MB,
  hemel-knopen per 12 s afspelen 4 843 → 9, tabel 775 → 35, DOM-werk ~8 ms; nieuwe baseline +
  `scripts/dom-churn.ts`. Bijvangst: de rig vanuit de main-checkout bouwt `dist` met de test-
  basemap en brak de 4330-preview (splash hing) — rig alleen in een eigen worktree draaien.
- **Fleet**: alle workers gesloten behalve U58 finishing touches (opus 5.5, 4320): globale
  schakelaar Expressief (stap 1, wacht PO-akkoord), jog-default, dev-panel.spec, bot /temperatuur
  +/hitte en loop als standaardantwoord, landscape-loop. Les: herdr-prompts komen bij een Claude-pane
  als "geplakte tekst" binnen; de worker wachtte drie rondes op een menselijk "ja" — zeg in de
  eerste prompt dat herdr-berichten orkestrator-instructies zijn.
- **Open MET PO (avond)**: `TG_BOT_KEY` + `MOTREGEN_CACHE_CHAT_ID=-1003976938683` in prod
  `secrets.env`; deploy van main (alles van vandaag); MIP-19/MIP-20 adoptie; nog één Android-
  Chrome-opname op 4320 na de regressiefix. **VOOR AGENTS**: U57 pad-URI's, U54 laadchoreografie
  (na U58), U38 kolomset, skywatch-rooktest, U41b, U29, U40, E8.
- **Avond 2 (18:00–21:00)**: PO-lat vastgelegd (MIP-19 §De lat): spelende tijdlijn op mobiel ≤ Buienradar
  (`ttfp` vs `ttfp-ref`); PO-mandaat: perf zonder waarneembaar effect mag autonoom door (spec U54
  §Aanvulling). **U58 deel 1 gemerged** (e7466e4b): Expressief-schakelaar, drie regressiefixes, haperend
  afspelen bij laden (layout-reads per frame, hemelstreken), scroll-naar-tabel 100dvh (PO bevestigd),
  baselines, dom-churn.ts; deel 2 loopt live: jog-default vast (PO), strook sleepbaar op touch,
  dev-panel.spec, zoekpil-morph (PO: sprong aan het eind, full-width in smalle modus), bot-commando's.
  **U59 eigen basiskaart gemerged** (702d194, MIP-21 optie 1, gpt-6.1-sol): tilemaker-pijplijn
  `tools/basemap`, z10-PMTiles met overzoom (PO: "degraderen mag"), eigen stijl licht/donker,
  Nix-package + Caddy `/data/basemap` immutable, SW CacheFirst; rig mobiel koud basemap 5,6 s →
  0,22–0,6 s, −41 % bytes; p50-gate versoepeld tot streefwaarde (één starttegel = totaal). Codex-sessie
  viel twee keer na ~1 u uit (herdr bleef 'working' melden) — herstart in dezelfde pane, werk intact.
  **U54 lus** (opus 5.5, live-pane 4355): meetpunten ttfp/ttfr/ttfh/blank-visible (nu ook oppervlak),
  Buienradar-referentiescenario, profiel `po-android` gekalibreerd op de PO-opnames met cgroup-CPUQuota
  op de renderer (remt ook workers), speelregel cursorframe + volgend frame: rig ttfp 3,93 → 2,62 s
  tegen Buienradar 3,24 s (0,81×); PO-telefoon 3,65 s (ttfp-ref op de telefoon nog te meten, recept in
  docs/perf.md); stap 3 scrubber-kader staat voor PO-akkoord; soepelheidsmetingen in de rig; rig bouwt
  naar tmp/rig-dist (les: rigs overschreven previews → splash hing, twee keer); eigen rig-poorten per
  track. PO-opnames (Android Chrome, 4320 ná fixes): lange frames 9,3 → 1,35 s; MacBook Firefox-
  profielen (Buienradar + motregen) en Chrome-trace (laden + zoeken) in ~/motregen-profiles/macbook-*,
  kopieën bij U54/U58. Bot: "renderer blijft heet" was een meetfout (levensgemiddelde; /proc toont 0 %
  tussen generaties); een generatie kost ~4 cores × 60 s, cadans is de knop. Micro-fix zoekpil-radius
  (23895a3b) loste de sprong niet op → bij U58.
- **Open MET PO (avond 2)**: PO-akkoord U54 stap 3 (kader) en smaak A6 (kader in hemelkleur); Buienradar
  op de telefoon meten (recept) of adb-server op de Mac openzetten voor een echte-telefoon-rig; MIP-21
  adoptie (optie 1 gebouwd), MIP-19/20; push-notificaties (Telegram eerst, Web Push daarna) als MIP-22
  als gewenst; deploy; `TG_BOT_KEY` + `MOTREGEN_CACHE_CHAT_ID` in prod. **VOOR AGENTS**: U58 deel 2
  (zoekpil-morph, bot), U54 lus + stap 4 fog/skeleton, U57 pad-URI's, skywatch-rooktest, U41b, U29, U40.
- **Nacht (23:00–00:30, PO slaapt, "alles naar eigen inzicht afronden")**: **U58 deel 2 gemerged**
  (29d30a63: zoekpil-morph in één beweging met inhoud erna en full width in de smalle modus, jog-default
  vast + strook sleepbaar op touch, dev-panel.spec, bot: /temperatuur (+/hitte), loop als standaard-
  antwoord, knop Temperatuur, 10-minuten-temperatuurloop, deltaknoppen per modus, loop-upload met
  afmetingen, klok groter; e2e bouwt naar tmp/e2e-dist; devtools-trace/search-trace-scripts; location.
  spec wisknop). PO-oordeel landscape-proef: "afschuwelijk" → staand blijft (mijn misverstand hersteld).
  **U54 gemerged** (486e23da: MIP-19 meetpunten, po-android met cgroup-CPUQuota, speelregel cursorframe
  + volgend frame met 3 s wachtlimiet, scrubber-kader tijdens laden, temperatuurpalet-fix, soepelheids-
  scenario's, ?dev Eerste regen/Kaderhemel, prof:firefox; rig ttfp 1,68 s vs Buienradar 2,52 s). De
  rode decode-budget.spec vond een echte bug in de speelregel (lus haalde de hele tijdlijn binnen) —
  gefixt vóór de merge. Conflicten U54×U58 (jog-optie weg vs Laden-groep erbij) door mij opgelost;
  dev-paneel boven de Perf-HUD (z 1001) omdat de HUD anders de Diagnose-knoppen afdekt. Micro-fixes op
  main: location.spec (startlocatie na herlaad via eigen permalink → geen geocoder; 16 px/44 px/20 px
  sinds U34; verse navigatie i.p.v. reload), zoekpil-radius 22 px, dev/preview serveren de PMTiles
  lokaal (grijze kaart op 4330). Bot herstart vanaf main tegen 4330 (staand). Open: verse-worktree-
  unit-run laat soms `wind-layer.test.ts` op bestandsniveau omvallen onder load (herhaling groen) —
  foutmelding nog niet gevangen. **U60 loopt nog** (gpt-6.1-sol, 4340, PR #87): labels en nacht-
  contrast goed, groen nog te schaars en verkeerd (parken i.p.v. bos/landcover) + bebouwd grijs
  ontbreekt → bijgestuurd (±15 % van Liberty, budget +25 %); Codex-sessie herstart na uitval om het uur.
- **Voor de PO morgen (live op http://ageq-dev2:4330/)**: zoekpil-morph (390 én ~800 px), speelregel +
  laadkader + temperatuurpalet, Kaderhemel/Eerste regen (?dev, kiezen of weg), Telegram
  /temperatuur-loop en loop-bubbelbreedte, U60-kaart op 4340 zodra "klaar". Buienradar op de telefoon
  meten (recept docs/perf.md) of adb-server openzetten. Deploy + prod-secrets (TG_BOT_KEY, cache-chat).
  MIP-19/20/21 adoptie; MIP-22 push-notificaties als gewenst.
- **Nachtelijke volledige e2e op main (00:01–00:17, loadavg 5,5 bij start)**: 30 rood / 84 groen / 63
  overgeslagen (`~/motregen-profiles/nightly-e2e-2026-10-07.txt`). Rood vooral in de mobiele
  profielen: basemap.spec (alle varianten + warme cache), focus (touch), freshness, perf-journey,
  pin-navigation (touch), table (mobiele preview). Workers testten vandaag alleen desktop. **U61
  nachtelijke e2e-triage** gestart (gpt-6.1-sol, spec 09d13646): oorzaak per test (productbug /
  verouderde test / flake / nieuwe test nooit op mobiel gedraaid), productbugs fixen, tests alleen
  met benoemde reden aanpassen, daarna de suite nog één keer op een rustige host.
- **U60 gemerged** (e37731bf, 01:20): groen en grijs binnen ±1 pp van Liberty per A/B-paar (28 paren),
  labels als Liberty, nachtcontrast 8,4 → 11,7, kaartbytes +13,5 % t.o.v. U59, kaartfasen ~0,5 s; PR #87.
  Twee nachtelijke oorzaken op main gefixt (5ba8c171): mijn preview-plugin voor het lokale PMTiles-
  archief is nu alleen actief bij een externe https-data-origin (hij zat in e2e tussen de metingen);
  `pnpm test` draait eerst synthgen (de "verse worktree"-unit-fout was `mrf.test.ts`, niet wind-layer:
  het leest gegenereerde chunks). Nog open: basemap.spec/basemap-cache.spec zijn in een verse checkout
  rood omdat e2e/style.json een teststub is en public/data/basemap niet bestaat (gitignored) — U59/U60
  kregen ze alleen groen met een voorbereide omgeving; U61 maakt ze zelfvoorzienend. U61 loopt verder
  op de overige nachtelijke reds. Workers nog open: alleen U61.
- **U61 gemerged** (25d500e4, 01:55): basemap-e2e zelfvoorzienend (webServer bereidt stijl en archief
  voor), 28 tests eerlijk bijgewerkt op de bewuste wijzigingen van vandaag (U34/U42/U44/U56/U58, elk met
  reden), mobiele scrub-transferbudgetten 11/14 → 16 (zes previewrij-ranges van U42/U58, 24 kB; besluit
  orkestrator, U52-precedent). Onafhankelijke gate: volledige suite op branch+main 112 groen / 2 rood
  (de budgetten vóór herijking) / 75 skips, daarna perf.spec mobiel 4 groen → **main is vannacht
  volledig groen**. Alle workers gesloten; 4330 draait main; bot vanaf main tegen 4330 (staand).

## 2026-10-08 — ochtend: prod gedeployed door de PO; U62 live; lussen U63/U64; U57 pad-URI's gemerged

- **Prod** draait sinds vannacht main (zelfde bundel als 4330); de lokale bot ziet geen 409 → prod-bot nog
  niet actief (secrets). PO-oordeel op prod: kaart "voelt zeer snappy".
- **U62 live-pane** (opus 5.5, 4320): hemelbug mobiel — oorzaak gemeten: de stralingsreeks werd alleen voor
  de getoonde tabelrijen gelezen en elke lezing verving de reeks, zodat uurstops van bron wisselden bij
  elke uurrij (mijn index-hypothese weerlegd); fix: hemel krijgt het scrubbervenster ± 1 u, waarden blijven
  staan; venster-stap van 598 → ~80 streken, LoAF 2 → 0. Stap 2 tabelpiep: Firefox-only tijdens vinger-
  down (PO) → eigen tween op gecachte rij-offsets. Stap 3 contextgevoelig chrome (liniaal op de hemel,
  koppen in hemelkleur, klokpil ?dev-varianten) staat voor PO-akkoord. Open: laag-varianten onder de
  perf-lock, wind op mobiel (stap 4).
- **MIP-23 (draft, PO-akkoord in chat)**: U63 mobiele ttfp-lus en U64 desktop-waterval-lus, beide
  gpt-6.1-sol; PO-prioriteit ttfr > ttfp, ttfh secundair, LoAF na start als bewaker. Nulpunt U63:
  ttfp 1,73 s / ttfh 4,3 s (rig). Host-brede perf-lock (`flock ~/motregen-perf.lock`) voor alle tracks.
- **U57 gemerged** (4b14eab7): pad-URI's, #t=-fragment (PO: semantisch correcter), 301's, sitemap 209
  URL's, geen opgeslagen-plaatslabels in de URL. Gate: 482 unit, 25 e2e, flake groen. Op 4330.
- **Lessen**: codex 0.161 heeft `--no-daemon` nodig in herdr-panes (anders sterft hij direct; herdr meldt
  toch agent_started); codex-keuzevragen beantwoorden via `send-keys shift+left`/enter.
- **Open MET PO**: akkoord U62 stap 2/3 op 4320; Buienradar op de telefoon meten; prod-secrets voor de bot
  (dan lokale bot stoppen); MIP-19/20/21/23 adoptie.
- **Late ochtend**: U66 gemerged (32b82bad): alle Telegram-loops op één 5-minutenklok (−2…+12 u,
  169 frames, 10 fps), generatie 35 → 64 s binnen budget; bot herstart vanaf main. U65 (volledige
  plaatsenlijst uit de basiskaart-pijplijn + pad-URL respecteert de pin in dezelfde zone) loopt.
  U62: koppenrij volgt de bovenste zichtbare tabelrij (PO), Kaderhemel vast aan (PO: "veel beter"),
  dag/nacht-kaarttween als ?dev-experiment (MIP-24 draft: thema Licht/Donker/Automatisch); laatste
  gate-punt: freshness.spec mobile-4g. U63: hoofdlijn nu de eigen-kaartreeks (koud ttfr 3,6 s / ttfp
  1,65 s op po-android; de 1,2 s-reeks was de fixture-stijl); waterval in uitvoering; U64: Lighthouse 68
  = TBT 728 ms + Speed Index 2,7 s, FCP/LCP/CLS 100; placeholder-proeven: SVG afgekeurd, z4-tegel
  achter vlag (U63 meet mobiel). Perf-lock `~/motregen-perf.lock` host-breed.
- **U62 deel 1 gemerged** (8d75754f, 11:10): hemelbug, tabelpiep-tween, contextgevoelig chrome (koppen
  volgen de bovenste zichtbare tabelrij), Kaderhemel vast aan, ?dev-varianten (klokpil, wind, kaart-
  dag/nacht-tween = MIP-24-experiment), freshness.spec mobiel gefixt (rood sinds U57). Gate: 494 unit,
  36 e2e desktop+mobile-4g. Open bij PO: klokpil-variant, windniveau, MIP-24. U65 klaar (PR #93, 6.997
  plaatsen, pin-zone), gate loopt; PO-vraag "61 kB op het kritieke pad?" → U65 bewijst lazy-na-ttfp en
  slaat zone op bij kiezen; server-side inlijnen = YAGNI tot meting.
- **U65 gemerged** (0fb247ec, 11:55): 6.997 plaatsen (61 kB gzip) lazy ná ttfp (desktop +0,8 s, po-android
  +1,0 s erna; bewezen met watervallen), pin/plaatsnaam/zone lokaal bij kiezen, `/weer/<plaats>` houdt de pin
  in dezelfde zone, 69-lijst fallback; server-side inlijnen = YAGNI tot meting. Gate: 506 unit, 27 e2e.
  PO-keuzes vandaag via U62: klokpil/zoekbalk/druppel tinten mee; kaart gaat mee onder Expressief
  (MIP-24 accepted); wind "iets" op mobiel; koppen tweenen alleen bij de zon-op/onder-rij; rand
  kaart/zijpaneel: A (1 px hemelkleur) geadviseerd, PO beslist. Perf-lock-discipline: wachten op load
  BUITEN de flock (U63 hield hem > 1 u).
- **Sessie-herstart 14:55** (PO). Stand: U62 live-pane (w1K, opus-5.5, 4320) heeft op zijn branch ONGEMERGED:
  klokpil/zoekbalk/druppel tinten mee, kaart-tween onder Expressief (kostenmeting nog open), wind "iets",
  koppen wisselen bij de zon-rij, lijnensysteem dag/nacht (94037cc), rand-schakelaar oud/geen/A/B (PO kiest
  nog; B "clean", lijnen te hard → opgelost door lijnensysteem), splash-sluierproef (d7e8fbc, PO: "werkt niet",
  knop mag weg). U63 (w1M) en U64 (w1N), gpt-6.1-sol: warm = volwaardig scenario (MIP-23-aanvulling),
  gepaarde A/B tot load 16, absolute baselines ≤ 8; U63 kreeg "waarom duurt de kaart 2 s ná de bytes" +
  uitgeklede-stijl-eerste-paint + z4-placeholder gepaard als opdracht; U64: shaderbatch gepaard ttfp −14 %
  maar ttfr +7 % (nee), vroege WebGL-worker in proef. Lokale tg-bot (nice 15) rendert loops; PO zet de
  prod-tg-bot aan (commando in chat, secrets via ssh); daarna lokale bot stoppen bij 409. Achtergrond-
  shells van deze sessie (preview 4330, prof-sink 4331, bot, watchers) vervallen bij herstart: 4330 en de
  bot opnieuw starten vanuit main; hydra-soak staat uit.
- **tg-bot op prod** (15:05): sleutel van ageq-dev2 via ageq-mthq (mthq-sleutel) op root@57.129.47.17 gezet
  én in `nix/authorized-keys.nix` (1c3ef810); `TG_BOT_KEY` + `MOTREGEN_CACHE_CHAT_ID` uit de lokale .env
  in prod `secrets.env`; `motregen-bot` actief, `bot-started`, eerste drie loops renderen (VM: 2 kernen,
  3,8 GB, Chromium ~150 %). Lokale bot gestopt; 4330 + prof-sink 4331 opnieuw gestart na de sessie-
  herstart. Orkestrator mag prod nu zelf muteren (PO 2026-10-08).
- **Prod-upgrade naar main gestart** (15:25, flake check groen; brengt U66-loops, U62 deel 1, U65, U57,
  U61, nieuwe sleutel). Ontdekt: prod-bot draaide de oude 49-frameloop: 231 s renderen op 2 kernen → met
  169 frames ≈ 40 min per generatie, VM rendert fulltime (PO: "gaat die vm nu fulltime webpagina's
  renderen 😆"). Runtime-rem gezet (CPUQuota 150 %, CPUWeight 20, MemoryMax 1,5 GB); MIP-25 (draft):
  renderer los van de poller (render-only op ageq-dev2 → cache-groep) met loops-elke-15-min als overbrugging.
- **Prod op main (gen. 14 + nix-rem)**, 16:00: eerste 169-frameloop op de VM = 705 s renderen (weer), dus
  ≈ 40 min per generatie zoals MIP-25 voorspelde; web blijft 0,11–0,14 s. Bot-geheugenpiek 1,9 GB + 0,5 GB
  swap → MemoryMax 2,6 GB (runtime + nix, 18937b4c). U63: warm op po-android ≈ koud (ttfr 3,8 s, ttfp
  1,9 s) → CPU-gebonden, lus herricht op werk-vermindering; z4-placeholder: eerste kaart 1,7 s eerder
  maar ttfp +0,3 s → PO-smaakkeuze, proef bewaard, screenshot naar PO. U62: splash-proef weg (10698d7).
- **Loops 40 min achter op prod → bot terug naar ageq-dev2** (16:25, PO "ja doe dat maar"): `motregen-bot`
  op de VM gestopt + runtime-mask; lokale bot vanaf main (nice 15) tegen 4330 pollt weer (bot-started,
  generatie 13:17Z). U67 gestart (gpt-6.1-sol, w1Z): renderer los van de poller, MIP-25 optie 1. Later:
  renderwerk goedkoper maken zodat de VM het zelf kan (PO: optimalisatiepass).
- **U67 gemerged** (5f511116, 17:20; 35 min werk, gpt-6.1-sol): bot-rollen renderer/poller/combined,
  register = vastgepind JSON-document in de cachegroep (atomair per generatie, gevalideerd, lokaal
  bewaard), nix-rol met flake-check die de poller-closure Chromium-/ffmpeg-vrij bewijst; prod =
  poller (CPUQuota 25 %, MemoryMax 256 M). Gate: 84 bot-tests, typecheck, build, flake. Uitrol: lokale
  combined-bot gestopt, renderer vanaf main op ageq-dev2 tegen motregen.nl gestart; VM-deploy naar
  poller volgt zodra het eerste register staat.
- **Bot-rollen live** (17:45): renderer op ageq-dev2 (main, nice 15, tegen motregen.nl): generatie 13:57Z
  = 173 media, render 53 s + prime 127 s = 179 s (budget 210 s, krap); register gepind. VM gedeployed
  naar poller-rol (`bot-started role=poller`, `register-refreshed 13:57Z`), runtime-overrides verwijderd
  zodat nix-grenzen gelden; web 0,16 s. U67-workspace gesloten. Renderer draait als achtergrondshell van
  deze sessie (log `~/motregen-telegram-cache/renderer-main.log`) — bij sessie-herstart opnieuw starten
  of als user-unit (open: nix-renderer-unit op ageq-dev2).
- **U62 deel 2 gemerged** (768d0761, 19:05): klokpil/zoekbalk/druppel tinten mee, kaart volgt de tijd onder
  Expressief (MIP-24; 4 mengstappen, 1/s: gemeten kostenvrij, p95 16,8 ms), wind "iets", koppen wisselen bij
  de zon-rij, één lijnensysteem dag/nacht (contrast ~1,3/1,6), rand-schakelaar oud/geen/A/B achter ?dev
  (PO kiest nog; B "clean"), splash-proef verwijderd. Gate 506 unit, 23+10 e2e, build; 4330 herbouwd.
  U62 nu op: regen-blending in Wind/Lucht (PO-screenshots in zijn trackmap, ?dev-varianten). U63: z4 op
  de hoofdlijn, preview 4340 voor de PO-telefoon. U64: shaders-van-hoofddraad −17 % ttfr gepaard, LH-paren.
- **U64 gemerged** (ff19077f, 20:50; 10,7 u lus, gpt-6.1-sol): vroege stijl/font/manifest-aanvragen, lazy
  modules, map-start-helper; gepaard op main: koud ttfr −33 % (−571 ms)/ttfp −8 %, warm −14 %/−4,5 %, alle
  zes paren positief; shader-, GPU-worker- en manifest-SWR-proeven afgewezen; LH 63→62 (TBT/SI blijven).
  Gate 511 unit, 32+9 e2e, build; 4330 herbouwd. U63 merged main; meldt "klaar voor merge" met z4 + cijfers.
  U63-proef kaart-eerst: ttfr −1,2 s maar ttfp +1,6 s → CPU-gebonden, werk verschuift; niet op hoofdlijn.
- **U63 gemerged** (abb23823, 21:30; 11 u lus, gpt-6.1-sol): z4-placeholder als progressieve eerste trap
  met gelijke tinting — po-android eerste kaartbeeld 3,8→2,2 s koud / 4,3→2,4 s warm, maar ttfr +0,5/+0,3 s
  en ttfp +0,3/+0,1 s (PO-keuze "gewoon proberen"; ttfr-prijs expliciet aan PO gemeld). Bewezen: warm ≈ koud
  op de telefoon (CPU-gebonden); kaart-eerst-volgorde verschuift alleen werk (ttfr −1,2 s, ttfp +1,6 s) →
  proefbranch. Gate 524 unit, 32+15 e2e, build; 4330 herbouwd. Nu alleen U62 nog open (blending + rand).
- **Nachtelijke volledige suite op main** (abb23823+, 21:40, 13 min): 171 groen, 80 overgeslagen, 4 rood:
  perf.spec mobiel ×2 (sessie-bytes 1.377/1.382 kB > budget 1.345/1.355 kB door de z4-startkaart ≈ 32 kB)
  → budget +40 kB met herkomst (gecommit, verificatie 4/4 groen); dev-panel.spec mobiel ×2 (wind 0,80 →
  "iets" 1,00) → al gefixt op U62's branch (pre-gate groen: 527 unit, 26+10 e2e, 3 Firefox). Uitslag:
  `~/motregen-profiles/nightly-e2e-2026-10-08.txt`.
- **U62 deel 3 gemerged** (c95b6375, 22:35): regen-blending Wind=vermenigvuldigen / Lucht=voorstel als
  default (PO "beide veel beter"); Firefox-Android-adresbalkbug ronde 4: gemeten oorzaak via PO-overlay
  (`visualViewport.offsetTop −63,7` bij scrollTop = max; layout klopte), fix = paneelstand t.o.v. de
  zichtbare viewport + vangnetstrook (120 px, koppenrij-kleur) boven het open paneel — OP TOESTEL NOG NIET
  BEVESTIGD; bijvangst: afgebroken tabel-scroll (3/30) door eigen correcties → correctie alleen na 300 ms
  rust, kaartkant-correctie weg; firefox-e2e-project (5 tests, 15/15 bij ×3); dev-panel.spec op wind
  "iets". Gate 527 unit, 33+24+15 e2e, build; 4330 herbouwd. Open bij PO: adresbalk-test op 4330/4320,
  rand-stand (?dev). U62 blijft open als live-pane.
- **U62 deel 4 gemerged** (d061fd5e, 23:05): PO-regressies op desktop hadden één oorzaak — kaartoverlays
  (waterrand, cijferhalo, isobaren/isothermen, labels) lazen het app-thema terwijl de kaart de kaarttijd
  volgde (nacht-inkt op een dagkaart → "tegelranden boven zee", heftige halo, onzichtbare isobaren); nu
  volgen ze de kaartstand. Rand = oud (schakelaar weg), tabelrijlijnen gemengd met de echte rijkleur
  (~1,25), kaart dag/nacht in één stap. Adresbalkfix door PO goedgekeurd. Gate 529 unit, 27+14+5 e2e;
  4330 herbouwd. Open: laatste PO-blik op 4330 (nacht-halo, rijlijnen); U62 blijft open.

## 2026-09-25 (laat) — U35/U36/U37/U34/U39 gemerged; workers uitgevallen op usage-limiet
- **Vervolg (22:00–01:00, PO live in de U34-pane)**: gemerged op main t/m `ea23512`: snap-back-fix
  (afspeelrondje glijdt terug; horizon +8 u blijft, PO: "afspelen ziet er goed uit"), windlijnbreedte in
  CSS-px (retina), kolom Lucht (wolkje uit de weericonen + UV overdag; vervangt UV en Wolken), modus
  Lucht = drie wolkenlagen in de grafiek + cloud_frac-sluier als kaartmodus (MIP-4 geamendeerd),
  hele kolom als hoverdoel, vlaag "3 ⌇ 6 Bft", adaptieve isobaarstap 4/2/1 + smoothing σ 3,5 en
  temporeel [1,2,3,2,1] op ⅓ dekking + H/L (alleen windmodus), scrubbergrafieken per modus, sticky
  daglabels, afspelen tot het eind + hervatten. **U41 stil-in-rust** gemerged (hoofddraad −73 %) maar
  ingreep 1 (tracen per uurstap + crossfade) door de PO afgekeurd ("ziet er echt heel slecht uit") en
  door U34 teruggedraaid; open: U41b = contouren tussen twee uur-tracés op de GPU interpoleren.
  **/stats/** van het publieke internet (PO): route + basic auth weg, rapport via rsync. **Pollen**: ADS-
  sleutel door PO geplaatst (dev .env én prod secrets.env), eerste echte ADS-run (20 chunks), fixture
  vervangen door echte download (leads 0–24), flake check groen. Lokale live ingest op deze host
  (`~/motregen-devdata`, caddy :8080) achter preview 4300; PO-profiel van de warme MacBook in
  `~/tmp/motregen-idle-profile-2026-09-25.json.gz` + `~/tmp/ffprof-threads.py`.
- **Deploy**: PO wil niet op de timer wachten → handmatige `nixos-upgrade` na flake check op `ea23512`.
- **Open MET PO**: U38 kolomset starten (pollen + luchtkwaliteit als één kolom; RV eruit; paging) —
  PO nog niet geantwoord; isobaren op NL-schaal weinig informatief (MIP-14 notitie); perf-budget
  800 → 900 KB (bundel 861 KB); Search Console alleen als hij Google wil; windlijn op telefoon.
  **VOOR AGENTS**: U38, U41b, U28, U29, U40; wind-zoom continue-zoom-test flaky onder swiftshader.

- **Gemerged op main (in volgorde, main nu `b3bff3b`)**: U35 isobaren (pressure_hpa, laag in wind-
  modus), U36 windstoten + eenheidsinstelling Bft/knopen/km/u/m/s (baken-veld `unit`), U37 wolken-
  doorsnede variant A (PO-keuze) vast in de weermodus-scrubber, ingest cloud_low/mid/high (AROME
  73/74/75, 5 %-stappen), U34 live-windtuning + WarnWetter-scrubber (vaste cursor op ⅓, schuivende
  tijdlijn, bereikknoppen weg, spatie = afspelen, versheidspaneel als uitrollende klokpil, wind
  default 0,5 / windmodus 0,8), U39 CAMS-ingest (`motregen-cams`: pollen + luchtkwaliteit, pred-codec,
  dagelijkse timer, manifest-opname achter `services.motregen.camsInManifest` = false).
- **Gates**: U37 typecheck/unit/build/cargo + 2 desktop-specs; U34 alleen typecheck/unit/build bij mij
  op het receipt van de worker (PO: "niet weer eindeloos e2e"); U39 cargo test/clippy/fmt/typecheck/
  build + één `nix flake check` op de merge met U37 (alles 0). Conflicten door mij opgelost: U37-rebase
  (synthgen/contract: gust_ms + cloud_*), usage.spec (range null + unit bft), contract.md (beide rijen);
  de U34×U37-scrubbermerge (wolkbanden op de schuivende as) door de U34-worker zelf.
- **Incident**: alle drie de opus-workers vielen weg op de Claude-usage-limiet (reset 18:00 UTC), U37
  midden in een rebase. `--continue` in dezelfde pane werkt; agents opnieuw starten met
  `herdr agent start <naam> --kind claude --pane <pane> -- --model claude-opus-5-5 --continue`.
  Watchers vuren ook op idle-tussen-turns terwijl een achtergrondgate loopt — pane lezen vóór actie.
- **Preview** 4300 = main `b3bff3b` (bundle `index-WHXYcSV9`; met U39 verandert de bundel niet).
  Twee verweesde vite-previews (4323 uit u8c, 4343) gekilld.
- **Open MET PO**: ADS-sleutel aanvragen (docs/pollen.md §"Wat de PO moet regelen"; zonder sleutel
  Open-Meteo, niet-commercieel); camsInManifest aanzetten pas met U38 (client prefetcht dan alleen
  getoonde velden); U34-pane blijft open voor live-iteratie (niet gesloten); MIP-11/12/14/15 adoptie;
  isobaren/stoten/wolken op prod pas na de ingest-deploy van vannacht controleren.
  **VOOR AGENTS**: U38 kolomset (spec klaar, U36 is binnen — kan starten), U28, U29, U40 (MIP-15).
- **Prod-check morgen**: bundle-hash, `pressure_hpa`/`gust_ms`/`cloud_*` in het manifest, `/hit` 204,
  `motregen-cams.timer` aanwezig maar zonder sleutel op Open-Meteo, cams-chunks niet in manifest.

## 2026-09-25 (avond) — PO-feedbackdag: U22–U33 + U22b/U24b/U25b gemerged; e2e-regime omgegooid; MIP-11/12/13

- **Gemerged op main (in volgorde)**: U27 Vlaanderen (kader zuid 50,45, Vlaamse plaatsen, BE-geocoder
  Digitaal Vlaanderen naast PDOK), U22 bovenrand (klok als tab, druppelknop rechtsboven met thema
  in de modal, zoomknoppen weg, smalle zoekpil, scrubber zonder band-/vandaag-labels, twee regimes),
  U25 temperatuurkaart (dunne uniforme lijnen, desaturatie als compositor-filter, KNMI-palet),
  U33 vindbaarheid (title/OG/robots/noindex, Search Console via DNS-TXT — PO plakt de waarde),
  U23 tabelkoppen als modeknoppen (uur+weer in één cel, regen bij het icoon, windpijl, relatieve
  UV-balk, historie inline op desktop), U26 pin-navigatie (start op huidige locatie bij verleende
  toestemming, sleepbare pin met randscroll, één-vinger-pan uit op touch, rotatie/tilt uit),
  U22b klok kaal (alleen tijd + statusstip, regimemarkering weg, About strakker, zoekpil op U17-maat),
  U25b vulling (dekkende vlakke banden per graad met lokaal gerekt palet, Buienradar-referentie),
  U24 wind (default-intensiteit 0,75, buffer-DPR 2, kopramp tegen wegvallers, trailbuffer vast bij
  continu zoomen), U31 gebruiksbaken + U32 serverkant (MIP-13), U30 dev-opties gesnoeid (gegroepeerd
  paneel met uitleg, 20 knoppen → constanten, wind v4), U24b (aanvullers naar leegste 3×3-omgeving;
  rand op PO-besluit weer verwijderd). Orkestrator-microfixes: tabel zonder zijpadding + celtekst op
  scrubber-inzet, grafiek volle breedte met kader (onder recht), klok zonder groene stip (stip links +
  leeftijd eronder bij achterlopen), vulling 0,35 + stijl banden/verloop, Vlaanderen-pintest op echte
  kaartprojectie (`window.__motregenProject`).
- **Proposals**: MIP-11 draft (niet-lineaire tijdas + lead-smoothing; U29 als ?dev-experiment na U25/
  U28), MIP-12 draft (inventaris + snoei dev-opties; regel: één poort `?dev`, eigenaar + vervaldatum
  per knop), MIP-13 accepted (anonieme gebruiksmeting; opslag `/var/lib/motregen-usage`, Cloudflare als
  tweede meter, geen Google-koppeling). Specs geschreven maar nog niet gestart: U28 (scrubber per
  modus, na U23 — kan nu), U29 (na U25b/U28).
- **Proces (PO-besluiten)**: e2e-lock → twee slots (`web/scripts/e2e-slot.sh`, `flock -o` na een
  verweesde vite-preview die slot 1 een uur vasthield); workers alleen gerichte specs; sinds 20:30
  alleen `--project desktop` per merge en de volledige drie-profielen-suite max één keer per dag
  (PO: "e2e duurt veel te lang" — ik had dat eerder moeten forceren: mijn volledige suites per
  merge-kandidaat waren de bottleneck). Live-tuning-pane U34 (wind) waar de PO direct met de agent
  itereert op http://ageq-mthq:4310/ (build per stap, geen e2e tot "klaar").
- **Lessen**: (1) jj: `jj new` na een push laat een lege commit achter; nooit een lege commit abandonen
  waar een worker-branch op staat (U32-branch-ref verdween, hersteld); (2) merge-kandidaten in een
  geïsoleerde git-worktree (`/tmp/int-<track>`), nooit in de jj-werkkopie (U22 werd per ongeluk mee-
  gepusht met een spec-commit); (3) perf-budgetten op mobile-fast-3g zijn ruis onder load > 20;
  (4) opus 5.5 op meetopdrachten: begrens "één meting, geen varianten" in de spec (U24b liep 4 u);
  (5) `uv_clear-20260828.mrf` valt onder .gitignore → `pnpm synthgen` in elke verse worktree.
- **Gebruik (uit het oude access-log, geteld op de box)**: 587 unieke IP's sinds 31-08, 475 zonder
  bots, 63 unieke IP's op het manifest; per dag 4–13 manifest-IP's waarvan de dev-host en de PO de
  grootste. Het oude access-log (met IP) staat nog op prod; wissen is PO-call (`docs/deploy.md`).
- **Open MET PO**: wachtwoord `/stats/` plaatsen na de deploy; oud access-log wissen; Search Console
  DNS-TXT; MIP-11/MIP-12 adoptie; pin-clipping op eigen scherm checken; muiswiel+Ctrl op touch-
  laptops (U26); U34 live-sessie afronden ("klaar" zeggen); OpenFreeMap self-host (MIP-14?) — advies:
  ja, PMTiles NL+Vlaanderen ~1–2 GB, eerst meten.
  **VOOR AGENTS**: U28 scrubber per modus (start), U29 tijdas-experiment, U30 restant (perf-HUD-knop
  weg? zie docs/dev-opties.md), U24-vraag: korrel op echte Mac beoordelen (nu in U34).
- **Prod-check morgen**: auto-upgrade neemt alles van vandaag mee; controleer bundle-hash, `/hit` 204,
  usage-log zonder IP, `motregen-usage-report.timer`, oude access-log uit, About-modal, tabel op mobiel.

## 2026-09-25 — U21 bovenrand (klok, zoekpil, popover); prod op U18b/UV live

- **Prod-check ochtend**: auto-upgrade heeft alles van 24-09 live gezet — `uv_clear` (U15),
  predictieve `feels_like_c`-frames (U18b), bundle `index-9shBqHM7` = integratie.
- **U21 gemerged** (na PO-correcties op U17: punt 2 ging over de ZOEK-popover, niet About;
  zoekbalk was "even groot"; klok moest midden boven): klok top-center op desktop én mobiel
  met de kaarttijd als hoofdelement, bronaccent in scrubberkleuren (linkerrand default,
  `?klok=stip`), datatijd + leeftijd klein eronder; zoekbalk in rust een compacte pil
  (≤ 240 px, ghost) die openvouwt tot een aangesloten paneel (default; `?zoekpaneel=omsluit`),
  klik buiten sluit zonder door te lekken naar de kaart, × wist/sluit, Escape; About-
  backdrop terug naar .42. Overlay-insets voor de contain-fit bijgewerkt. Onafhankelijk
  hergroen: 234 unit, e2e 31/31.
- Open MET PO: variantkeuze klok (rand/stip) en zoekpaneel (openvouwen/omsluiten) op zicht;
  LICENSE; isolijnen boven plaatsnamen; mobiel cold-TTFR-budget; UV-ghost op bewolkte uren
  (nu ook op prod); windtuning-JSON voor de U20-migratiecheck.
  VOOR AGENTS (met gemeten opbrengst): MQTT-ingest (−45–50 s radarversheid); pred-codec op
  de overige uurvelden (~40 % bytes); SessionStart-hookpad /home/mathijs (nix-config).

## 2026-09-24 — U12/U13/U14 gemerged, U15 in fixronde; prod op nieuwe ingest; hostlock

- **Prod-check ochtend**: auto-upgrade heeft de U4/U5-ingest live gezet — HARMONIE 48
  leads in twee dagdeel-chunks (`-l1-24`/`-l25-48`), historierun `hist5`, nieuwe bundle;
  gevoelstemp ≠ temp. UV `uv_clear` (U15) volgt vannacht.
- **Gemerged (elk onafhankelijk hergroen: typecheck, unit, build, volledige e2e)**:
  U14 mobiel (kaart ≥ 60 % eerste scherm + sticky scrubber, tabel onder de fold,
  liggend naast elkaar, lege nav-band weg, contain-fit met overlay-insets, safe areas);
  U12 wind-zoom (particles in wereldcoördinaten, aanvullers zonder stagger, overtal fadet
  uit, buffer geblit bij resize: min-zichtbaarheid bij zoom 0,23 → 0,63–0,92, herstel 2–7 s
  → 0,3–0,5 s); U13 vectorisolijnen (bicubische B-spline-tracer in worker, Newton +
  kromming-adaptieve verdichting, capsulesegmenten op device-resolutie, stippel over
  booglengte, lusjes < 60 km faden op ringlengte, gradiënt-fade default uit — PO: het
  gradiëntcriterium wiste te veel; tracer ~7 ms, rust 0 passes).
- **U15 UV** (uv_clear uit KNMI-NetCDF, WHO-bar met/zonder wolken, variant A): eerste
  merge TERUGGEDRAAID na mijn e2e op de gemergde tree — uv_clear laadde alle 65
  kwartierframes en drukte de 512-framecache leeg (tweede locatieklik viel terug naar
  skeleton). Fix 1 in; fix 2 (uv_clear-fetch pas na pointLoadStage ≠ initial, tegen een
  deterministisch warm-lek van 1678 B via de Chromium-cache-race) in e2e.
- **Host**: vier parallelle workers met Chromium → load 30+. Alle `pnpm e2e*`-scripts
  draaien nu onder `flock /tmp/motregen-e2e.lock`; agents wachten op load < 16 en draaien
  max één Chromium. LES: de Playwright-webserver herbouwt `web/dist` met de basemap-URL
  naar de e2e-dataserver — de integratie-preview serveert daarom nu `web/dist-preview`
  (gitignored, na elke merge gekopieerd), anders CORS-fouten in de browser van de PO.
- **U15 gemerged** (na twee fixrondes): fix 1 alleen uurframes van tabelrijen laden; fix 2
  uv_clear-payload als één Range ná de initial-fase (warm reload weer 0 B, Chromium-cache-
  race). Onafhankelijk hergroen op main+U12+U13+U14: 204+ unit, e2e 20/20, cargo groen.
  Variant A (dubbele vulling) default, B via `?uvbalk=stip`; `uv_clear` in prod na vannacht.
- **Middag**: U16 (lijnlabels faden mee met hun ring; oneven graden halve breedte i.p.v.
  stippel), U17 (subtielere zoekbalk, About als modal met backdrop/×, favoriet verwijderen
  met rode prullenbak + bevestiging, versheidspil groot/leeftijd eronder, manifestpoll 15 s
  rond de verwachte radarpublicatie; versheidsketen gemeten: KNMI ~100–115 s, ingest
  mediaan 57 s, client gem. 30→4 s, "7 min" is normaal bedrijf; ingest-aanbeveling MQTT
  −45–50 s), U19 (isolijnfocus alleen nog via tabelkolom Gevoel; wind ⅔ met windfocus op
  kolom Wind) gemerged, elk onafhankelijk hergroen. U18 DCT-veld (K=64, ingest+client,
  groen) GEPARKEERD: kost bytes zolang de tabel de bitmap laadt, puntfout tot 3,2 °C in
  kuststeden, kustlijnen ~10 km verschoven; branch op origin. Vervolg U18b gestart:
  DCT+gekwantiseerd residu / lossless predictief / wavelet, meten dan bouwen, één veld
  voor kaart én tabel. Backlog: zstd pledged content-size (decode 7,6→1,0 ms/frame).
- **U18b gemerged** (vervangt U18): `feels_like_c` als verliesvrije predictieve mrf-frames
  (header `pred`, eigen range-coder, voorspeller (2a+2b−c+d)/4, 28 contexten) — byte-identiek
  aan de bitmap voor kaart én tabel, live 828 → 521 kB per volledige sessie (−308 kB),
  passief −156 kB; decode sneller dan de bitmap (2,1 ms desktop / 8,7 ms mobiel) mede door
  pledged content-size op de pred-members. DCT-veld van U18 teruggedraaid. Meting: DCT+residu
  verloor; bijna-verliesvrij (39–45 %) mogelijk als de PO ≤ 0,3 °C fout accepteert. Andere
  uurvelden zouden met dezelfde codec ~60 % worden (niet gebouwd). LET OP deploy: een open
  tabblad met een oude bundle kan `feels_like_c` na de datawissel niet decoderen tot herladen
  — client vóór of met de ingest deployen (auto-upgrade doet beide tegelijk).
- **U20 windregressies gemerged** (PO: zoom-fade, heftiger, artefacten boven land). Bisect
  met stills over pre-U12 / U12 / U19: (1) het oude zoomgat bestond al vóór U12; wat na U12
  als "fade/puls" leest is het synchrone aanvullerscohort van U12; (2) "heftiger": U19's
  ⅔-default kwam nooit aan omdat tuning v2 (sinds U3b) de hele set wegschreef zodra één
  knop afweek → opgeslagen intensiteit 1,9 bleef, windfocus maakte er 2,85 van; (3)
  artefacten: aanvullers van één zoomstap verschenen in hetzelfde frame op leegste-cel-
  punten (rooster van stompjes). Fixes: levensschaal 0,8–1,2 op afstand én maxAge met fase;
  aanvullers volle celjitter, gespreid over 0,15 s; tuning v3 (alleen afwijkingen) met
  eenmalige v2-migratie; setTuning herverdeelt alleen bij dichtheidswijziging (focus-tween
  deed dat elk frame). `?dev` → "Reset alle instellingen" (favorieten/locatie/thema blijven).
  e2e 29/29 op de gemergde tree.
- Open MET PO: LICENSE; isolijnen boven plaatsnamen ok?; mobiel cold-TTFR-budget 4 s;
  versheidspil oogt zwaar op mobiel (70 px); UV-ghost op bewolkte uren gezien?
  VOOR AGENTS: SessionStart-hook wijst naar /home/mathijs (nix-config-pad);
  stadstemperatuurlabels weg na runtime-themawissel (bestaand).

## 2026-09-23 — PO-dag: dertien tracks gemerged (U1–U11, U3b, U8b), alles claude-opus

- **Werkwijze**: uitsluitend claude/opus-agents via herdr-worktrees (PO-verzoek),
  elke merge onafhankelijk hergroen (typecheck, unit, build, volledige e2e op
  eigen poorten `MOTREGEN_E2E_PORT`/`_DATA_PORT` sinds U1) en daarna de
  integratie-instantie op http://ageq-mthq:4300/ (tailnet, `/data` → prod)
  herbouwd. jj-metadata na de host-herstart opnieuw geïnitialiseerd vanaf git
  (verloren tree-object); agentnamen verdwenen daarbij, sindsdien per pane-id.
- **Gemerged**: U1 laadprofiel (`pnpm e2e:profile`; histogram vol 37→4 s desktop,
  41→9 s 4G; oorzaak vaste 30 s-timer vóór L2 + al gedecodeerde frames telden niet
  + dubbele/losse ranges; L1 = zichtbaar bereik, zstd-workerpool, één Range per
  chunk → warm 0 B op alle profielen). U2 NL-kaartlabels + locatiegeheugen +
  favoriet centreert niet. U3→U3b wind: buffer-trails met afstandsleven,
  head-fade, AA, leegste-cel-respawn (clusters 2,6× minder), snelheidsdemping;
  zee/land-inkt 0,5–0,9 (was 1,1–2,2); knoppen v2 + JSON-export. U4 HARMONIE
  +48 u + historierun (dagdeel-chunks), urenoverzicht met historie/nu-rij/UV
  (schatting vooruit)/zon op-onder, kaartklok → U10 versheidspil (radar-leeftijd,
  status, detailpaneel, verversknop; echte overlapbug op mobiel gevangen door
  mijn volledige e2e — agent had alleen eigen spec gedraaid). U5 MIP-10
  gevoelstemperatuur (JAG/TI ≤10, Steadman ≥15, band), switch weg; live
  gevoel−temp mediaan −2,6 °C (was 0,00). U6 kaart contain i.p.v. cover
  (`transformConstrain`), contain-as gepind. U7 ontwerp: histogram, hoek, splash-
  druppel, About, labeldichtheid (Zeeland), README. U8→U8b isolijnen: GPU-snede
  door (x,y,t)-volume, 1 °C stippel/streep, temporele B-spline, ≤20 Hz, nul werk
  in rust (gemeten: 0 passes/0 worker-rondes), labels als persistente ankers,
  stadslabels in place (`fadeDuration: 0`). U9 histogram-polish (screenshot-loop).
  U11 Lucide-iconen, About via het merk linksonder, pnpm-hash + `nix flake check`
  groen.
- **Prod**: draait nog de oude ingest (24 leads, oude gevoelstemp) tot de auto-
  upgrade ~03:19; eerste manifest met nieuwe waarden = HARMONIE-run 00Z/01Z.
  Check morgen: harmonie-chunks 48 frames + `-l25-48` + `hist`-chunks, en
  gevoel ≠ temp.
- **Lessen**: agent-"groen" op alleen de eigen spec is geen receipt (U10);
  host-load > 40 laat mobiele TTFR-budgetten flaken (rerun op rustige host);
  `jj new` na een push laat een lege commit achter die de volgende push blokkeert
  (abandon eerst); herdr-namen overleven een herstart niet.
- **Open MET PO**: LICENSE (About/README beloven open source); mobiel cold-TTFR-
  budget 4 s is krap na U11 (+5,8 kB gzip); smaak op zicht: zon op/onder-vorm,
  historie ingeklapt, isolijnkleur/stippel, wind-fades/buffer-rest, spawn-jitter;
  odometer-stadslabels (kost t3j-dodge tenzij eigen collision); ~60 px lege band
  onder de kaart op mobiel (U7); MIP-9 regenkans (draft, optie A aanbevolen).
- **U8c (avond, na PO-Firefox-profielen)**: fans op de MacBook kwamen NIET van de
  isolijnen (~3 % van één core) maar van de windlaag (continue kaartrepaint 95–112 Hz),
  regen-heruploads per frame en `fadeDuration: 0` (volledige symboolplaatsing per
  render). Fix: wind, regen én isolijnen op eigen canvassen (kaart in rust 0 repaints),
  regen-upload alleen bij framewissel, isolijnpass ½-res in CSS-px, render alleen in
  het fps-venster. PO-heropname: CanvasRenderer 76 % → 11 %, Renderer 87 % → 42 %.
  Stilstandbug gevonden: gevoelstemp-tijdlijn begint bij het eerste HARMONIE-frame,
  regenhistorie 3 u eerder → blend klemde op frame 0 (groeit na elke refresh); nu
  faden isolijnen/labels buiten de uurframes, plus invalidatie per uurlaag bij een
  nieuwe run met gelijke lengte. Extra: vervagen op |∇T| (default 0,02–0,06 °C/km,
  gekalibreerd op prod; snelheidsmodus ter vergelijking), perf-HUD met kaart-
  repaints/s, regen/wind-frames/s, isolijn-passes/s + ms/pass. Merged, 191 tests,
  e2e 20/20. Voor PO: isolijnen liggen nu bóven plaatsnamen (ok?); derde Firefox-
  opname gevraagd (met en zonder focus).
- **Open VOOR AGENTS**: bestaande bug — stadstemperatuurlabels verdwijnen na
  runtime-themawissel (U8b, ook op main vóór U8b); mobiele themaknop nog
  cyclus vs segmented in sidebar (U9); Freshness-verversknop → Lucide
  `RefreshCw` (U11-vervolg); T2h-historische observaties/MQTT/day-night v2.

## 2026-09-23 — PM-inventaris na 3 weken stilte: fleet opgeruimd, prod vers

- Inventaris: geen open PRs (#21–#25 alle MERGED 2026-08-31), alle zeven
  resterende track-worktrees volledig in main (0 unmerged commits, schoon).
  Zeven herdr-workspaces (t3g/t4/t2f/t5/t5b/t2g/t3h) gesloten en de
  worktrees verwijderd; alleen de orchestrator-pane blijft.
- Prod-receipt 12:28:40Z: manifest generated 12:27:49Z met rtcor-run 12:25
  = ~3,5 min achter KNMI-tijd, site 200 in 0,19 s. Versheidsdoel houdt.
- Open (ongewijzigd sinds 08-31) — MET PO: prospect-ronde A/B/C, skeleton-vs-
  wait, lijn-vs-staaf, mobiele-GPU-check. VOOR AGENTS (wacht op PO-keuze):
  T2h-historische observaties, MQTT, day/night v2, open-source-pass,
  CI-closure-push (MIP-6 §5).

## 2026-08-31 (nacht) — t3k + T2h live: playbackbug weg, versheid ~100 s

- **t3k gemerged + gedeployed** (`e65027d4`): sol loste de vier App.tsx-
  conflicten op (t3j-temp-dodge behouden, lifecycle-harde `startFrameLoop`
  wint van de oude globale rAF-lus, +3u-horizonpill erbij). Onafhankelijk
  hergroen: typecheck 0, 91/91 tests, build 0, e2e 3/3 (desktop warm 0 B,
  mobiel 5430 B binnen budget). Upgrade-journal bevestigt exact
  `motregen/e65027d4`; live bundle bevat `[3,8,24]`+"Tijdsbereik". De
  N×-playbacksnelheid-bug is daarmee van productie af.
- **T2h gemerged + gedeployed** (`88b521c6`, draft-PR #25): incrementele
  manifestpublicatie per bron (rtcor/nowcast/uv direct, seamless zodra
  klaar), seamless via eigen 2-thread-pools van het kritieke pad, mediaan
  op 2 cores 266 s → 32,6 s (8,16×; hoofdvondst: `mrf::quantize` herbouwde
  de 256-entry-tabel ~81 M×/run → `LazyLock`; byte-identiek getest).
  Onafhankelijk: cargo-workspace groen + `nix flake check -L` (VM-test)
  op de gemergde tree — verplicht want Cargo.lock wijzigde (PR-#17-les).
  Merge conflictvrij (ingest⊥web).
- **Live versheidsreceipt**: 21:15:56Z → manifest generated 21:14:15Z met
  rtcor-frame 21:10 erin = ~100 s publicatievertraging (was ~14 min).
  Tweede datapoint na volgende radarcyclus gelogd in sessie.
- Ops: SSH:22 naar de VPS opnieuw intermitterend gefilterd (meerdere
  timeouts, retries raak); HTTPS via CF onverstoord. Ingest-rebuild op de
  VPS duurde 7,4 min (Rust op 2 vCPU) — CI-closure-push blijft geparkeerd
  in MIP-6 §5.
- Open: PO-keuzes (prospect ronde A/B/C, skeleton-vs-wait, line-vs-bar,
  mobiele GPU-check); backlog T2h-historical-observations, MQTT, day/night
  v2, open-source-pass. T2h-worktree opgeruimd; t3g-pane blijft staan voor
  PO-iteratie.

## 2026-08-31 (laat) — grote avondronde: t3g→t3l gemerged, prospect, T2h

- MERGED (elk onafhankelijk geverifieerd, e2e in de gates): t3g (PO-ronde:
  favorieten/splash/horizon + warm-refetch-fix na mijn e2e-vangst), t3h
  (progressief laden L0/L1/L2 — passief ≤632 kB — + now-naad via geleende
  annexen; skeleton default, ?histogram=wait alternatief), t3h2 (per-frame
  streaming; head-of-line + straggler weg; locatiewissel instant), t3i
  (Android-trail-ghosts: fade-vloer max(0,v·d−1/255)), t3l
  (manifest-autorefresh 60s+visibility met ETag-304; tijdlijn verlengt
  naadloos; versheid KNMI→scherm nominaal ≤~7 min beheerst). t2g/t5b/t5c
  eerder vandaag. In flight: t3j (temp-labels dodgen plaatsnamen), t3k
  (+3u-horizon + gelekte-rAF-playback-fix).
- PROD: NixOS stable 26.05 live (upgrade staged→reboot; "reboot window"
  werkte zoals ontworpen), progressief laden live. LESSEN: GitHub-tarball-
  cache loopt minuten achter op push (wachten vóór upgrade-trigger);
  kernel-upgrades wachten op reboot-venster; CF herschreef browser-TTL
  manifest naar 4u → zone browser_cache_ttl=0 (respect headers) gezet;
  CF-botbescherming blokkeert non-browser-UA's (urllib 403).
- PROSPECT (PO-verzoek, na correctie: sol-agents i.p.v. Claude-subagents —
  in memory opgeslagen): 5 rapporten + synthese in
  .dev/research/prospect-2026-08/. Kern: buienradar groot maar kwetsbaar
  (ads/pay-or-ok/churn), KNMI=autoriteit zonder interface, WarnWetter=
  waarschuwingsketen, yr/Windy=onze middenpositie bevestigd. Steel-lijst
  gerangschikt; fasering A (provenance/antwoordregel/tik) → B
  (waarschuwingen/kansen) → C (push/widgets). PO nog geen ronde gekozen.
- T5c-scorebord: radar 2,1–7,4× sneller, ~10× minder requests; bytes-
  achterstand gedicht door t2g+t3h.
- NIEUW GEVONDEN (PO-versheidsvraag → diagnose): VPS-seamless-mediaan kost
  707 s op 2 vCPU en de seriële cyclus publiceert pas aan het eind →
  manifest liep ~14 min achter op gedecodeerde radar. Track T2h gestart
  (incrementele publicatie per bron, seamless van kritiek pad, mediaan
  versnellen met 2-core-meting). MQTT blijft optionele versnelling daarna.
- Open met PO: prospect-ronde kiezen (A/B/C), skeleton-vs-wait-smaaktest,
  lijn-vs-staaf-keuze, mobiele-GPU-check op echte telefoon.

## 2026-08-31 (avond) — dieet live op prod; scorebord; morgen: progressief laden

- T2g merged (sessie 20,1→6,9 MB; dictionary +2,8% en delta +41% = gemeten
  regressies, afgewezen; MIP-2-intra-only empirisch gevalideerd). T5b merged
  (mobiele profielen: pre-dieet 47 s op 4G / 142 s op 3G). T5c merged:
  scorebord vs buienradar.nl — radar 2,1–7,4× sneller, ~10× minder requests,
  bytes hun enige winst (pre-dieet-snapshot).
- T4-vangst: pnpm-fixed-output-hash was stale na T2g → nachtelijke upgrade
  zou stranden; fix geverifieerd+merged; upgrade handmatig getriggerd.
  LES: tracks die pnpm-lock/Cargo.lock raken krijgen voortaan nix flake
  check in de merge-verificatie. Prod nu: nieuwe closure, dieet-manifest
  publiek, werkset 8,60 MB (was 21,9), nul failed units. SSH naar de VPS
  vanaf ageq-mthq intermitterend geblokkeerd (poort 22; 443 fijn) — retries
  werken; observeren.
- CF-observatie: bot-bescherming blokkeert non-browser-UA's (urllib 403;
  curl/browsers ok) — regel versoepelen ALS data-endpoint ooit open data
  voor derden moet zijn. Geparkeerd.
- t3g (PO-sessie): conflicten met T5-instrumentatie opgelost, 73 tests, maar
  mijn onafhankelijke e2e ving een intermitterende warm-chunk-budget-
  overschrijding op desktop → terug naar sol (regressie fixen of budget
  herkalibreren met onderbouwing; 3× green vereist). Merge wacht daarop.
  PO meldde: t3g bevat ook al optimalisatiewerk; morgen MIP-8-spec daarop
  bijsnijden. Backend-vervolg nodig: historische observaties voor de
  uitgebreide tabel-history (T2h, spec na t3g-merge).
- MIP-8 §7: bouwontwerp progressief laden (L0≤1,5 MB / L1 skeleton / L2
  intentie; passief-budget ≤3 MB) — PO: morgen tackelen.

## 2026-08-31 — 🌧 MOTREGEN.NL IS LIVE (T4/T2f/T5 merged; Cloudflare-cutover)

- T5 (sol, 58m): perf-module + HUD (?perf=1/triple-tap), Playwright-suite
  `pnpm e2e` (on-demand per MIP-7 §5), smoke-script, baselines in
  docs/perf.md. Verified (58 tests + e2e green) en merged. BEVINDING: echte
  sessie = 20,1 MB (synth 1,31 MB); uitsplitsing gemeten: regen 12,2 MB over
  4 bronnen, uurvelden 11,3 MB waarvan cloud_frac 2,5 + rel_humidity 2,4 —
  data-dieet (subsampling tabelvelden, dictionary, lazy fields) geparkeerd
  als kandidaat-MIP; Cloudflare-technisch geen probleem (cacheable, gedeeld).
- T2f (sol, ~60m): 300m-windbaseline met online s/θ-kalibratie; gates green,
  quiver-bewijs in track-LOG; merged; lokale daemon herstart.
- T4 (sol, 24m + PO-gedreven installatie): volledige NixOS-config VM-bewezen
  (nix flake check onafhankelijk gere-rund, exit 0) én — met expliciete
  PO-autorisatie in de pane — nixos-anywhere-installatie op de OVH-VPS
  (57.129.47.17 / 2001:41d0:701:1100::d923, legacy-kexec-vlag nodig op
  Ubuntu 26.04). Secrets via .env-overdracht geplaatst. Merged naar main —
  auto-upgrade (dagelijks 03:19) maakt main = productie.
- Livegang uitgevoerd (orchestrator, via API's): Porkbun parkeer-ALIAS+
  wildcard weg (NB: A-create naast bestaand ALIAS rapporteert SUCCESS maar
  wordt opgeslokt — eerst ALIAS deleten), A/AAAA → VPS; Caddy pakte LE-cert;
  volledige regenketen live geverifieerd (5 bronnen, Range 206). Cloudflare:
  zone eceaddc…, proxied A/AAAA, SSL Full (strict), cache-rule /data/*,
  NS-cutover bij Porkbun → bayan/venus.ns.cloudflare.com; activatie-watcher
  loopt. Backfill-piek op VPS: load ~1,0, 591 MB RAM — ruim binnen 4 GB.
- Metingen: temp-vs-gevoel vandaag exact 0,00 °C verschil over 401.875
  cellen (alle temps 11,4–19,5 °C = dode zone) — switcher werkt, seizoen
  slaapt; UX-verfijning (dempen bij gelijkheid) op de polish-lijst.
- Open: PO's t3g-sessie (zijn merge-call), 20 MB-data-dieet-MIP (geparkeerd),
  smoke-script als systemd-timer op de VPS (na CF-activatie), open-source-
  pass (backlog), day/night v2 (geparkeerd).

## 2026-08-31 — 3 dagen unattended; PO-iteratiesessie; OVH-deployplan

- Seamless ging op 28-08 avond live: volledige regenketen rtcor(5m) →
  nowcast(+2u,5m) → seamless(+6u,5m) → harmonie(uurlijks). Daarmee was de
  hele PO-wensenlijst van dag 1 gemerged (11 tracks, MIP-1…5 accepted).
- Stabiliteitsdatapoint: daemon draaide 2d12u onbeheerd door op ageq-mthq;
  manifest vandaag vers (08:54Z), piek-RSS 324 MB (VmHWM — seamless-mediaan
  streamt per lead), caddy 32 MB, chunks-werkset 300 MB. Sterk bewijs voor
  de 4 GB-VPS-sizing.
- PO-iteratiesessie geopend: track/t3g-po-iteratie (sol, eigen dev-server op
  :4175) — PO stuurt deze pane ZELF interactief; orchestrator monitort niet
  mee en merget na afloop met de gebruikelijke verificatie. 4173 blijft de
  stabiele main-preview.
- Deployplan PO: OVH VPS (2 vCPU/4 GB/40 GB NVMe/500 Mbps onbeperkt,
  ~€45/jr), NixOS, alles unattended, Cloudflare ervoor (vervroegt het
  CDN-moment uit MIP-3 §5 — prima, het cachecontract lag er al). Locaties:
  Limburg(DE)/Gravelines(FR); advies Limburg (dichtst bij NL). RAM-verdict:
  ruim voldoende (zie datapoint). T4-spec + MIP-6 (unattended
  NixOS-inrichting, secrets, auto-updates) zodra de box er is.

## 2026-08-28 (avond) — T3e/T2d/T3f verified+merged; flow-tween LIVE; T2e in flight

- T3e (sol, 26m, 52 tests): kaartframe+maxBounds, dichtstbijzijnde stad,
  histogram-redesign (y-as/banden/hover, lijn-vs-staaf-toggle; sols advies:
  lijn), verleden=observaties, vibe-uurtabel, wind light-mode+zoom-fixes.
- Incident tussendoor: daemon exit 1 "immutable chunk collision" na de
  T2c-gridwijziging (namen dragen grid niet) → data/chunks+manifest geruimd,
  herstart; PO zag daardoor kort 404/lege velden. Structurele fix via T2d.
- Day/night-tinting op PO-verzoek uitgezet (flag, MIP-4 ronde 7).
- T2d (sol, 31m, 15 suites): 32px-blok motion (pySTEPS-medianen 0,27–0,79
  cel/min, bar 1,0), mrf motion-annexen (~0,5–0,7 kB/frame), CLI dump, en
  generatie-suffix in chunknamen (collision/cache-fix). Merged; daemon
  herbouwd+herstart, live annexen geverifieerd.
- T3f (sol, 14m, 55 tests): RG8-motion-textures + masker, tweezijdige
  semi-Lagrangiaanse warp (15-cel-cap), crossfade-fallback, synthgen-motion.
  Merge had één docs/mrf.md-conflict (T2d↔T3f) — unie-resolutie, gesquasht
  in de merge-commit (NB: jj weigert conflicted ancestors te pushen; los
  conflicts op vóór jj new, of squash terug). LIVE op 4173 met echte annexen.
- In flight: T2e (seamless, sol). Web-rij leeg. Openstaand voor PO:
  lijn-vs-staaf-keuze, mobiele-GPU-check wind/warp.

## 2026-08-28 — MIP-5 accepted; T2d/T3f specs queued; track-pijplijn

- MIP-5 accepted met alle aanbevelingen (annex-in-chunk, AROME met cap,
  pySTEPS-LK als executable spec). Contract additief uitgebreid:
  motion-annex per frame + motion_grid in de header (i8-paren, 0,1 cel/min,
  −128 no-data); crossfade blijft fallback.
- Specs geschreven: T2d (motion-schatter + mrf-annex, sol) en T3f
  (warp-shader + synthgen-motion, sol). Pijplijn om conflicts te vermijden:
  crates-rij T2c(terra, loopt) → T2d; web-rij T3d(sol, loopt, incl.
  wind-trails-steer) → T3e (nitpicks) → T3f.
- In flight: T3d, T2c, live-daemon (9 velden zodra T2c landt).
- PO ook: seamless blend (+2…+6 u) in scope → contract-source "seamless" +
  regime-prioriteit bijgewerkt; T2e-spec queued na T2d. Crates-rij is nu
  T2c → T2d → T2e; web-rij T3d → T3e → T3f.

## Backlog (PO-blessed, geen track)

- Open-source-pass (PO 2026-08-28: "nice om te open sourcen later"): LICENSE
  aan de root (workspace zegt al MIT), README per crate, en knmi-grib /
  knmi-hdf5 / mrf als losse crates naar crates.io — incl. verwijzing naar de
  spec/-referentieharnas als conformance-bewijs. Repo is al public.

## 2026-08-28 — PO live-review ronde 2 → T2b + T3c launched

- PO on real data: light basemap duidelijk beter dan dark (dark toont
  EEZ-/maritieme grenzen — weg ermee — en mist terrain-tinten); wil
  Windy-stijl wind-particles, subtieler: onder de regen op ~60% opacity,
  lagere dichtheid, snelheid ∝ wind, subtiele bft-kleurcodering. Vastgelegd
  als MIP-4-amendement.
- Contract additief uitgebreid: veldenlijst (temp_c, feels_like_c,
  wind_u_ms/wind_v_ms als paar met identiek grid/tijden, uv) + quant-regel
  versoepeld (alleen 255=null universeel; quant[0]==0 alleen
  rain/radiation) zodat signed velden passen. Rain/radiation-chunks blijven
  byte-identiek geldig; mrf-validators aan beide kanten moeten de
  versoepeling volgen (in beide specs opgenomen).
- Specs geschreven en gelanceerd: T2b (sol; AROME temp/wind/straling +
  cloud-modified-UV-ingest, feels-like serverside, per-veld quant-tabellen,
  paar-invariant-test) en T3c (sol; dark-parity, wind-particle-layer onder
  regen, temp-labels + switcher, synthgen-uitbreiding; MOTREGEN_SYNTH=1
  workflow tot T2b merged).

## 2026-08-28 — REAL RAIN LIVE: T2 verified+merged; end-to-end wired

- Map-vanished bug (PO report): vite's public-dir middleware caches the file
  list at boot; the T3b-merge config change restarted vite at 15:40:43 and my
  synthgen wrote at 15:41 → /data/* fell through to SPA-fallback HTML.
  Server restart fixed it. Lesson: after regenerating public/ data, restart
  vite dev.
- T2 landed (sol, 1h03m): live RTCOR+nowcast+ranged-AROME ingest (352.9 MB
  i.p.v. 867.4 MB per run), shared 650×700 EPSG:3857 grid, atomic
  manifest/chunks + pruning, HDF5 fixtures + h5py/pyproj cross-checks
  (455k cellen binnen één quant-stap), Caddyfile.dev per MIP-3. Independently
  re-verified: workspace gates green (13 suites), mrf inspect op echte chunk,
  manifest = rtcor 36f + nowcast 25f + harmonie 24f. MERGED.
- Wiring (orchestrator): release binary gebouwd; daemon draait live op main
  (data/); caddy :8080; vite dev proxyt /data → :8080 (MOTREGEN_SYNTH=1 =
  synthetische fallback); 4173 toont echte regen. Committed+pushed.
- Running processes on ageq-mthq: motregen-ingest (daemon), caddy :8080,
  vite dev :4173 — all background tasks of this session.
- Next: PO visual round on real data; MIP-4 fields track (temp/feels-like/
  UV/cloud symbols) as T2b; icon-license check; deploy (T4) when PO wants.

## 2026-08-28 — MIP-3+4 accepted; T2 (echte ingest) launched

- MIP-3 accepted: bare Hetzner/OVH first, Cloudflare deferred until real
  traffic; header contract implemented from day one so CDN is later drop-in.
- MIP-4 accepted with PO modifications: NO field cycler — map shows rain +
  temperature numbers simultaneously (+ sun/cloud icons on trial, test
  overwhelm empirically); temp↔feels-like switcher, default feels-like; no
  isolines. UV: official KNMI open datasets found (`cloud-modified-uv-index`
  Benelux/15-min + daily `uv-index`) → proxy plan dropped. Symbols: KNMI app
  is in the government OSS register — check icon-asset license; else
  Meteocons (MIT)/own, iterate on PO visual feedback.
- Wrote `.dev/specs/track-t2-ingest.md` (sol): real rain end-to-end — shared
  grid + index maps, knmi-hdf5 crate (RTCOR + nowcast, Python cross-checks),
  AROME ranged-tar partial download strategy (avoid 868 MB/h), daemon with
  atomic manifest, caddy dev-serving on 8080 per MIP-3 contract, knmi-grib
  fixture self-skip. Rain only; extra MIP-4 fields = follow-up track.
- In flight: T3b (sol, UX + click-fix), T2 (sol, launching).

## 2026-08-28 — T2a merged (luna!); HAR-bug diagnosed → T3b steer; dev topology

- T2a delivered (14m41s) — but the pane footer read `gpt-5.6-luna low`, NOT
  terra: the herdr queued-prompt model-switch artifact struck again (likely my
  contract soft-steer). Verified extra hard: full gates re-run green
  (7 property tests), quant formula matches spec exactly, AND a
  cross-implementation check: Rust CLI decodes sol's TS synthgen chunk, frame 0
  = exactly width×height bytes. zstd level 19 chosen on measurement. Merged
  with Cargo workspace union (glob members, resolver 3); positive luna-low
  datapoint for tight-spec Rust work. LESSON (mine): first merge-gate receipt
  was false-green via `cargo test | grep` without pipefail — always
  `set -o pipefail` or echo the exit INSIDE the inner shell.
- knmi-grib conformance test hard-fails without data/ fixture (1.2 GB in T1
  worktree; copied to main checkout). Follow-up for T2: fixture strategy
  (self-skip with loud message, or small committed fixture).
- PO HAR analysis (tmp/click_har.log, gitignored): one location click
  re-fetches the whole timeline per frame (83×206 per click). Cause: LRU 32 <
  85 timeline frames + meter samples all frames per click → thrash. T3b
  steered: cache holds full timeline, zero-network second click + test, chunk
  coalescing (>50% of frames → one request), build.sourcemap true.
- Dev topology per PO wish (poke testing): 4173 now runs `pnpm dev` (HMR,
  sourcemaps) from the main checkout, /data served by vite with Range 206
  verified. Real split (data as separate origin + proxy) lands with T2 per
  MIP-3; recorded as T2 spec requirement.

## 2026-08-28 — MIP-4 draft; T1 profiling follow-up merged

- PO refined the sun idea: it's "moet ik me insmeren" (zonkracht/UV, low
  spatial specificity fine), asked about KNMI sun-icon semantics (answered:
  deterministic cloud+precip summary, not a probability), added temp +
  feels-like as map layers, and set the constraint "veel info, niet
  overweldigend" → wrote MIP-4 (informatielagen): one map field at a time
  (rain default + cycler), detail lives in the hourly table, relevance-gated
  chips (insmeer-chip only at UV≥3), extra fields via the contract `field`
  mechanism at reduced resolution, UV as proxy from radiation+solar elevation
  until an official zonkracht source is found. Three open questions for PO.
- T1 profiling follow-up (PO-driven, sol, 4m57s): −0.76% instructions via
  selector short-circuit, peak heap ~4 MB, churn dominated by ecCodes message
  scan; custom GRIB1 scanner sensibly declined (10× under latency bar).
  Gates independently re-run green; follow-up commits merged to main.

## 2026-08-28 — PO visual review → T3 merged; contract field-amendment; T3b

- PO reviewed the preview and gave UX round 1: histogram must BE the scrubber;
  search box missing; layout pass; hourly forecast table incl. sun activity;
  light mode default with a light/system/dark cycler; basemap less
  traffic-focused (no roads). Direction approved implicitly → merged T3
  (PR #1) to main.
- Sun in the hourly table needs a second data field → additive contract
  amendment: optional `field` key (default `rain_rate`), new `radiation`
  (W/m²); MIP-2 §5 rain-rate-only besluit amended (changelog). Backwards
  compatible so terra's in-flight T2a stays valid; terra gets a soft steer to
  optionally include the key in serde types.
- Wrote `.dev/specs/track-t3b-ux-round1.md` (sol): the seven PO changes incl.
  PDOK Locatieserver for search (free, no key, NL-authoritative).
- PO sent T1's pane a perf follow-up himself (Python-vs-Rust delta; why not
  faster) — watcher armed on that pane; any new commits on the merged t1
  branch will need a follow-up merge.
- T2 spec (ingest daemon) queued on T2a landing; will include radiation
  extraction from AROME + download/cadence strategy for the hourly 868 MB tars.

## 2026-08-28 — T3 done+verified (awaiting PO eyes); T1 done+verified+MERGED

- T3 (sol, 8m09s): full shell on synthetic data, PR #1. Independently re-ran
  all gates green (synthgen/typecheck/4 tests/build, exit 0 observed
  synchronously); read mrf.ts — contract-conform incl. Range+progressive and
  non-206 fallback. Preview for PO at http://ageq-mthq:4173 (vite allowedHosts
  fix committed on the track branch; note: `fuser` does not exist on this box —
  kill listeners via `ss -tlnp` pid instead). Merge waits on PO visual check.
  Polish note: ~1 MB bundle (MapLibre) → code-split later.
- T1 (sol, 13m24s): GRIB gate PASSED — knmi-grib crate (eccodes FFI) exactly
  matches cfgrib over all 152,100 values; +1…+24 h decode+de-accumulate median
  0.19 s (bar 2 s). Independently re-ran fmt/clippy/test green incl. the
  elementwise conformance test. PR #2; MERGED to main (clean; devenv.nix grew
  bindgen/libclang env). Key discoveries for T2: AROME publishes an ~868 MB
  run-tar EVERY HOUR (not 4×/day); param = GRIB1 table 253/param 61
  accumulated → hourly de-accumulation; 390×390 lat-lon grid. MIP-1 changelog
  amended accordingly.
- Next: T2 spec (ingest daemon: rtcor+nowcast HDF5, AROME cadence/download
  strategy, reproject to shared grid, mrf encode + manifest) once T2a (terra,
  still working) lands and merges; T3 merge after PO look.

## 2026-08-28 — codex re-auth incident; MIP-3; T2a launched

- Incident: a codex re-auth wiped `~/.codex/config.toml` defaults → workers
  started asking approval per command prefix. Restored defaults
  (approval_policy never, danger-full-access, sol/high) + trusted the herdr
  worktrees dir; Mathijs additionally set both sessions to yolo and restarted
  them himself with continue-prompts. Both T1/T3 confirmed working again.
  Lesson: after any codex re-auth, CHECK config.toml before launching workers.
- PO asked: map track? codec track (server+client)? and ultra-cheap hosting
  (Hetzner/Cloudflare; in-memory serving?). Answers: map is already in T3;
  client mrf decode is in T3; server-side mrf encoder now split off as T2a
  (terra, tight spec — format fully pinned); video-codec epsilon stays gated
  on real frames per MIP-2. Hosting → wrote MIP-3 draft (origin box + Caddy
  static + Cloudflare free, HTTP cache contract; no custom in-memory server —
  page cache does that already). Awaiting PO on MIP-3's three questions.
- Wrote `.dev/specs/track-t2a-mrf-core.md` (quant table v0 pinned: geometric
  0.01→150 mm/h over indices 1..254; zstd level measured 3 vs 19; golden
  fixtures; mrf CLI). Known merge point: workspace root Cargo.toml created by
  both T1 and T2a — orchestrator resolves at merge.
- In flight: T1 (sol), T3 (sol), T2a (terra).

## 2026-08-28 — MIP-1 accepted; contract pinned; T1+T3 launched

- PO sanctioned the stack: Rust ingest ("geen super positieve ervaring met
  Python"), and asked for (a) an immediate sol spike on AROME GRIB parsing with
  the Python library as executable conformance spec — "snel en conform" — and
  (b) an immediate frontend scaffold. On shadcn he said "ook ok" (permissive);
  PM call: staying with MIP-1's SolidJS + Tailwind v4 without shadcn.
- MIP-1 flipped to accepted (§5 records the sanction).
- Pinned `docs/contract.md` (manifest v0 + mrf v0: magic/len/JSON-header with
  frame-offset-index + quant table, independent zstd members, Range +
  progressive decode) so T1/T2 and T3 build against the same wire format
  without coordination.
- Seeded devenv at repo root (rust, node/pnpm, eccodes, hdf5, pkg-config, uv,
  zstd) so parallel tracks don't invent competing envs. Note: transient DNS
  failures on github.com via MagicDNS broke two devenv builds; also, devenv
  can exit 0 while the underlying nix fetch failed — check for devenv.lock as
  the real receipt.
- Wrote `.dev/specs/track-t1-arome-spike.md` (sol; GRIB gate + Python
  reference harness + speed bar ≤2 s) and `.dev/specs/track-t3-frontend-shell.md`
  (sol; shell on synthetic data per contract).
- KNMI license question from PO: all used datasets are CC-BY 4.0 → any use
  incl. commercial is fine with attribution; "Bron: KNMI" requirement added to
  the T3 spec. Use-case field on key registration is informational only.
- Open with Mathijs: drop KNMI keys in `.env` (T1 falls back to the saturated
  anonymous key otherwise). Open for agents: T1 + T3 in flight.

## 2026-08-28 — MIP-2 accepted

- PO adopted MIP-2 with calls: intra-only (YAGNI), quantization floor stays at
  0.01 mm/h (display threshold is a frontend concern), rain rate only. He asked
  for frame-range requests and ideally progressive decode → format amended at
  adoption: fixed-size header with a frame-offset-index (byte offset + length
  per compressed frame), frames as independent zstd members ⇒ HTTP Range on
  arbitrary frame ranges + decode-as-bytes-arrive; reserved per-chunk
  dictionary field for later cross-frame wins (empty in v1).
- PO also noted RainViewer runs on maplibre-gl and looks fine — supports the
  MIP-1 map choice.
- Open with Mathijs: MIP-1 §4 stack sanction (Rust + SolidJS/Tailwind) and the
  two KNMI keys (Open Data API + Notification Service). Open for agents:
  T-specs start the moment MIP-1 lands.

## 2026-08-28 — PO-ronde 1 op MIP-1

- PO answered MIP-1: 3 h history, +24 h midcast (not 48), dev on ageq-mthq +
  dedicated box later, domain already via Porkbun, droplet logo, everything in
  Dutch. Asked for a serious Rust-vs-Python weighing and frontend
  framework/styling proposals (React vs SolidJS vs frameworkless; shadcn vs own).
- Revised MIP-1 (now in Dutch): recommendation flipped to Rust ingest
  (hdf5-metno + eccodes FFI; T1 must decode one AROME GRIB end-to-end as the
  ontbindende voorwaarde; Python stays as uv-based throwaway explorer and T2
  cross-validator). Frontend: SolidJS + Tailwind v4, no shadcn; core
  (decoder/WebGL/time model) framework-free TS so the shell stays swappable.
  Decisions recorded in §5; sole remaining open question = stack sanction.
- MIP-2 and proposals README translated to Dutch; AGENTS.md updated.
- KNMI portal check: Open Data API and Notification Service are separate key
  requests; EDR/WMS not needed. PO registers both keys.
- Open with Mathijs: stack sanction (MIP-1 §4), MIP-2 adoption + its three open
  questions, the two KNMI keys. Open for agents: still nothing until adoption.

## 2026-08-28 — kickoff: research + founding proposals

- PM/PO kickoff (Mathijs = PO, fable = PM/orchestrator, codex sol/terra = workers).
- Verified KNMI data coverage for the unified slider: `nl_rdr_data_rtcor_5m` 1.0
  (history, archive since 2018-12), `radar_forecast` 2.0 (pySTEPS, 25×5 min),
  `harmonie_arome_cy43_p1` 1.0 (hourly to +60 h). Found the seamless 6 h ensemble
  blend product (post-MVP candidate). API: list + presigned URL per file; MQTT
  notification service preferred over polling.
- Anonymous API key is rate-limit-saturated (every probe today 429'd, incl. after
  60 s backoff) → registered key required. PO action.
- Repo scaffolded: jj colocated, `.claude/CLAUDE.md` → `AGENTS.md`, MIP process
  (lightweight composix-CIP variant, flat `.dev/proposals/` per Mathijs).
- Wrote MIP-1 (MVP architecture: Python/uv ingest → shared-grid 8-bit frames +
  manifest → static serving → Vite/TS/MapLibre/WebGL frontend; tracks T0–T5) and
  MIP-2 (mrf binary format, intra+zstd; video-codec idea preserved as measured
  epsilon track). Both Status: draft — awaiting PO.
- Open with Mathijs: adopt/answer MIP-1 + MIP-2 open questions; KNMI key;
  motregen.nl domain. Open for agents: nothing until MIPs land.
