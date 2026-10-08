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

## 2026-10-08 06:10 UTC — kandidaat 1: vroeg manifest, één gedeeld request

Na complete nulmeting alleen het manifest naar een kleine HTML-module verplaatst (web/src/startup.ts). HTML laadt die naast de appbundel; App consumeert dezelfde initialManifest-Promise en behoudt de bestaande refreshfunctie. sessionManifestUrls blijft één eigenaar; still=1 krijgt geen sessievlag, skywatch-render start geen weerrequest. Een afwijzing wordt vroeg geobserveerd en blijft voor App beschikbaar om de bestaande fout te tonen. Eerste Range schuift via de bestaande dynamische manifest/headerketen mee; geen vaste generatie-URL/Early Hint toegevoegd.

Meting: po-android/koud-spelend ×3 --compare, session 38574, tmp/u63/kandidaat1.txt. Nieuwe startup.spec controleert het vroege request terwijl de appbundel wordt vastgehouden, exact één sessievlag en de still-uitzondering. Gerichte desktop-gate: startup.spec + usage.spec + presets.spec + decode-budget.spec (nog te draaien). Typecheck/unit opnieuw gestart; normale build apart van rig-dist. Geen waarneembaar nieuw element toegevoegd.

## 2026-10-08 06:13 UTC — kandidaat 1 gecorrigeerd voor de productie-bundelaar

De eerste proefvariant bleek in de productie-HTML slechts één script te hebben: Vite voegde de twee HTML-modules samen. Daardoor geen preload vóór de bundel. Die proef is expliciet afgebroken (session 38574, exit 130); geen winst of groen geclaimd, ruwe eerste run in web/tmp/u63/kandidaat1-samengevoegd. Correctie binnen dezelfde kandidaat: eigen Rollup-input startup + post-HTML-hook die de gegenereerde module vóór het app-script zet. In de gebouwde HTML geverifieerd: afzonderlijke startup-entry, 1,9 kB / 1,1 kB gzip. De dev-HTML blijft twee reguliere modules gebruiken.

Gecorrigeerde ×3-vergelijking: session 42826, tmp/u63/kandidaat1-entry.txt; build gereed, wacht op loadavg <8. Geen verdere productkandidaat gewijzigd.

## 2026-10-08 06:16 UTC — kandidaat 1 checks groen; gerichte e2e gestart

Definitieve entryvariant: pnpm typecheck, pnpm test (479) en pnpm build opeenvolgend onder set -e, synchrone exit 0. Extra skywatch-e2e bewaakt dat de offline renderer geen vroeg weerrequest krijgt. Gerichte gate gestart via eigen tweede poortpaar 4394/8394: pnpm --dir web e2e e2e/startup.spec.ts e2e/usage.spec.ts e2e/presets.spec.ts e2e/decode-budget.spec.ts --project desktop. Uitvoer tmp/u63/e2e-kandidaat1.txt; receipt nog niet binnen. Perf session 42826 wacht op rustige host; externe U57-Chromium en main-botbrowser verklaren de belasting, geen achtergebleven eigen browser na de abort.

## 2026-10-08 06:17 UTC — e2e-poortcorrectie vóór serverstart

4394/8394 blijkt het toegewezen U64-paar te zijn. De eigen nog wachtende e2e-aanroep vóór serverstart afgebroken (exit 130) en herstart met vooraf gecontroleerde vrije 4593/8593; perf blijft op toegewezen 4393/8393. Dit is uitsluitend de tweede eigen e2e-server, geen wijziging van het perf-meetcontract.

## 2026-10-08 06:25 UTC — hostlock, PO-prioriteit en kandidaat-1-gates

Orkestrator geeft U63 eerst het rustige meetvenster en verplicht alle perf-opnames tot flock -w 7200 /home/mathijs/motregen-perf.lock. Nieuw track-runscript run-perf.sh past de lock en eigen 4393/8393 toe; de bestaande loadavg <8 blijft. Vanaf nu elke iteratie ttfr vóór ttfp rapporteren; ttfh/blank secundair. LoAF na ttfp als bewaker (geen optimalisatiedoel). Kandidatenvolgorde op verwachte ttfr-winst: vroege manifest/Range, basiskaartketen, worker/WebGL-warmte, textuurupload.

