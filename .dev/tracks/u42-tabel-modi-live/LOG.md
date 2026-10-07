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
