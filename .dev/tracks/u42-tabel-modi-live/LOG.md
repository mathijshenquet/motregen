# Track U42 — tabelkoppen en modi live

## 2026-10-07 08:04 UTC

- Preview gebouwd met `pnpm synthgen && pnpm build` en blijvend gestart op
  `http://ageq-mthq:4320/` met productiedata van `https://motregen.nl/data`.
- Specificatie, MIP-14-amendement, U34-livewerkwijze en de betrokken tabel-, modus-,
  scrubber-, analytics- en stijlcoderegels gelezen. Werkboom was schoon; devenv is actief.
- Eerste live-iteratie op verzoek van de PO: stap 1 (Weer vast als standaardpin en alleen
  regenweergave) plus stap 3 (RV-kop en -cellen uit beeld, dataketen behouden).
- Volgende stap: gerichte implementatie, daarna synchroon `pnpm typecheck` en `pnpm build`;
  geen e2e of stills tijdens de live-iteratie.

## 2026-10-07 08:08 UTC

- Stap 1 + 3 geïmplementeerd: `FocusMode` begint met een vaste `weather`-pin, een klik op
  de actieve pin verandert niets, en wisselen houdt altijd precies één pin over. Weer toont
  regen zonder wolkenlagen of windlaag; de bestaande wolkensluier/-grafiek is voorbereid als
  `air` voor stap 2.
- RV-kop en -cellen zijn uit `ForecastTable`; `humidityTimeline`, `humiditySeries`, reconciliatie,
  laadpaden en de doorgifte aan de tabel zijn bewust behouden voor U38.
- MIP-13-contract uitgebreid met `pinAir`: clientschema en servercontract naar versie 2,
  documentatie en testspecificaties bijgewerkt.
- Synchrone receipts in `web`: `pnpm typecheck` exit 0; `pnpm build` exit 0 (Vite 92 modules,
  bundel `index-Caz0Vj7D.js`). `git diff --check` gaf geen meldingen. Preview na een korte
  sessieherstart opnieuw gestart op poort 4320 en serveert aantoonbaar die nieuwe bundel.
- Volgende stap: PO laat `http://ageq-mthq:4320/` hard herladen en beoordeelt stap 1 + 3;
  pas na goedkeuring committen, daarna stap 2.

## 2026-10-07 08:09 UTC

- Hostcorrectie van de PO: de werkomgeving draait inmiddels op `ageq-dev2`. `hostname`
  bevestigt dit en de preview antwoordt nog op poort 4320; actuele meekijk-URL is
  `http://ageq-dev2:4320/`.

## 2026-10-07 08:25 UTC

- Orkestrator meldde de canonieke hostfix op main. Mijn identieke lokale noodfix in alleen
  `AGENTS.md` en `web/vite.config.ts` teruggenomen en `git merge --no-edit main` uitgevoerd;
  dit fast-forwardde de track naar `001b297` zonder de U42-werkboomwijzigingen te raken.
- Op de bijgewerkte basis `pnpm build` synchroon exit 0 (Vite 92 modules, bundel
  `index-Caz0Vj7D.js`), preview schoon herstart op poort 4320.
- Controle: zowel een lokaal verzoek met `Host: ageq-dev2` als
  `http://ageq-dev2:4320/` zelf antwoorden HTTP 200.

## 2026-10-07 08:33 UTC

- PO corrigeerde de eerste review-eenheid: bestaande achtergrondwind blijft in Weer; stap 1,
  2 en 3 moeten samen reviewklaar zijn. Daarna aanvullend verduidelijkt dat de drie wolkenlagen
  ook in Weer rustig onder het regenhistogram blijven, precies zoals vóór U42; Lucht brengt
  dezelfde lagen naar volle nadruk, toont laagwaarden en voegt de kaartsluier toe.
- Beide steers via Herdr aan de PM gemeld. PM heeft spec en MIP-14 tweemaal aangescherpt;
  main-commits `f6de7e6` en `133ba00` zijn beide fast-forward ingelopen.
- Correctie/step 2 gebouwd: ambient wind hersteld; UV-kolom vervangen door hover-/klikbare
  Lucht-modus; overdag relatieve UV-balk + met vulling gecodeerd bewolkingswolkje, 's nachts
  bestaande maan; RV blijft uit beeld. `pinAir` wordt gemeten bij vastzetten.