Receipt gerichte desktop-gate: startup.spec + usage.spec + presets.spec + decode-budget.spec, poorten 4593/8593, exit 0 (9 tests). Correcte perf-entrypoging exit 1 vóór opnames door eigen Caddy-poorten bezet na eerdere Ctrl-C. /proc/cwd bevestigt beide overgebleven Caddy-processen als deze worktree; alleen die beëindigd. Geen uitslag of winst uit de mislukte poging. Kandidatenvergelijking herstart via run-perf.sh; nieuwe hostload 23,74 vereist wachten.

## 2026-10-08 06:32 UTC — U57 integratie voorbereid; LoAF-bewaker uit ruwe bron

Main f70754c (met U57-merge 4b14eab7) opgehaald en merge --no-commit gestart op instructie orkestrator. Eigen kandidaat tijdelijk gestasht, teruggelegd; Vite-conflict opgelost met beide plugins (vroege manifest-entry én pageRoutes/sitemap). Paden en #t-fragment blijven U57-eigenaar. Voor de lopende perf-aanroep is de build vóór deze merge bevroren: die uitslag is apart van de integratiemeting te lezen. Alle codegates volgen opnieuw op de geïntegreerde variant.

Nieuwe summarize.mjs leest bestaande ruwe LoAF-entries, zonder meetcontract of drempels te wijzigen. Bewaker: frames gestart vanaf ttfp én voltooid vóór 30 s. Nulpunt ×3 mediaan: ttfr 1364 ms, ttfp 1730 ms; daarna 23 LoAF / 2018 ms totaal / 591 ms blocking / 181 ms langste frame. Per run langste 175 / 215 / 181 ms: ook het nulpunt is na de start nog niet volledig soepel. Repro: node .dev/tracks/u63-mobiel-ttfp-lus/summarize.mjs web/tmp/u63/nulpunt.

Lock/LOG-commit 8ec7be0 gepusht; git ls-remote bevestigt de exacte branchtip. Productkandidaat nog niet gecommit. Stash blijft als herstelpunt tot de integratie groen is.

## 2026-10-08 06:33 UTC — kandidaat 1 ×3 groen, tijdwinst ontbreekt; controle na U57

Receipt run-perf.sh --profile po-android --scenario koud-spelend --repeat 3 --compare exit 0; loads 6,23 / 5,85 / 6,26, alle bytes sluitend. Mediaan ttfr 1433 ms (+69), ttfp 1782 ms (+51), ttfh 4801 ms (+523) t.o.v. hersteld nulpunt. Geen gemeten tijdwinst. Wel manifest op 85–127 ms tegenover voorheen ~343–386 ms; de eerste Range schuift niet overtuigend mee doordat app/kaart/worker-opzet later loopt. Geen timingverbetering geclaimd.

Ruwe opnames in web/tmp/u63/kandidaat1-lock. Omdat U57 juist tussendoor integreert, eerst controle ×3 op actuele main zonder productkandidaat: eigen wijzigingen als patch + nieuwe bestanden in tmp/u63/kandidaat1-state bewaard; App/index/Vite terug naar origin/main. Zo worden main-verschil en kandidaatwinst niet op één hoop gezet. Daarna behouden of verwerpen op gepaarde tijden. Een kop 06:32 hierboven is ~30 seconden vóór die UTC-tijd geschreven; inhoud ongewijzigd.

## 2026-10-08 06:46 UTC — meetstatus-checkpoint en U57-merge

Naderende 20-minutencadans: commit bevat de opgedragen integratie van reeds op main gegate U57 plus log/meetbewaker; geen productkandidaat. App/Vite/index in de index zijn exact origin/main. De parallelle-kaartproef staat alleen in de werkboom. Main-control heeft één sluitende opname (ttfr 1409 ms, ttfp 1794 ms, 226 decodes, 4.825.675 B); overige opnames wachten sinds ~06:36 bij loadavg 10–23. Die extra controle is nog niet groen verklaard. Eigen rig-compare met ongewijzigd meetcontract was in de voorgaande manifestproef ×3 groen; main is opnieuw typecheck/unit (483)/build groen. Gehele integratie/perf-controle blijft in de draft-PR open totdat receipts volgen.

