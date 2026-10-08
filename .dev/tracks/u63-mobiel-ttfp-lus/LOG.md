# U63 mobiele laadtijd-lus — LOG (append-only)

## 2026-10-08 07:40 UTC — start; nulmeting vóór wijzigingen

Opdracht: MIP-23 Track A als lus uitvoeren; eerst po-android ×3 op loadavg <8 en Buienradar als referentie. Geen productwijziging gedaan. Tracklog wordt op expliciete instructie gecommit; ruwe profielen en scripts staan onder genegeerd tmp/.

Context gelezen: AGENTS.md, orchestrator-LOG (top), MIP-19/MIP-23, U54-spec/LOG, perf-documentatie, rig, planner/intent/decode-budget/perf. Devenv actief (IN_NIX_SHELL=impure), bash expliciet. Eigen rig-poorten 4393/8393; preview 4350 voor normale build. Kandidaten: vroeg manifest/Range, worker/WebGL warm, regenvenster eerst, laad-LoAF, warme assets via SW. Eerst huidige waterval en meetspreiding vastleggen.

Repro nulmeting vanuit web/: MOTREGEN_E2E_PORT=4393 MOTREGEN_E2E_DATA_PORT=8393 pnpm perf:mobile --profile po-android --scenario koud-spelend --repeat 3 --compare. Daarna referentie-buienradar met dezelfde opties zonder --compare. Receipts volgen.

## 2026-10-08 05:46 UTC — tijdcorrectie en eerste nulrun

De start-entry heeft per abuis 07:40 UTC als kop: werkelijke start was 05:44 UTC (07:44 lokale hosttijd). Vanaf hier zijn alle timestamps UTC. Eerste nulrun bij loadavg 6,62: ttfp 1681 ms, ttfr 1301 ms, ttfh 4632 ms, blank 174,5 slot-s / 2,74 volledig-leeg-equivalent-s, LoAF 12 s 3256 ms, 226 decodes, 4.824.523 voltooide bodybytes. Nog geen mediaan; host wacht na loadavg 9,4.

Bytebevinding oorzaak gevonden: één feels_like_c-Range startte op 29978 ms en eindigde na de 30000-ms-meetgrens. Beide bronnen tellen exact dezelfde voltooide bytes, maar PW houdt dit lopende request als onbekend en RT heeft het nog niet. Asserties niet aangepast. Er bestaat geen po-android/koud-spelend-baseline; die moet expliciet uit geldige ×3-nulmetingen komen vóór productwerk.

## 2026-10-08 05:47 UTC — nulmeting ×3; meetgrens blokkeert compare

Synchrone receipt nulmeting: exit 1 (alle drie Playwright-opnames geslaagd, baseline weigert onvolledige bron). Run-loads 6,62 / 7,21 / 7,39. Mediaan ttfp 1728 ms, ttfr 1352 ms, ttfh 4632 ms, blank-visible 4742 ms, LoAF eerste 12 s 3256 ms; decodes 226/223/223 (spreiding 1,339%), voltooide bodybytes 4.824.523/4.816.155/4.816.155 (0,174%). Ruwe bronnen bewaard in web/tmp/u63/nulmeting.

Alle runs starten een feels_like_c-Range op de meetgrens: geen echte transportfout, maar een body die na 30 s eindigt. Eén run bevat daarvoor bovendien tijdelijk startTime=0 van Playwright, zodat de per-URL-koppeling verschuift en vier fictieve bodyverschillen meldt. Voordat productkandidaten worden gewijzigd wordt dit meetcontract hersteld: kosten van requests die binnen 30 s beginnen volledig meten, na de grens laten uitlopen en beide bronnen op request-start selecteren; onbekende/afgebroken bodies blijven rood. Dit wordt een expliciete nieuwe baseline met reden in docs/perf.md; oude tijdmijlpalen blijven de nulmeting. Buienradar ×3 loopt apart.

## 2026-10-08 05:52 UTC — rig-fix gebouwd; host/slot wacht

Receipts rig-fix: pnpm test exit 0 (72 bestanden / 479 tests), pnpm build exit 0, pnpm typecheck exit 0. Eerste typecheck vond nullable bytes in de nieuwe testfixture; concreet bodygetal toegevoegd, hercontrole groen. Geen assertie versoepeld: beide bronnen moeten de hele begonnen request meten; timeout/ongeldige starttijd zijn nieuwe harde fouten.

Referentierun 3 wacht sinds loadavg 12–16; herstelde nulmeting staat via e2e-slot in de rij. Baselinevorming mag alleen na rustige ×3 met sluitende bronnen. Productcode nog ongewijzigd. Analyse: workers zijn al warm vóór de stijl-fetch, uurvelden zijn grotendeels al achter eerste regen; SW cachet stijl/fonts en bezochte PMTiles-ranges al. L0 heeft slechts het cursorpaar en L1 vraagt meteen acht uur regen: nu±1u eerst als eigen L0 is een gerichte ttfh-kandidaat zonder nieuw plannercontract.