- Synchrone receipts: `pnpm typecheck` exit 0; `pnpm build` exit 0 (Vite 92 modules,
  `index-Brja8qPJ.js`, `index-BOyOhafB.css`); `git diff --check` zonder meldingen.
- Gerichte Chromium-smoke op 390×844 tegen `http://ageq-dev2:4320/` exit 0: geen tabeloverflow;
  Weer gepind, wind- en regenoverlay zichtbaar, wolkenlagen op 0,5 + regenbalken; Lucht gepind,
  lagen op 1,0 + regenbalken + wolkensluier; tweede klik op Lucht laat de pin staan.
- Eerste review-eenheid (stap 1+2+3) is nu werkelijk gereed voor PO-feedback; nog niet gecommit.

## 2026-10-07 08:53 UTC

- `main` tot `3306bed` fast-forward ingelopen, inclusief U44 (`551204a`). U42 daarna uit de
  tijdelijke stash teruggezet; de twee contractconflicten combineren U44 `share` en U42
  `pinAir` in dezelfde nog niet uitgerolde schema-v2. U44-URL-modi mappen nu `weer` naar de
  vaste `weather`-pin en `lucht` naar `air`; fixtures dekken beide nieuwe velden.
- PO-steers verwerkt en telkens met de PM afgestemd: vaste/even brede moduskolommen; subtiele
  tekstkop `Uur`; geen dubbel wolkje of bewolkingsgetal in de Lucht-dagcel; Wind houdt de
  regenkaart op halve dekking; in Lucht liggen regenbalken achter de wolkenlagen op 0,35 en
  hebben ze geen cursorlabel.
- Stappen 5–7 gebouwd: NASA-SVS-maantextuur (64/128 px, bron/licentie in `docs/moon.md` en
  About) onder onze terminator; mobiele tabel-preview met kop + circa 1,2 rij en een schaduw,
  open/dicht-view-switch met sticky handle en gepauzeerde kaart; zon-op/-onderrijen zonder
  aangrenzende dividers.
- Synchrone receipts na deze eenheid: volledige `pnpm test` 49 bestanden / 340 tests groen;
  `pnpm typecheck` exit 0; `pnpm build` exit 0 met U44-PWA-output. Chromium-smoke op 360 en
  430 px: nul horizontale overflow, exacte uitlijning tussen modusheaders en rijcellen,
  preview toont de huidige rij, openen verbergt/pauzeert de kaart. De smoke vond nog dat de
  sluitknop door event bubbling meteen heropende; fix staat lokaal en krijgt in de volgende
  ontvangst een herbouw + hercontrole.

## 2026-10-07 08:55 UTC

- Laatste PO-feedback afgerond: Lucht-dagcel toont alleen de relatieve UV-balk; `Uur` staat
  weer subtiel links zonder icoon/knop. Lucht tekent regen achter de wolkenlagen op 0,35 en
  zonder regenlabel; PM bevestigde deze semantiek. De aangrenzende uurdivider vóór zon op/onder
  is eveneens verwijderd.
- Synchrone eindontvangst voor de live preview: `pnpm typecheck` exit 0; volledige `pnpm test`
  49 bestanden / 340 tests groen; `pnpm build` exit 0 (bundels `index-C6Nr_c1E.js` en
  `index-Btro0Efo.css`, PWA gegenereerd).
- Verse Chromium-smoke op 390 px exit 0: `Uur` zichtbaar, geen wolkglyph, nul horizontale
  overflow, Lucht-regenopacity 0,35, regen staat vóór in de DOM dus visueel achter de later
  getekende wolken, geen regen-cursorlabel. View-switch opent met kaart `display:none` en
  `data-rendering=false`; sluiten herstelt de kaart en `data-rendering=true`.
- De hele U42-implementatie staat nu voor PO-review op `http://ageq-dev2:4320/`. Nog niet
  gecommit en nog geen gerichte desktop-e2e/stills: volgens de live-werkwijze volgen die pas
  op het expliciete “klaar” van de PO.

## 2026-10-07 08:56 UTC

- Op PM-instructie de groene live-staat vastgezet als tussencommit `0643c59`; daarna `main`
  (`5f4714f`, inclusief de canonieke U42/MIP-14-livebesluiten en U43-profielmodus) zonder
  conflicten gemerged als `35276f4`.
