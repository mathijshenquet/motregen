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