| iteratie | ttfr ms | ttfp ms | LoAF na ttfp ms / max ms | decodes | bodybytes | keuze |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| hersteld nulpunt | 1364 | 1730 | 2018 / 181 | 226 | 4824523 | referentie vóór productwerk |
| vroeg manifest ×3 | 1433 | 1782 | 1948 / 170 | 223 | 4816721 | geen gemeten winst; prototype buiten productcode |

Parallelle-kaartproef: typecheck/test (483)/build opeenvolgend exit 0. Alleen de volgorde verandert: WebGL/tegelopzet overlapt de eerste header; regenlagen wachten op header én eerste style.load. Nog geen perf- of gerichte e2e-receipt. OpenFreeMap-snapshot exit 0 (50 bestanden, tileset 20261004); genegeerde fixture gereed voor herijking van de twee kaartbaselines naast de zes gewone baselines. PR-beschrijving bijgewerkt, exit 0.

## 2026-10-08 06:50 UTC — U57-controle ×3 sluit; parallelle kaartopzet meten

Main-control receipt exit 0: run-perf.sh --profile po-android --scenario koud-spelend --repeat 3 --compare. Mediaan ttfr 1409 ms, ttfp 1781 ms; ttfh 4653 ms; decodes 226/226/223, wire 4825675/4826288/4817307 B, 0 bronbevindingen, 1,333%/0,186% spreiding. Loads 6,07/7,76/6,08. Vergeleken met de manifestproef 1433/1782 ms ontbreekt nog steeds meetbare tijdwinst: prototype blijft verworpen. U57-integratie heeft nu ook de volledige extra rig-receipt.

Parallelle-kaartproef start via hetzelfde hostlocked runscript; uitvoer tmp/u63/kaart-parallel.txt. Normale checks typecheck/test/build al exit 0 op deze variant; gerichte desktop-e2e volgt onder dezelfde hostlock om eigen interferentie te voorkomen. Push e375374 is met ls-remote exact bevestigd. Ruwe controlerapporten in web/tmp/u63/control-main.

## 2026-10-08 06:54 UTC — kandidaat 2: kaartopzet parallel, alle gates groen

Receipts: typecheck/test (483)/build exit 0; hostlocked po-android/koud-spelend ×3 --compare exit 0; hostlocked gerichte desktop-e2e map-startup/presets/usage/basemap exit 0 (15 tests). De nieuwe test houdt alle regenheaders vast en ziet al een PMTiles-Range, daarna een spelklaar kaartbeeld op /weer/de-bilt. Bestaande stijl- en regenlagen blijven gelijk; alleen de opzet overlapt. Eén gedeelde firstStyleReady-Promise voorkomt dat een vroeg style.load-event verloren gaat terwijl de header nog binnenkomt.

| stand | ttfr ms | ttfp ms | ttfh ms | LoAF na ttfp ms / max ms | decodes | bodybytes |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| actuele main, controle ×3 | 1409 | 1781 | 4653 | 2027 / 185 | 226 | 4825675 |
| kaartopzet parallel ×3 | 1371 | 1745 | 4470 | 1483 / 175 | 226 | 4825746 |

Getallen zijn medianen. Primair verschil slechts −38 ms ttfr / −36 ms ttfp, binnen de eerdere tijdspreiding: bescheiden waarneming, geen bewezen koude telefoonwinst. Causale waterval: eerste tegel in eerste proefrun start op 708 ms tegenover ~827 ms in het oorspronkelijke nulpunt; basiskaart hoeft niet meer op regenheader te wachten. Decodes 226/226/226; bytespreiding 0,013%; loads 7,58/7,30/7,61; alle bronnen sluiten. Geen LoAF na ttfp boven 250 ms. Prototype behouden als kleine overlapwijziging; volgende grotere kandidaat: hetzelfde MRF-client-/workerpaar en eerste regenpaar vóór de grote appbundel, zonder tweede netwerk- of decodecache. Volle basiskaart nog afzonderlijk toetsen omdat de fixture slechts een 73-byte tegel heeft.

Nieuwe compare-baselines.mjs bewaakt bij de herijking alle acht bestaande niet-PO-baselines: nieuwe contracthash én oorspronkelijke 10%-byte/decodegrens. Eerste aanroep exit 1 zoals verwacht: nog acht oude contracten, geen voltooide herijking. Dit is een aanvullende controle, geen versoepeling.

## 2026-10-08 06:59 UTC — kandidaat 3: vroege gedeelde regenpipeline

