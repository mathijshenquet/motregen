# U22 — bovenrand vast, klok kaal, merk rechtsboven, zoekpil smal, scrubber stiller

## 2026-09-25 09:05 — start
- Worker: Claude Opus 5.5 (herdr-pane), worktree `track-u22-bovenrand-en-shell`, branch
  `track/u22-bovenrand-en-shell` op main 037b531 (spec).
- Gelezen: spec U22, spec+LOG U21, Freshness/About/LocationSearch/HistogramScrubber, App-overlay,
  styles (klok/zoek/merk/ctrl/media queries), e2e freshness/location/map-zoom.
- Plan, in volgorde: (1) klok als vaste tab aan de bovenrand (varianten weg, regimewoorden
  observatie/voorspelling/trend ook in time-model, amber versheidsknop, bronkleur links+rechts);
  (2) merk → ronde druppelknop rechtsboven, thema als sectie "Weergave" in de modal "motregen.nl";
  (3) NavigationControl + ctrl-CSS weg, map-zoom.spec zonder knoppen; (4) zoekpil icoon+naam,
  inhoudsbreed, ster naar het open paneel; (5) scrubber zonder bandlabels en zonder "Vandaag".
- Structuurkeuze klok: een knop in een knop mag niet (HTML), dus de klok wordt een container met
  twee zusterknoppen: de hele tab (transparante overlay-knop, aria-label met kaarttijd/regime) en
  de amber versheidsknop erbovenop (eigen aria-label). Beide openen hetzelfde paneel.

## 09:45 — spec-aanvulling U22 (PO 2026-09-25, later op de dag; via queue) — vult de spec aan
(a) Zoekpaneel: sectiekop "Opgeslagen" weg; favorieten staan er gewoon met hun ster.
(b) Nowcast en model worden visueel niet meer onderscheiden: twee regimes, **observatie** (rtcor) en
**voorspelling** (nowcast + HARMONIE). Eén kleur `--forecast` voor beide in scrubberbalk en klokrand,
regimewoord "voorspelling" voor beide, time-model-zones voegen nowcast en model samen. Bron-informatie
(nowcast vs HARMONIE, runs) blijft in het versheidspaneel en in About.
- Gevolg voor spec-punt 1: "trend" vervalt als regimewoord; de klok-breedte hoeft alleen nog
  "voorspelling" te passen (was al de maat).

## 10:05 — implementatie + keuzes
Vóór-metingen (`probe.mjs`, `shots/voor/`, build van main op 4361/8361): klok zwevend 150×50 op top 12
(desktop) / tweede rij top 64 (Pixel 5, 320), zoekpil 240×32 / 240×44, zoomknoppen rechtsboven (desktop),
themaknop rechtsboven (mobiel), merk linksonder 163×39, insetTop 66 (desktop) / 116 (1000 px) / 118 (tel.).

1. **Klok** — varianten `?klok=stip`/`accent` en `?zoekpaneel=omsluit`/`variant` met CSS en tests weg.
   Tab aan de bovenrand: top 0 (+ safe-area als binnenpadding), geen bovenrand/-afronding, afgeronde
   onderhoeken, zijranden 3 px in `--history`/`--forecast`, schaduw alleen naar onder/opzij.
   Inhoud: kaarttijd 20 px (dagafkorting ervoor, klein en gedempt, alleen als kaartdag ≠ vandaag), eronder
   regimewoord in tekstkleur + amber knop (10 px, aanraakdoel 44 px via ::after). "radar 14:35 · 3 min"
   is weg; die zit in de aria-label van de knop ("Dataversheid: actueel, radar 14:55, 3 min oud") en
   in het paneel. Statuswoord = de bestaande STATUS_LABELS (actueel/loopt achter/verouderd/offline) i.p.v.
   "vers" uit het spec-voorbeeld, zodat knop en paneel hetzelfde woord gebruiken.
   Structuur: knop-in-knop mag niet → de klok is een container met een transparante knop over de hele tab
   ("Kaart 15:28, voorspelling. Actueel: … Details over dataversheid") en de amber knop erbovenop.
   Knopstatus: fresh = verzadigd amber, aging = amber + dunne ring met pulse (reduced-motion: geen
   pulse), stale/offline = `--stale`. Kleuren: `--amber` #c98000 (licht, 3,2:1 op wit) / #f5b43a (donker,
   9,4:1 op #0d1d25); rood 5,1:1 / 6,3:1 — alle ≥ 3:1. De stip in de paneelkop volgt nu hetzelfde teken
   (was groen; twee kleuren voor één betekenis).
   Vaste breedte, gemeten: "voorspelling" 73 px + knop → 112 px (≤ 360 px: 11 px woord, 100 px) — de tab
   verspringt niet bij scrubben. Insets: insetTop 53 overal (was 66/116/118): de Wadden krijgen op
   telefoons ~65 px meer kaart terug.