## 2026-10-08 05:56 UTC — vroege publicatie van de meetstand

De host blijft op loadavg 10–16 (geen geldige aanvullende meting). Eerste commit bevat alleen dit log: ongewijzigde productcode + nulmeting/receipts/oorzaak. Draft-PR wordt nu geopend zodat de orkestrator de uitvoering kan volgen; rig-fix en nieuwe baseline volgen zodra de wachtende runs slagen. Productgates van de eerste nulstand: unit/build/typecheck groen; perf compare exit 1 door de hierboven benoemde meetfout, dus geen groene perf-claim.

## 2026-10-08 06:01 UTC — Buienradar compleet; herstelde nulmeting draait

Receipt referentie: MOTREGEN_E2E_PORT=4393 MOTREGEN_E2E_DATA_PORT=8393 pnpm --dir web perf:mobile --profile po-android --scenario referentie-buienradar --repeat 3, exit 0. ttfp-ref 3074 / 2640 / 2664 ms, mediaan 2664 ms; eerste radarbeeld mediaan 1651 ms; loadavg 7,40 / 6,61 / 7,87. Voorlopige verhouding originele nulmeting = 1728/2664 = 0,65. Rig staat zoals in U54 dichter bij warm toestel; koude telefoon heeft geen nieuwe referentie en uurveld/GPU-kosten blijven onvoldoende representatief.

De herstelde po-android-nulbuild is nu voltooid en staat bewaard in web/tmp/u63/nulpunt-dist; drie runs gestart. Productbron blijft ongewijzigd tot de nulmeting onder het herstelde contract compleet is. Volgende kandidaat: manifest vóór de grote appbundel via een gedeelde Promise, zonder dubbele sessietelling; ontwerp lokaal uitgewerkt.

## 2026-10-08 06:04 UTC — eerste herstelde broncontrole sluit

Eerste herstelde nulrun: 226 decodes, 4.824.523 B, 0 netwerkbevindingen; Playwright-opname geslaagd. Nog geen receipt van de hele aanroep of ×3-mediaan: overige runs wachten bij loadavg 10–15. Actieve meet-shell: session 39366, uitvoer tmp/u63/nulpunt-herstel.txt. Productcode nog ongewijzigd. PR #90: https://github.com/mathijshenquet/motregen/pull/90; eerste push 98fa722 is met ls-remote bevestigd.

Rig-broncontrole houdt de negatieve starttijd nu hard rood en wacht op afzonderlijke request-completion, ook voordat Playwright timing beschikbaar is. Byte-selectie gebruikt gedeelde requestsStartedWithin; mobile-report.ts wordt nu meegehasht in het meetcontract zodat latere rapportwijzigingen niet stil dezelfde baseline gebruiken. Laatste pnpm typecheck en pnpm test beide exit 0; definitieve build van die leesbaarheids-/foutafhandelingsversie loopt.

## 2026-10-08 06:08 UTC — herstelde nulmeting compleet, nieuwe baseline

Receipt: po-android/koud-spelend ×3 --baseline exit 0. Loadavg 6,00 / 7,94 / 5,88; alle runs 0 netwerkbevindingen. Nulpunt en referentie:

| stand | ttfp ms | ttfr ms | ttfh ms | blank slot-s / equivalent-s | LoAF 12 s ms | decodes | bodybytes |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| originele nulmeting (oude bytegrens) | 1728 | 1352 | 4632 | 174,5 / 2,74 | 3256 | 223 | 4816155 |
| hersteld meetcontract (vóór productwerk) | 1730 | 1364 | 4278 | 168,1 / 2,63 | 3183 | 226 | 4824523 |
| Buienradar-referentie | 2664 | — | — | — | — | — | — |

Getallen zijn medianen van ×3; het verschil tussen eerste twee regels is meetspreiding, geen productwinst. Herstelde ttfp 1730/1729/2031, ttfh 4278/4253/5131: kleine tijdverschillen vragen terughoudendheid. Decodespreiding 2,679%, bytes 0,303%. Baseline expliciet nieuw wegens ontbrekend po-android-nulpunt én veranderd bytecontract; reden in docs/perf.md. Overige bestaande rig-baselines gebruiken het oude contract en worden later in deze track opnieuw gemeten, met afzonderlijke vergelijking van aantallen/bytes.

Rig-gates: pnpm typecheck exit 0; pnpm test exit 0 (479); pnpm build exit 0; eigen geraakte rig/e2e desktop ×3 exit 0; expliciete nieuwe baseline exit 0. Geen productcode gewijzigd.