Afzonderlijke HTML/Rollup-entry opnieuw als kandidaat, nu met het bestaande MRF-client-/workerpaar en twee eerste regenframes vóór de grote app. App gebruikt exact dezelfde client, decodebudget, manifest-Promise, perfmonitor en caches; geen tweede fetch/decodeimplementatie of vaste generatie-URL. Startpaar volgt dezelfde buildTimeline + presets/#t-logica; dev-eerste-regen=laat behoudt de late tegenproef. Telegram primeert geen paar vóór het SDK zijn tijdpreset heeft geleverd. Skywatch start geen client/weerrequest; still behoudt geen sessievlag. E2e houdt de appbundel vast en verlangt al een eerste regen-Range; geen winstclaim vooraf.

Gates + po-android ×3 --compare gestart, tmp/u63/{typecheck,test,build,regen}-vroeg.txt (preciese bestandsnamen typecheck-regen-vroeg.txt, test-regen-vroeg.txt, build-regen-vroeg.txt, regen-vroeg.txt). Definitieve gerichte startup/map-startup/usage/presets/decode-budget/basemap desktopgate volgt na de opnames. Push 072e909 met ls-remote exact bevestigd.

## 2026-10-08 07:11 UTC — kandidaat 3 groen: eerste Range veel eerder, ttfr/ttfp winnen

Receipts: typecheck/test (483)/build exit 0; run-perf.sh po-android/koud-spelend ×3 --compare exit 0; hostlocked gerichte startup/map-startup/presets/usage/decode-budget/basemap desktop-e2e exit 0 (19 tests). Eerste Range verschijnt terwijl de grote appbundel vastgehouden is. still heeft geen sessievlag; offline skywatch geen manifest of worker. Eén client voorkomt dubbele header/frame/decode-cache.

| stand | ttfr ms | ttfp ms | ttfh ms | LoAF na ttfp ms / max ms | decodes | bodybytes |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| kaartopzet parallel ×3 | 1371 | 1745 | 4470 | 1483 / 175 | 226 | 4825746 |
| vroege gedeelde regenpipeline ×3 | 1220 | 1562 | 4205 | 1859 / 187 | 224 | 4818713 |

ttfr −151 ms (11,0%), ttfp −183 ms (10,5%). Runs ttfr 1220/1383/1199, ttfp 1562/1739/1546; één run wint nauwelijks, dus geen koude telefoonclaim. Bewaker: langste LoAF na ttfp 187 ms mediaan, geen >250 ms; totaal stijgt 376 ms omdat afspelen vroeger begint tijdens laden. Decodes 224/226/224, bytes 4818713/4826468/4818713 B, spreiding 0,890%/0,161%, alle bronnen sluiten, loads 6,46/7,63/7,24. Waterval run 1: manifest 150–194 ms, worker start 147 ms, eerste nowcast-Range 228–268 ms (vorige stand 622–801 ms). App-entry 406 kB gzip + startup 13,7 kB; vrijwel hetzelfde totaal.

Vervolgkandidaat vanuit waterval: op exact nu geeft frameBlend vorig+huidig met mix=1; showFrame wacht nog op het vorig radarframe (817–866 ms), hoewel de shader daarvoor nul gewicht gebruikt. Onderzoeken of het exacte beeld dezelfde pixels met één frame kan tonen; tussenliggende tijden houden hun bestaande interpolatie/motion. Daarna vroege kaartstijl/fontketen en volledige basiskaart; texture-pack/upload is al R8 en wisselt hergebruikte textures, GPU-kosten blijven rig-beperking. Alle acht oude rig-baselines nog expliciet herijken voordat de track afrondt.

## 2026-10-08 07:14 UTC — kandidaat 4: werkelijk eerste kaartpaar vóór de app

De renderer vraagt bij exact nu vorig+huidig (mix=1); de vorige priming vroeg huidig+volgend. Nu kiest startup met de bestaande frameBlend/timelineEpochAtCursor het daadwerkelijke eerste kaartpaar, daarna het volgende speelbeeld, zonder dubbele indexen. Vorig radarframe hoort voor ttfr vóór het toekomstframe op de lijn. Rendering/interpolatie/motion en mijlpaalanker ongewijzigd; geen shader- of nulgewichtsoptimalisatie ingevoerd. Daarmee blijft het pixelcontract vanzelf hetzelfde. Nieuwe e2e verlangt ook de radar-payload-Range terwijl App vastgehouden is. Eén extra vroeg frame wordt toch bij het eerste beeld gebruikt; geen extra horizon/precache.