2. **Merk** — ronde druppelknop rechtsboven (38 px desktop op 18/18, 44 px touch op 12/12),
   `aria-label="Over motregen en instellingen"`, triple-tap → PerfHud ongewijzigd. Themaknop mobiel en
   sidebar-segmented weg; modal "motregen.nl" (druppel + woordmerk) met bovenaan sectie "Weergave"
   (Licht/Systeem/Donker, zelfde setTheme/opslag). Uitleg-dl gebruikt nu de regimewoorden
   (Observatie / Voorspelling = nowcast 2 u + HARMONIE-AROME / UV / Kaart). `.source` onveranderd.
   Sidebar-kop bevat alleen nog de UV-chip en wordt niet gerenderd zonder chip (geen lege band);
   bijvangst: de desktop-UV-chip wordt niet meer links afgekapt (U21-notitie), want `margin-right:auto`
   werkt weer zonder de actieknoppen. Mobiel: UV-chip linksonder op de kaart (plek van het oude merk).
3. **Zoomknoppen** — NavigationControl + `.maplibregl-ctrl*`-CSS weg. `map-zoom.spec` leest minZoom nu
   af aan de opgeslagen view na sleep/scroll (+ assert dat er geen zoomknop is).
4. **Zoekpil** — rust: icoon + plaatsnaam, 14 px (touch 16 px: iOS zoomt in bij focus op < 16 px, zelfde
   uitzondering als U21), breedte = naam: een verborgen kopie van de tekst in dezelfde grid-cel bepaalt
   de breedte, het veld (`size=1`) levert geen intrinsieke breedte. max-width min(200 px, halve kaart −
   halve klok − marges): de pil schuift nooit onder de klok, lange namen krijgen een ellips. Gemeten:
   "De Bilt" 93 px (desktop) / 103 px (Pixel 5) / 93 px (320 px, past net met krappere marges ≤ 360 px).
   Ster alleen nog in het open paneel naast het veld (links van ×). Open-vorm = variant A.
5. **Scrubber** — bandlabels + y-as-kolom weg (grafiek en regimebalk krijgen de 40 px terug), guides en
   kleuren blijven; aria houdt de classificatie. "Vandaag" weg (`dayLabel` → '', label niet gerenderd),
   aria zegt nog "vandaag 15:00, …". Bronchip in de toolbar krijgt een ellips (320 px: "Observat…").

Aanvulling (09:45) meegenomen: zones samengevoegd (`kind: 'observations' | 'forecast'`), `--nowcast` en
`--model` vervangen door `--forecast` (de oude nowcast-blauw), "Opgeslagen"-kop weg (favorieten met ster).
Versheidspaneel noemt Radar/Nowcast/Blend/HARMONIE/UV nog apart, About legt "Voorspelling" uit als
nowcast + HARMONIE.

Tussenreceipts: `pnpm typecheck` TYPECHECK-EXIT 0; `pnpm test` TEST-EXIT 0 (41 files, 236 tests);
`pnpm build` BUILD-EXIT 0; gerichte e2e (freshness/location/map-zoom) E2E-SUBSET-EXIT 0 (18 passed,
6 skipped) — **let op: die run startte bij load 23,8 (andere tracks), boven de afgesproken 16**; de
volledige e2e-gate wacht op load < 16.