- Na de merge opnieuw synchroon ontvangen: `pnpm typecheck` exit 0 en `pnpm build` exit 0
  (98 modules, `index-DZkOhHXy.js`, `index-DbWDjY9g.css`, PWA + profielrecorderchunk).
  Verse Chromium-smoke op 390 px: Lucht-URL-preset actief, regen 0,35 achter wolken,
  geen overflow, tabel openen pauzeert de kaart en sluiten hervat haar.
- Volgende stap: deze logaanvulling committen en branch pushen. Geen e2e en geen merge tot
  het expliciete “klaar” van de PO.

## 2026-10-07 08:57 UTC

- Branch gepusht naar `origin/track/u42-tabel-modi-live`; draft-PR geopend:
  https://github.com/mathijshenquet/motregen/pull/73. De beschrijving markeert de gerichte
  desktop-e2e en definitieve stills eerlijk als wachtend op het PO-signaal “klaar”.

## 2026-10-07 09:09 UTC

- Nieuwe PO-steer verwerkt: de oorspronkelijke klok + `Uur`-kop is op mobiel en desktop
  hersteld. De mobiele harde view-switch is vervangen door één native verticale pagina met
  `scroll-snap-type: y proximity`: tik op preview/handgreep scrollt vloeiend naar het tabelpaneel;
  omhoogscrollen of de sticky handgreep brengt de kaart terug. De modusknoppen scrollen bij tik
  niet mee en de tabelkop blijft onder de handgreep sticky.
- De mobiele maatvoering gebruikt `dvh`; alleen preview en tabel hebben `touch-action: pan-y`,
  zodat de horizontale scrubber zijn eigen gebaar houdt. Kaartpauze volgt de echte paneelpositie
  met hysterese (open bij top <= 0, hervatten boven 24 px). Daarmee stoppen frame-lus en wind;
  ook contour- en labelworkers worden gepauzeerd/beëindigd en bij hervatten schoon herstart.
- Synchrone receipts: `pnpm typecheck` exit 0; volledige `pnpm test` 51 bestanden / 346 tests
  groen; `pnpm build` exit 0 (98 modules, `index-AsYr_iLz.js`, `index-BTpO0pAU.css`, PWA).
  Preview op `http://ageq-dev2:4320/` antwoordt HTTP 200. Geen e2e uitgevoerd vóór het
  afgesproken expliciete PO-signaal “klaar”.

## 2026-10-07 09:13 UTC

- PO zag dat klok + `Uur` optisch links in het labelvak stond. De tijden blijven links op hun
  bestaande lijn; alleen het koplabel is nu, net als de vier moduslabels, binnen zijn eigen
  kolom gecentreerd.

## 2026-10-07 09:22 UTC

- Verdere mobiele PO-review verwerkt. In portrait-mobiel is de eerste sticky tabelkop nu een
  echte `Kaart`-knop (desktop/landscape houdt klok + `Uur`), zodat een aparte statische
  screenshotsstrook niet nodig is. `Afgelopen 6 uur` staat voortaan ná de huidige rij en springt
  daardoor niet meer boven `Nu` in zodra de scrolltween eindigt; de previewrand heeft een
  duidelijker schaduw/verloop.
- Maancel vergroot van 18 naar 26 px, de 128px-NASA-textuur wordt rechtstreeks gebruikt en
  contrast, aardschijn, gloed en rand zijn verfijnd. Naast de fractie staat nu de dichtstbijzijnde
  maanopkomst (`op hh:mm`), lokaal berekend met een lage-precisie maanpositie. Unitfixture tegen
  USNO Seattle 2026-07-07 wijkt minder dan vijf minuten af.
- Firefox-homescreenherstel: locatiezoeker sluit en vervaagt nu bij `pagehide` en na `pageshow`,
  en het invoerveld heeft `autocomplete=off`; zo wordt een oude open zoekstaat niet als eerste
  scherm hersteld.
- Synchrone receipts: `pnpm typecheck` exit 0; volledige `pnpm test` 51 bestanden / 349 tests
  groen; `pnpm build` exit 0 (99 modules, `index-SX4Fvb8T.js`, `index-Dnt_mOAx.css`). Preview
  `http://ageq-dev2:4320/` antwoordt HTTP 200. Nog steeds geen e2e vóór PO-signaal “klaar”.