Typecheck/unit/build plus hostlocked po-android ×3 --compare gestart, tmp/u63/{typecheck,test,build}-startpaar.txt + startpaar.txt. Gerichte desktopgate startup/map-startup/presets/decode-budget apart in de hostlockrij; tmp/u63/e2e-startpaar.txt. De keuze voor de werkelijk getekende frames houdt ttfr voorop; uitkomst volgt.

## 2026-10-08 07:21 UTC — kandidaat 4 verworpen: vroeg derde frame vertraagt de renderer

Receipts alle gates exit 0: typecheck/unit (483)/build, po-android ×3 --compare, 12 gerichte desktoptests. Toch slechtere primaire mediaan: ttfr 1220→1338 ms, ttfp 1562→1641 ms. Het derde vroege decodeframe legt meer werk vóór de app onder dezelfde 40%-rendererquota; vroegere bytes zijn geen eerdere kaart. Daarom primingselectie en bijbehorende extra radarassertie exact teruggezet naar de gepushte kandidaat-3-versie, geen productwijziging behouden. Opnames web/tmp/u63/startpaar; bewaker in tmp/u63/guard-startpaar.txt. Volgende kandidaat richt het vroege werk op stijl/fonts vóór de app: kaart kan dan eerder opzetten terwijl de twee benodigde start-/speelframes decoderen.

## 2026-10-08 07:29 UTC — kandidaat 5: stijl/font-assets vroeg, gedeelde cache

Kaart-assets uit basemap.ts naar lichte basemap-assets.ts gehaald: dezelfde voorbereiding van bron- en glyph-URL's, dezelfde Promise-caches, dezelfde fout-/retrylogica en bufferkopie voor workertransfer. Startup vraagt het effectieve thema (still licht; opgeslagen/system verder zoals App) en gewone Latijnse glyphs vroeg; Telegram wacht op SDK-thema en offline renderer vraagt geen kaart. MapLibre/protocolinstallatie blijft bij App, de vroege module importeert alleen het assetsdeel. Unitglyphtest controleert nu gedeelde vroege/app-cache; startup-e2e houdt App vast op de eigen kaart en verlangt stijl, font en eerste regen-Range vóór vrijgave. Nog geen winstclaim.

Runscript --checks houdt typecheck/unit/normale build én daaropvolgende rig onder één hostlock, zodat ook onze builds een andere perf-opname niet verstoren. Command: run-perf.sh --checks --profile po-android --scenario koud-spelend --repeat 3 --compare, tmp/u63/basemap-vroeg.txt; gerichte desktop-e2e startup/map-startup/presets/usage/basemap in dezelfde lockrij, tmp/u63/e2e-basemap-vroeg.txt. Alle losse shell-statussen blijven open tot een synchrone receipt.

De oorzaakformulering bij kandidaat 4 is een hypothese op basis van meer vroeg werk onder de gedeelde quota; de harde keuze om hem te verwerpen berust op de gemeten ttfr/ttfp-regressie. Push e7b46c3 met ls-remote exact bevestigd.

## 2026-10-08 07:38 UTC — kaart-assets fixture groen, nog geen primaire winst; eigen kaart controle

Receipts kandidaat 5 fixture: --checks (typecheck/unit 483/normale build/po-android ×3 --compare) exit 0; gerichte desktopgate exit 0 (18 tests). Mediaan ttfr 1344 ms, ttfp 1700 ms, ttfh 4378 ms; 220/227/226 decodes, 0 bronbevindingen, spreiding 3,120%/0,316%, loads 7,49/7,26/7,37. Geen winst tegenover kandidaat 3 (1220/1562). De eerste run 1816/2210 is een grote uitschieter, maar de oorspronkelijke medianeregel blijft.

Omdat deze fixture geen glyphs heeft, eerst volledig eigen-kaartpaar als aanvullende representativiteitscontrole. Kandidaat-5-bronnen in tmp/u63/basemap-vroeg-state bewaard, productcode exact terug naar gepushte kandidaat 3; ongebruikte nieuwe helper blijft buiten de bundel. run-perf.sh --profile po-android --scenario koud-spelend --basemap own --repeat 3 (zonder compare: voor deze aanvullende kaart/PO-combinatie bestaat geen eigen nulbaseline; productgate blijft de fixture-compare). Daarna dezelfde eigen kaart met assets-proef en identieke parameters. Geen bestaande baseline overschreven.