## 10:20 — proefrun volledige gates (boom vóór 4ea1595) + fix
- Proefrun (start load 14,4; e2e-start 16,8): TYPECHECK-EXIT 0, TEST-EXIT 0, BUILD-EXIT 0, E2E-EXIT 1 —
  28 passed, 26 skipped, 3 failed: `perf.spec.ts` user journey (alle drie profielen) klikte `.brand`
  voor de PerfHud-triple-tap; die class viel weg met de druppelknop. Fix: selector `.map-brand`.
  Geen productfout (triple-tap zelf ongewijzigd, unit-test groen). Ook: focus keert na het paneel terug
  naar de knop waarmee het opende (4ea1595). Volledige gates opnieuw op de eindcommit.

## 10:45 — gates groen op de eindcommit, klaar
Receipts (synchroon, exit-status gelezen, boom 571f2c3 schoon; start load 14,6, e2e-start 14,3; poorten
4360/8360 vooraf vrij; één Chromium; hostlock via `pnpm e2e`):
- `pnpm typecheck` → TYPECHECK-EXIT: 0
- `pnpm test` → TEST-EXIT: 0 (41 files, 236 tests)
- `pnpm build` → BUILD-EXIT: 0
- `MOTREGEN_E2E_PORT=4360 MOTREGEN_E2E_DATA_PORT=8360 pnpm e2e` → E2E-EXIT: 0 (31 passed, 26 skipped)
Repro vanuit `web/` in de devenv-shell (servers/tsx-IPC buiten de claude-sandbox): exact bovenstaande commando's.

Screenshots `shots/voor/` (main) en `shots/na/` (eindstand, van 8e3dca3 — alleen de paneelstip-kleur en
focus-terugkeer kwamen daarna): desktop 1280, Pixel 5, 320 px × licht/donker × rust / zoek open /
observatie / versheidspaneel / modal. Maken: `probe.mjs` naar `web/tmp/`, synthgen-data op een eigen
caddy-poort + `vite preview`, `PROBE_BASE=… node tmp/probe.mjs <label>`.

Open voor PO (op zicht):
1. Amber knop: fresh verzadigd amber, aging amber + ring met pulse, stale/offline rood — spec-voorstel
   gevolgd; de paneelkop-stip volgt nu hetzelfde teken (was groen).
2. Aria/statuswoord "actueel" i.p.v. "vers" (consistent met het paneel).
3. Touch-zoektekst 16 px (iOS-focuszoom), desktop 14 px.
4. Voorspellingskleur = de oude nowcast-blauw; HARMONIE-paars is weg.
5. Mobiele UV-chip linksonder op de kaart (oude merkplek).
Buiten scope gezien: SunMoon-icoon bij "Systeem" oogt klein/vaag in het segmented (was al zo).

# U22b — klok kaal: tijd + kleine statusstip; regimemarkering weg

## 2026-09-25 10:45 — start (spec `.dev/specs/track-u22b-klok-kaal.md`, main db2e178)
- Worktree schoongezet: index bevatte main-bestanden van een half-gelukte checkout. Vooraf geverifieerd
  dat werkboom + ongetrackte bestanden byte-gelijk waren aan origin/main (alleen kopieën), toen
  `git checkout -f --no-track -B track/u22b-klok-kaal origin/main`. De bestaande branch
  `track/u22b-klok-kaal` stond op 314fe3e (voorouder van main, geen eigen commits) → veilig herzet.
  `/home/mthq/motregen/.git/config.lock` (leeg, r--r--r--) staat nog — niet van mij, niet aangeraakt;
  daarom `--no-track` en pushen zonder upstream-config.
- Plan: (1) klok = één knop: kaarttijd + kleine statusstip rechts op x-hoogte (+ dag klein erachter);
  vers = `--fresh` (rustig groen), aging = `--aging` amber, stale/offline = `--stale`; regimeregel en
  aparte amber knop weg. (2) regimekleuren weg: zijranden → gewone rand, scrubber-chip en `.regimes`-
  balk weg, `--history`/`--forecast`/`--amber` weg; `timelineZones` blijft voor aria en paneel.

## 10:55 — implementatie U22b + procesnoot
- Klok: één knop (`.freshness-trigger` = de tab zelf): kaarttijd 20 px, direct rechts een stip van 7 px
  (baseline − 3 px ≈ midden x-hoogte), dag klein erachter als kaartdag ≠ vandaag. Kleur: vers
  `--fresh` (rustig groen), achter `--aging` (amber), verouderd/offline `--stale`; zelfde stip in de
  paneelkop. Geen regimewoord, geen aparte knop, geen pulse. aria-label houdt kaarttijd, regime
  ("observatie"/"voorspelling", alleen voor de schermlezer), status en radarleeftijd in woorden.
  Tab: gewone 1 px rand (geen bovenrand), breedte 100 px (≤ 360 px: 92); insetTop 53 → 49.