- Na het opruimen van de uitgestelde `pageshow`-callback nogmaals `pnpm build` synchroon exit 0;
  definitieve JS-bundel voor deze staat is `index-CW_uLU3J.js`.

## 2026-10-07 09:31 UTC

- Mobiele eerste tabelkop is nu een echte, visueel afwijkende view-wissel: boven de kaart staat
  `Tabel` met tabelicoon en accentpil; na de scrolltween wordt dat `Kaart` met kaarticoon en een
  neutralere pil. Beide richtingen sturen dezelfde native scroll/snap-overgang; desktop en
  mobiel-landscape houden klok + `Uur`. Unit- en gerichte e2e-verwachtingen zijn mee aangepast.
- PO meldde dat de kale preview-URL op zijn telefoon de perf-HUD opende. Oorzaak was de door U43
  blijvend opgeslagen `motregen-perf`-vlag. `?perf` blijft expliciet werken en een koude start
  neemt de vlag één herlaadbeurt mee, maar een kale URL wist voortaan oude profielstaat. Documentatie
  en perf-tests volgen dit nieuwe PO-contract.
- Synchrone receipts: `pnpm typecheck` exit 0; volledige `pnpm test` 51 bestanden / 349 tests
  groen; `pnpm build` exit 0 (100 modules, `index-CM2YAs9w.js`, `index-DxiPmx6k.css`). Preview
  `http://ageq-dev2:4320/` antwoordt HTTP 200. Geen e2e uitgevoerd vóór PO-signaal “klaar”.

## 2026-10-07 09:33 UTC

- Screenshot van PO verklaarde twee zaken: de los hangende schaduw was de uitwendige
  `forecast-panel`-schaduw en Firefox draaide nog de vorige serviceworker-bundel (`Kaart` in de
  kaartstand plus oude perf-persistentie). De uitwendige schaduw is verwijderd; het interne
  previewverloop blijft als begrensde nudge staan.
- PWA-registratie is nu alleen actief op `motregen.nl`/`www.motregen.nl`. Op dev/preview ruimt de
  actuele app bestaande serviceworkers en caches op, zodat live reviews niet achter een app-shell
  blijven hangen. De productie-updateprompt staat voortaan boven de perf-HUD.
- Eerste typecheck wees terecht op de lokale `location`-signal die `window.location` overschaduwde;
  na expliciet `window.location.hostname`: `pnpm typecheck` exit 0 en `pnpm build` exit 0
  (100 modules, `index-DUwaPu0w.js`, `index-DdT8jbfZ.css`), preview HTTP 200.

## 2026-10-07 09:36 UTC

- Mobiele `Tabel`/`Kaart`-wissel gebruikt nu in beide eindstanden dezelfde accentkleur. Beide
  labels en iconen staan in dezelfde knop en crossfaden/verschuiven op basis van de werkelijke
  pagina-scrollvoortgang; de zichtbare toestand verandert dus gedurende de tween in plaats van
  pas bij de open-drempel. De aria-actie blijft met de bestaande pauzehysterese wisselen.
- Synchrone receipts: `pnpm typecheck` exit 0; gerichte ForecastTable-test 16/16 groen; volledige
  `pnpm test` 51 bestanden / 349 tests groen; `pnpm build` exit 0 (100 modules,
  `index-BV6VLjcd.js`, `index-DTUvfvBt.css`, PWA). Preview `http://ageq-dev2:4320/` antwoordt
  HTTP 200. Geen e2e uitgevoerd vóór PO-signaal “klaar”.

## 2026-10-07 09:38 UTC

- Firefox-mobiel liet bij het terugkomen van de adresbalk de volledige kaart/tabelgeometrie per
  animatieframe reflowen: de portrait-layout gebruikte dynamische `dvh`-maten en verwerkte ieder
  `window`- én `visualViewport`-resize-event direct. De mobiele kaart, zoeklijst en tabel gebruiken
  nu de stabiele kleine viewport (`svh`); resize-metingen worden samengevoegd en pas 120 ms na het
  laatste event uitgevoerd. Scrollupdates voor de kaart/tabelknop blijven wel per frame lopen.
- Synchrone receipts: `pnpm typecheck` exit 0; volledige `pnpm test` 51 bestanden / 349 tests groen;
  `pnpm build` exit 0 (100 modules, `index-1Ptx711O.js`, `index-BVR2SLtD.css`, PWA). Preview
  `http://ageq-dev2:4320/` antwoordt HTTP 200. Geen e2e uitgevoerd vóór PO-signaal “klaar”.