## 2026-10-08 07:43 UTC — volledige basiskaart nulcontrole; lock-checkpoint

Receipt eigen-kaartcontrole kandidaat 3: --basemap own po-android/koud-spelend ×3 exit 0. Mediaan ttfr 3596 ms, ttfp 1652 ms, ttfh 5311 ms; loads 6,52/7,98/6,84, alle bronnen sluiten, decodespreiding 0,449%, bytes 0,012%. De volledige kaart is dus bepalend voor zichtbare ttfr en was door de 73-byte-fixture niet representatief gemeten. In deze kaartcontrole valt ttfr ná ttfp; mijlpaaldefinities worden nu nagelezen voordat er een conclusie over het zichtbare eerste regenbeeld volgt. Opnames web/tmp/u63/own-control.

Checkpoint commit/push met --checks-lock en append-only meetstand, geen ongeverifieerde assets-proef in productcode. De assets-proef op deze volledige kaart volgt onder dezelfde parameters, zonder baselineoverschrijving. Acht oude baselinecontracten blijven expliciet open.

## 2026-10-08 07:51 UTC — WIP-stand, kandidaat 5 verworpen na volledige kaart

Receipt eigen-kaart assets-proef exit 0: run-perf.sh --profile po-android --scenario koud-spelend --basemap own --repeat 3. Alle bronnen sluiten; loads 5,14/7,24/6,51; decodes 223/220/223, bytes 4961721/4955477/4961721 B. ttfr 3596→3737 ms, ttfp 1652→1861 ms; eerste regencommit 1316→1466 ms. Geen primaire winst op fixture of volledige kaart. Assets-prototype naar genegeerd tmp/u63/basemap-vroeg-state bewaard en productcode exact terug naar kandidaat 3; geen verworpen code behouden. De fixture-gates waren typecheck/unit483/build/compare en 18 gerichte desktoptests exit 0. WIP-commit bevat tussenresultaat en uitgebreid rapportscript, met push op verzoek van de orkestrator.

Definitie nagelezen in core/perf.ts: ttfr wacht op zowel firstRainMs (renderercommit) als basemapReadyMs (style én alle tegels geladen). Eerste regencommit is geen afzonderlijk bewezen zichtbaarheid; splash/kaart kunnen nog bezig zijn. Rigcontract niet aangepast; companion-summary rapporteert voortaan firstRainMs en basemapReadyMs naast ttfr/ttfp. Volledige-kaartcontrole heeft na ttfp in elk van drie runs één LoAF >250 ms (maxima 360/375/289 ms); assets-proef 276/336/219 ms. De volledige kaart haalt de bewaker dus nog niet, hoewel de eenvoudige fixture geen >250 ms had. Geen succesclaim op de echte koude telefoon.

Vervolg: exacte tijdstippen mogen hun nulgewichtsframe overslaan als dat pixelgelijk bewezen kan worden, met bestaande logische ttfp-anker behouden. Daarna resterende kaartrenderkosten en alle acht oude baselinecontracten expliciet afsluiten. Opnames web/tmp/u63/own-assets. Vorige push 64b94f7 exact bevestigd om 07:42 UTC (09:42 lokaal); commit/pushcadans blijft 15–20 minuten.

## 2026-10-08 07:53 UTC — kandidaat 6: nulgewichtsframe overslaan

Bij mix=1 laadt showFrame alleen rechts, bij mix=0 alleen links; het geldige frame gaat naar beide textures. Tussenliggende menging/motion blijft gelijk. Het logische linker tijdpaar blijft het bestaande perf-anker voor ttfp, onafhankelijk van de fysieke texturekeuze. E2e houdt radar-payloads vast maar verlangt het exacte nu-beeld; headers mogen door. Normale voor-build vastgelegd in web/tmp/u63/zero-before-dist na hostlocked build receipt exit 0. Alle codegates + fixture-compare ×3 starten onder één flock, daarna gerichte desktopgate en afzonderlijke pixelvergelijking exact/tussenliggende tijdstippen in desktop/mobile. Geen winstclaim vooraf.