- Regimemarkering weg: zijranden, `data-source`, scrubber-bronchip, `.regimes`-balk, tokens `--history`,
  `--forecast`, `--amber` en hun CSS. `timelineZones`/`sourceZone` blijven voor de aria-tekst.
- About (PO-aanvulling, spec 8a81d85): volgorde Weergave → druppel + "motregen.nl" → "Rechtstreeks van
  het KNMI" / "Gratis en zonder reclame" → één tabel: Observatie (incl. "NL en Vlaanderen"),
  Voorspelling, UV, Kaart, Zoeken, Privacy, Broncode (GitHub-link). Losse alinea's en repo-knop weg;
  × rechtsboven absoluut. Desktop: alle rijen op één regel behalve Privacy (PO-tekst letterlijk);
  telefoon (361 px modal): de meeste rijen lopen over twee regels — korter kan alleen met minder info.
- Branch 10:48 vooruitgespoeld naar origin/main 8a81d85 (spec-aanvulling + U25) vóór de eerste commit.
- Stills `shots-u22b/voor` (main db2e178) en `shots-u22b/na`: desktop + Pixel 5, licht/donker, rust /
  observatie / versheidspaneel / modal.
- Procesnoot orkestrator (10:55): load-drempel gerichte e2e nu < 22, begrenzer is het slot
  (`scripts/e2e-slot.sh`, max één Chromium per slot). Mijn e2e-run startte 10:48 bij load 19,2
  (onder de nieuwe drempel) en wacht op een vrij slot.

## 11:00 — U22b gates groen, klaar
Receipts (synchroon, boom 1ec194d schoon; start load 19,8; e2e-start 10:48 load 19,2, via
`scripts/e2e-slot.sh` — wachtte op een vrij slot, één Chromium; poorten 4360/8360 vooraf vrij):
- `pnpm typecheck` → TYPECHECK-EXIT: 0
- `pnpm test` → TEST-EXIT: 0 (43 files, 255 tests)
- `pnpm build` → BUILD-EXIT: 0
- `MOTREGEN_E2E_PORT=4360 MOTREGEN_E2E_DATA_PORT=8360 pnpm e2e e2e/freshness.spec.ts e2e/location.spec.ts
  e2e/perf.spec.ts` → E2E-EXIT: 0 (19 passed, 5 skipped)
Na 1ec194d alleen LOG en stills gecommit (geen code).
Open voor PO (op zicht): vers-stip groen (spec-optie; alternatief tekstkleur 40 %); About-rijen op de
telefoon over twee regels.

## 11:40 — aanvulling U22b: zoekpil terug op U17-maat (spec 07e2be9)
- Branch gerebased op origin/main 511c3d5 (U23 e.a. gemerged), zonder conflicten.
- U17 (b5f5d3e) had: 36 px hoog, 14 px, icoon links 11, surface 86 %, rand 70 %, schaduw 0 2px 10px.
  Nu in rust: 40 px hoog (touch 44), 15 px (touch 16 px, iOS-zoom), icoon 18 px (was 16),
  padding 39/16 (touch 40/16, ≤ 360 px 33/8), en de U17-oppervlakte terug (86 % / rand 70 % /
  schaduw 0 2px 10px, blur 8) i.p.v. de U21-ghost (70 % / 45 % / bijna geen schaduw). Pilvorm en
  smalle breedte blijven. Open paneel: icoon 18 px, veld 44 px zoals was.
- Gemeten "De Bilt": desktop 107×40, Pixel 5 111×44, 320 px 96×44 — overal heel, niet onder de klok.
- Stills `shots-u22b-zoek/voor` (vóór deze wijziging) en `/na`: desktop, Pixel 5, 320 px, licht/donker,
  rust + zoek open.
- `location.spec`: rust 15 px / 16 px, hoogte 38–40 (touch 44–46), icoon 18 px.