## 2026-10-07 09:40 UTC

- Nieuwe telefoonscreenshot maakte de resterende zwevende schaduw lokaliseerbaar: niet het paneel
  zelf, maar de absoluut gepositioneerde mobiele `forecast-panel::after`-previewlaag liep op vaste
  hoogte door de eerste tabelrij. De laag (verloop én schaduw) is volledig verwijderd; echte
  tabelranden en de handgreep blijven intact.
- Synchrone receipts: `pnpm typecheck` exit 0; volledige `pnpm test` 51 bestanden / 349 tests groen;
  `pnpm build` exit 0 (100 modules, `index-8LDUgNQq.js`, `index-4tM_1Y73.css`, PWA). Preview
  `http://ageq-dev2:4320/` antwoordt HTTP 200. Geen e2e uitgevoerd vóór PO-signaal “klaar”.

## 2026-10-07 09:46 UTC

- Mobiele eerste kop is nu een gewone vijfde modusknop: altijd `Tabel`, met dezelfde vorm,
  hover/focus en actieve tint als Weer/Lucht/Gevoel/Wind. In de geopende tabel is alleen Tabel
  `aria-pressed`; de onderliggende kaartpin blijft bewaard. Een tik op een van de vier kaartmodi
  pint die modus en scrolt terug naar de kaart. De eerdere Kaart-labelwissel, afwijkende knopstijl
  en scrollgebonden labeltween zijn verwijderd, wat ook scrollwerk scheelt.
- Component- en gerichte e2e-verwachtingen volgen de nieuwe bediening. Synchrone receipts:
  `pnpm typecheck` exit 0; gerichte ForecastTable-test 16/16 groen; volledige `pnpm test`
  51 bestanden / 349 tests groen; `pnpm build` exit 0 (100 modules, `index-BUennRHE.js`,
  `index-yfRRTRYH.css`, PWA). Preview `http://ageq-dev2:4320/` antwoordt HTTP 200. Geen e2e
  uitgevoerd vóór PO-signaal “klaar”.

## 2026-10-07 10:07 UTC

- `main` op commit `8f75d16` gemerged op verzoek van de orkestrator. De nieuwe gecachte
  locale-formatters zijn in ForecastTable en HistogramScrubber behouden. Conflicten zijn bewust
  gecombineerd: U42’s Lucht/tabelstructuur, kaartpauze en mobiele modus blijven staan; mains
  Telegram/still-rendering, watermasker en `?perf=start` zijn meegenomen. De About-fixture bevat
  nu zowel Maan als Telegram. De kale preview-URL blijft oude perfstaat wissen.
- Synchrone receipts op de gemergde staat: `pnpm typecheck` exit 0; volledige `pnpm test`
  57 bestanden / 373 tests groen; `pnpm build` exit 0 (105 modules, `index-BQZBP1NC.js`,
  `index-BQt5enWL.css`, PWA + watermaskerworker). Preview `http://ageq-dev2:4320/` antwoordt
  HTTP 200. Geen e2e uitgevoerd vóór PO-signaal “klaar”.

## 2026-10-07 10:08 UTC

- Nieuwere `main` op `d016f56` met U49 gemerged. U49’s view-window, AbortController en
  scrubberSeries-decodevraag zijn behouden naast U42’s vier modi. De forecast-paneelref wordt nu
  door één callback aan zowel de mobiele scroll/hysterese als U49’s rij-zichtbaarheidsmeting
  gegeven; daarmee blijven tabelmodus en het in-view decodebudget samen werken.
- Synchrone receipts: `pnpm typecheck` exit 0; volledige `pnpm test` 59 bestanden / 384 tests groen;
  `pnpm build` exit 0 (107 modules, `index-BBrCYjy9.js`, `index-BQt5enWL.css`, PWA + workers).
  Preview `http://ageq-dev2:4320/` antwoordt HTTP 200. Geen e2e uitgevoerd vóór PO-signaal “klaar”.

## 2026-10-07 10:50 UTC