## 2026-10-08 07:55 UTC — vaste hoofdlijn en expliciete meetlabels

Orkestrator: vaste hoofdlijn voortaan po-android / koud-spelend / koud / eigen basiskaart. Referentiestand is de volledige-kaartcontrole van kandidaat 3 (3596/1652 ms), vast gehouden voor volgende iteraties. Die controle kwam ná eerdere productwijzigingen: geen fictieve retrospectieve nulmeting. De echte voorafgaande nulmeting was de eenvoudige fixture en staat daarom uitsluitend in de afzonderlijke reeks. Elke nieuwe productkandidaat krijgt eigen-kaart ×3 naast de bestaande fixture-compare-gate. Pad van de koude start: /weer/de-bilt (legacy root wordt naar dit pad genormaliseerd). Alle onderstaande tijden zijn medianen ×3, behalve waar expliciet origineel/meetonvolledig staat.

Hoofdlijn — dezelfde po-android CPU-/netwerk-/regenfixture, volledige eigen basiskaart, koud:

| iteratie / referentie | profiel | scenario | cache | basiskaart | ttfr ms | ttfp ms | eerste regencommit ms | LoAF na ttfp max ms | keuze |
| --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | --- |
| vaste controle kandidaat 3 | po-android | koud-spelend | koud | eigen PMTiles | 3596 | 1652 | 1316 | 360 | vaste referentie; bewaker nog niet gehaald |
| kandidaat 5 assets vroeg | po-android | koud-spelend | koud | eigen PMTiles | 3737 | 1861 | 1466 | 276 | verworpen; slechter dan vaste controle |
| kandidaat 6 nulgewichtsframe | po-android | koud-spelend | koud | eigen PMTiles | pending | pending | pending | pending | meten vóór keuze |

Afwijkende fixture-reeks — alleen ondersteunende gates en historische vergelijking, geen eigen-kaart-hoofdlijn:

| iteratie / referentie | profiel | scenario | cache | basiskaart | ttfr ms | ttfp ms | LoAF na ttfp max ms | keuze |
| --- | --- | --- | --- | --- | ---: | ---: | ---: | --- |
| oorspronkelijk nulpunt, bronfout grens | po-android | koud-spelend | koud | synthetische 73 B vectorfixture | 1352 | 1728 | n.v.t. | exit 1, meetgrens hersteld |
| hersteld nulpunt vóór product | po-android | koud-spelend | koud | synthetische 73 B vectorfixture | 1364 | 1730 | 181 | oorspronkelijke PO-compare-baseline |
| kandidaat 1 alleen manifest vroeg | po-android | koud-spelend | koud | synthetische 73 B vectorfixture | 1433 | 1782 | 170 | verworpen |
| main + U57 controle | po-android | koud-spelend | koud | synthetische 73 B vectorfixture | 1409 | 1781 | 185 | integratiecontrole |
| kandidaat 2 parallelle kaart | po-android | koud-spelend | koud | synthetische 73 B vectorfixture | 1371 | 1745 | 175 | behouden, klein verschil binnen spreiding |
| kandidaat 3 regenpipeline vroeg | po-android | koud-spelend | koud | synthetische 73 B vectorfixture | 1220 | 1562 | 187 | behouden; eigen-kaart-controle hierboven |
| kandidaat 4 derde frame vroeg | po-android | koud-spelend | koud | synthetische 73 B vectorfixture | 1338 | 1641 | 174 | verworpen |
| kandidaat 5 assets vroeg | po-android | koud-spelend | koud | synthetische 73 B vectorfixture | 1344 | 1700 | 165 | verworpen; eigen-kaart-controle hierboven |

Buienradar is apart: po-android / referentie-buienradar / koude nieuwe context / externe Buienradar-kaart, ttfp-ref mediaan 2664 ms. Nog geen U63-productmeting op OpenFreeMap of warm in deze lus; herijking van bestaande OpenFreeMap-baselines blijft afzonderlijk gelabelde rig-migratie.

## 2026-10-08 07:58 UTC — kandidaat 6 fixture rood: bronselectie op meetgrens

--checks receipt exit 1: typecheck/unit483/build groen, rig ×3 heeft in run 2 twee bronbevindingen en blijft terecht rood. Bewijs raw: native fetch-start voor harmonie-motion/wind-u/wind-v ligt op 29993 ms, netwerk-start in Playwright nét na 30000 ms. De huidige rig past dezelfde grens onafhankelijk op twee verschillende startbegrippen toe en selecteert daardoor drie extra native records (slechts 0,13% bytes, maar requestcount blijft strikt rood). Geen assertiegrens gewijzigd of run verwijderd. Archive web/tmp/u63/zero-frame. Eigen-kaartmeting en pixels staan al onder hostlock klaar; de kleine tijdgrensverschillen moeten daarna met een gedeelde requestselectie worden gerepareerd en de vergelijking opnieuw groen worden geverifieerd. PO-nulpuntkosten vóór product blijven leidend, geen herbaselining op de kandidaat om regressies te verbergen.

## 2026-10-08 08:08 UTC — gedeeld netwerkvenster; oorspronkelijk nulpunt in aparte checkout

wireWindow koppelt native records chronologisch per URL aan alle geobserveerde netwerkrequests vóór vensterselectie. Beide geselecteerde bronnen volgen Playwright-netwerk-start; ongekoppelde native records binnen de periode blijven rood, ontbrekende bodies ook. Nieuwe betekenisvolle grens-test bewaakt beide fouten. Geen tolerantie gewijzigd. Twee voorbereidende --checks-pogingen exit 1/2: eerst testtype gecorrigeerd, daarna oorspronkelijke App bleek niet tegen de U57-presets-API te compileren. Dat is geen meetreceipt.

Daarom zuivere detached checkout /home/mathijs/worktrees/motregen/u63-nulpunt-original op bb0792b, alleen de drie rig-/rapportagebestanden erbovenop en bestaande node_modules gedeeld. Nieuwe --checks + po-android/koud-spelend ×3 --baseline onder dezelfde hostlock/4393/8393 gestart, tmp/u63/nulpunt-netwerkstart-original.txt. Hoofdwerkboom intussen exact terug naar behouden kandidaat 3, zonder nulgewichtsoptimalisatie. Geen tijdelijke oude productcode committen.

Kandidaat 6 eigen-kaart receipt exit 0: ttfr 4420 ms versus vaste controle 3596; ttfp 1607 versus 1652; eerste regencommit 1137 versus 1316; bewaker max 326 ms mediaan (465/326/205). Bronnen sluiten, loads 6,57/7,85/7,13. Hoofdlijnregel: po-android / koud-spelend / koud / eigen PMTiles / ttfr 4420 / ttfp 1607 / verworpen. Alle tien pixelvergelijkingen exact gelijk (max 0/255, desktop+mobile op +0/+2,5/+32,5/+61/+180 min), gerichte desktopgate 17 tests exit 0. Archive web/tmp/u63/own-zero-frame. Nulgewichtsproef is ondanks correcte pixels geen ttfr-winst en blijft verworpen.

Nieuwe opdracht orkestrator: U64 z4-tegelplaceholder uit 67c9f28+ alleen in afzonderlijke proefbranch, po-android koud eigen kaart; eerste kaartbeeld ≥100 ms winst zonder ttfp-verlies is zichtbaar PO-voorstel met screenshot. Geen placeholder op de hoofdlijn vóór winst en beeldgoedkeuring. Na meetgrensherstel en nieuwe baseline eerst deze aanvullende kandidaat isoleren.

## 2026-10-08 12:44 UTC — gepaarde placeholderproef met nieuwe hostgrens

Orkestrator staat expliciet startload ≤16 toe uitsluitend voor gepaarde A/B-opnames (absolute baselines ≤8). Rootrunneroverlay toegevoegd: --paired, expliciete metadata, geen --baseline, loadwacht buiten per-opname-flock. Typecheck19 gerichte load/wiretests op identieke rootoverlay exit0; beide proefvoorbouwen exit0. Tijdelijk proefscript bouwt A(zonder inline kaart)/B(tegel) vooraf en meet om en om koud×3, daarna warm×3. Eerste poging master26795 exit1 wegens ontbrekende MOTREGEN_MOBILE_BASEMAP=own bij eigen fixturevoorbouw, PMTiles404; apart bewaard en uitgesloten. Export hersteld, master74089 opnieuw vanaf A1. Geldige A1 load14,80, ttfr3844/ttfp1819ms, 223 decodes/4971712B/0wirefindings; slechts één opname, B1 nog pending. Geen placeholder op hoofdlijn of winnaarsclaim.