- Gekozen mobiele view en werkelijke kaartpauze zijn gescheiden: tik op Tabel zet de modusknop nu
  direct actief; tik op Weer/Lucht/Gevoel/Wind zet hem direct uit. De bestaande paneelpositie en
  hysterese blijven exclusief de dure kaartlussen pauzeren/hervatten. Een tijdelijke view-target
  overbrugt de native smooth scroll zonder dat de knop aan het eind nog terugflitst.
- Portrait Tabel vraagt bij de tik de zes historische uren direct aan, toont geen awkward
  `Afgelopen … uur`-rij meer en scrolt na DOM-invoeging naar de op zijn plek verankerde Nu-rij.
  De historie ligt erboven, zodat handmatig omhoogscrollen er eerst doorheen gaat vóór de
  kaartgrens. Liggend touch behoudt de bestaande expliciete history-toggle.
- In de UV-balk is het verschil tussen heldere-hemel-UV en actuele UV nu gedempt grijs; de actuele
  waarde houdt zijn WHO-kleur. Synchrone receipts: `pnpm typecheck` exit 0; gerichte tests 28/28;
  volledige `pnpm test` 59 bestanden / 384 tests groen; `pnpm build` exit 0 (107 modules,
  `index-BCR8RPbI.js`, `index-DI_Qw9gi.css`, PWA + workers). Preview
  `http://ageq-dev2:4320/` antwoordt HTTP 200. Geen e2e uitgevoerd vóór PO-signaal “klaar”.

## 2026-10-07 11:08 UTC

- De eerdere invoeging van mobiele historieverleden bij het openen is vervangen door één blijvende
  tabel. In portrait mobile zijn de zes verleden rijen vanaf de eerste render gemount en wordt hun
  data na de initial-fase geladen. De eigen tabelscroller staat in kaartweergave vergrendeld en op de
  Nu-rij; tabelweergave ontgrendelt exact dezelfde `scrollTop`. Terugkeer naar de kaart vergrendelt de
  scroller opnieuw en zet hem terug op Nu. Daardoor wijzigt de rijset niet tijdens handmatig scrollen
  en kan de anker-rij niet meer springen.
- Het forecast-paneel is exact `100svh` en flex; de interne scroller vult de ruimte onder de handle.
  De sticky kop hoort nu bij die scroller (`top: 0`), terwijl scroll-chaining vanaf het begin van de
  historie de bestaande paginascroll terug naar de kaart kan activeren.
- Synchrone receipts: `git diff --check` exit 0; `pnpm typecheck` exit 0; gerichte ForecastTable-test
  16/16 groen; volledige `pnpm test` 59 bestanden / 384 tests groen; `pnpm build` exit 0 (107 modules,
  `index-DcoDKbba.js`, `index-yBp8WuKo.css`, PWA + workers). Preview
  `http://ageq-dev2:4320/` serveert beide nieuwe assets en antwoordt HTTP 200. Geen e2e uitgevoerd vóór
  PO-signaal “klaar”.

## 2026-10-07 11:13 UTC

- Acceptatie van kaart/tabel en de scrollbaarheid van de tabel zijn van elkaar losgetrokken. De
  bestaande positiedrempels accepteren nog steeds de view en sturen de kaartpauze, maar tijdens een
  actieve touch blijft de huidige `overflow` ongewijzigd. Een gewenste lock of unlock wordt bewaard
  en pas op `touchend`/`touchcancel` toegepast; hiermee verandert het scrollende element nooit onder
  een neergelegde vinger.
- Na acceptatie van de kaartview en loslaten wordt de tabel eerst vergrendeld en daarna met native
  smooth element-scroll teruggezet op de Nu-rij (direct bij reduced motion). De veilige bovenruimte
  van de handle volgt dezelfde afgeronde scrollstatus, zodat ook die geen layoutwissel tijdens de
  gesture veroorzaakt. De omgekeerde route geeft de tabel pas na acceptatie en loslaten vrij.
- Synchrone receipts: `git diff --check` exit 0; `pnpm typecheck` exit 0; gerichte ForecastTable-test
  16/16 groen; volledige `pnpm test` 59 bestanden / 384 tests groen; `pnpm build` exit 0 (107 modules,
  `index-B6zFC3Sq.js`, `index-DGcLPeT7.css`, PWA + workers). De preview op
  `http://ageq-dev2:4320/` serveert de nieuwe assets. Geen e2e uitgevoerd vóór PO-signaal “klaar”.
