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

## 2026-10-08 08:13 UTC — kandidaat 7: temperatuuropwarming na eerste basiskaart

De grote LoAF in eigen-kaartcontrole run 2 is IdleRequestCallback Vl (265 ms). De bewaarde normale vóór-bundel identificeert Vl als preloadTemperatureAtCursor: dezelfde frameBlend/isolineLayerIndices/preparedIsolineField-keten. Een afzonderlijke kleine proef laat die bestaande cacheopwarming pas na MapLibre-idle starten wanneer de tegels nog niet geladen zijn; kaartgereed = dezelfde idleplanning als voorheen. Regen, afspelen en directe/gevraagde temperatuurdata blijven direct; alleen ongevraagde vooruitberekening schuift. Daarmee volgt het werk de ttfr-prioriteit en de post-ttfp-bewaker. Hostlocked --checks + eigen kaart ×3 start in de lockrij; fixture-compare volgt op het oorspronkelijke nieuwe nulpunt. Placeholderproef wordt onafhankelijk klaargezet; nooit gelijktijdige perf.

## 2026-10-08 08:21 UTC — waterval bepaalt verschil fixture / eigen kaart

Oorspronkelijk nulpunt op bb0792b met gecorrigeerde netwerkselectie: --checks receipt exit 0 (typecheck, 480 unit, build, rig ×3 --baseline). Afzonderlijke fixture-reeks: po-android / koud-spelend / koud / synthetische 73 B kaart; ttfr 1397 ms, ttfp 1737 ms, decodes 223 mediaan, bytes 4816768; loads 7,07/6,98/6,48, 0 bronbevindingen. Bron-SHA blijft bb0792b; geen baseline op een kandidaat. Oude nulpuntkosten 4824523 B/226 decodes zijn dus niet omhoog herijkt (−0,161% bytes / −1,327% decodes). Archive web/tmp/u63/nulpunt-netwerkstart.

De volgende tabel gebruikt de bestaande vaste eigen-kaartcontrole, geen nieuwe productvariant. Alle starts/ends in ms sinds navigatie; netwerkrijen uit Playwright, kaartfase uit sourcerequest→sourcedata. De kaartfase is géén zuivere parse-CPU: hij omvat workerverwerking, wachten en overdracht terug. Elke run is po-android / koud-spelend / koud / eigen PMTiles, SW geblokkeerd, HTTP-cache uit, 1× page-CPU plus 40% quota op hoofddraad én workers, regenraster schaal 6.

| stap | run 1 start→einde ms | run 2 start→einde ms | run 3 start→einde ms | bodybytes / betekenis |
| --- | --- | --- | --- | --- |
| manifest | 111→155 | 114→158 | 121→169 | 36513 B |
| stijl-light.json | 558→693 | 436→557 | 433→557 | 5809 B; fixture-stijl slechts 383 B |
| Noto Sans Regular 0–255 glyphs | 884→1079 | 749→885 | 752→855 | 76580 B; fixture heeft geen labels/glyphs |
| PMTiles-header/root Range | 960→1021 | 830→890 | 812→863 | 16384 B, bytes=0-16383 |
| PMTiles-tegelpayload Range | 1599→1638 | 1243→1280 | 1212→1248 | 45172 B, bytes=39939-85110 |
| volledige kaartfase | 1417→3808 | 1206→3336 | 1140→3385 | 2391 / 2130 / 2245 ms wall-clock |
| basiskaart/ttfr render | 4248 | 3546 | 3596 | mediaan ttfr 3596 ms |
| eerste regencommit / ttfp | 1233 / 1598 | 1316 / 1652 | 1336 / 1710 | mediaan 1316 / 1652 ms |

Dus: de extra ~2,4 s zitten vooral ná de tegelbytes (bijvoorbeeld run 2: payload klaar 1280 ms, worker/source klaar 3336 ms, render klaar 3546 ms). Geen lange seriële netwerkketen: twee PMTiles-ranges en één gewone Latin-glyphrange; fonts al klaar vóór de tegelpayload. Er zit wél 353–578 ms tussen headerantwoord en tweede Range-start; dat is niet netwerkoverdracht alleen. Totale kaartbody 138136 B, tegenover 73 B fixturetegel. De synthetische kaartfase was slechts 145/159/156 ms, mediaan ttfr 1220 ms.

U59 mobile-4g is een ander remcontract: 4× CDP-hoofddraad, workers zonder renderer-quota, regenraster schaal 1, 9 Mbps/60 ms RTT en Pixel-5-viewport; po-android hier is 1× CDP + 40% gezamenlijke renderer/workerquota, raster schaal 6, 30 Mbps/20 ms RTT, 390×844. Beide koude rigs blokkeren SW en zetten HTTP-cache uit, dus SW-warmte is geen verklaring voor het verschil. De 2,2-s-kaartfase mag daarom niet als 4×-parse of echte telefoontijd worden gepresenteerd. Een aparte quota-/U59-contractcontrole volgt; tot die tijd is CPU-concurrentie de onderbouwde kandidaat, nog geen volledig geïsoleerde oorzaak.

Kandidaat 7 verplaatst uitsluitend de bewezen 265-ms-temperatuuropwarming achter het eerste volledige kaartbeeld; andere request-/decode-kandidaten volgen pas op bovenstaande waterval. De fixture-compare was vóór start geannuleerd (receipt 143) om gedeelde rapportnamen niet vóór archivering van de eigen-kaartproef te wissen; geen opname weggegooid. Hostload 10–19 houdt kandidaat 7 momenteel tussen de opnames tegen, drempel blijft <8.

## 2026-10-08 08:24 UTC — U59-vergelijking: rem én archief verschillen

web/perf/basemap-comparison.json bewaart U59 met nl-0aa536ff364f7cce.pmtiles (3.536.092 B totaal). De huidige eigen kaart is U60 nl-91e2043db5c73799.pmtiles (24.301.762 B totaal, ruimere landcover/detail). Hele archiefgrootte is geen koude download: U59 mobile-4g kaartbody 133345 B, huidige PO-kaartbody 138136 B (+3,59%). Dat kleine byteverschil verklaart op zichzelf geen +2,4 s. U59 eigen mobile-4g-fase 438/500/503 ms; onafhankelijke hercontrole 605/255/223 ms. Ze zijn bovendien gemeten vóór U58 (297 weerdecodes op raster schaal 1), terwijl huidige PO 223 decodes op schaal 6 telt. Niet alleen het kaarttype labelen: bronhash, raster en gezamenlijke workerquota maken deze historische tijdreeksen onvergelijkbaar als één productwinst.

De huidige hostload stijgt boven 30 door aanvullende Chromium-/Nix-C++-werkzaamheden; onze wachtlog blijft drempel <8 toepassen. Alleen de eerste kandidaat-7-opname heeft al een receipt; de volgende start nog niet. Geen vreemde processen beëindigen of hoogbelaste metingen als valide presenteren. Proefbranch track/u63-placeholder-proef bestaat afzonderlijk; U64-cherry-pick c9de7a0 had integratieconflicten en is geïsoleerd tot alleen map-start-assets/plugin/helpers en overeenkomstige App-opzet. U64 lazy-table/inline-manifest-wijzigingen zijn bewust niet meegenomen, zodat er één placeholderkandidaat wordt gemeten.

## 2026-10-08 08:29 UTC — tegelinhoud maakt U59 nog minder gelijk; reproduceerbare waterval

Offline inhoudstelling van dezelfde z5/16/10-tegel (geen perf-tijdclaim): U59 51975 uitgepakte bytes, landcover 277 features/5495 punten, water 255/14387, place 50. U60 83908 bytes, landcover 326/19428 punten, water 256/14407, place 88. Landcover heeft dus 3,54× zoveel punten; totaal geometriepunten circa 1,66×. Dit detailverschil plus rem/rasterverschil moet bij de U59-fasetijd blijven staan; bytegroei alleen is geen parsekostenmodel. Broncommand node web/tmp/u63/tile-components.mjs vanuit web (feitelijk node tmp/u63/tile-components.mjs), uitvoer tmp/u63/tile-components.txt.

Nieuw companion-command node .dev/tracks/u63-mobiel-ttfp-lus/waterfall.mjs web/tmp/u63/own-control web/tmp/u63/regen-vroeg receipt exit 0, uitvoer tmp/u63/waterval-vast.md. Het leest de bestaande drie geldige opnames per reeks en geeft per run profiel/scenario/kaart/rem/raster/bytes/Range/kaartfase. Geen product- of rigcontractwijziging.

Rustig meetvenster opnieuw als planningsvraag via herdr-UI aangeboden: externe Nix/C++-builds maakten loadavg 35–52. De bestaande <8-drempel is leidend, geen antwoord of verstreken tijd als toestemming om hem te negeren. Proefbranch blijft afzonderlijk en ongepubliceerd; zichtbaar placeholderbeeld komt alleen als een meetbaar winnende kandidaat naar de PO.

## 2026-10-08 08:33 UTC — meetbeleid bevestigd; placeholderpaar in dezelfde wachtrij

Orkestrator bevestigt: U63 meet na de builds van het andere project; meetjobs laten wachten onder flock op loadavg <8, geen nieuwe planningsvragen hierover. Dit beleid blijft leidend. Proefbranch klaar met alleen U64-map-startcomponenten boven behouden kandidaat 3, gedeelde nieuwste rigcorrectie en een tijdelijke first-map-image-markering op render nadat de gekozen kaartbron geladen is. Definitieve pixels komen afzonderlijk; deze markering wijzigt geen ttfr/ttfp-contract.

Proefpaar queued: flock -w 7200 /home/mathijs/motregen-perf.lock bash tmp/u63/placeholder-pair.sh vanuit /home/mathijs/worktrees/motregen/u63-placeholder-proef. Het wacht eerst op load<8, draait typecheck/unit/build, dan vóór/na ×3 met po-android / koud-spelend-dev / koud / eigen PMTiles. Beide bezoeken exact /weer/de-bilt?perf=1&dev&kaartstart=tegel; vóór heeft geen VITE_MAP_START, na VITE_MAP_START=tegel. De dev-UI is dus in beide gelijk; alleen de inlinekaart verschilt. Deze aanvullende gematchte dev-reeks krijgt een apart label en vervangt de vaste normale hoofdlijn niet. --load-wait 120 voorkomt korte wachttime-outs tijdens het toegekende beleid. Rapporten worden binnen dezelfde lock vóór de volgende variant naar aparte mappen gekopieerd.

## 2026-10-08 08:37 UTC — kandidaat 7 sluit zonder winst; volgende paren wachten

--checks + eigen kaart receipt exit 0: typecheck/unit484/build, eigen kaart po-android/koud-spelend ×3; loads 6,34/7,81/7,77, 0 bronbevindingen, decodes 223/223/223, bytes 4962226/4961613/4961613. Hoofdlijnregel: po-android / koud-spelend / koud / eigen PMTiles / ttfr 3834 ms (controle 3596) / ttfp 1789 ms (controle 1652) / geen gemeten winst. Geen productwinst afleiden uit deze fase met tussentijdse externe loadpieken; een voordeel is in deze proef niet aangetoond. Opnames web/tmp/u63/own-temp-idle. Gerichte desktopgate loopt nog, daarna callbackwijziging terugzetten en finale fixture-compare van de behouden stand.

Aanvullende rendererdiagnose queued in dezelfde proefbranch/lock: bash tmp/u63/quota-pair.sh, volledige eigen kaart, normale koud-spelend-start, dezelfde code/raster6/netwerk/viewport, eerst standaard 40% quota ×3 dan uitsluitend --renderer-quota 0 ×3. Geen placeholder of dev-UI in dit diagnosepaar; vergelijking is een riggevoeligheidscontrole, geen productwinst. Nieuwe paren wachten vooraf 60 s aaneengesloten loadavg <8 omdat de externe buildbelasting in golven onder/boven de grens komt. Recept node tmp/u63/wait-quiet.mjs; geen drempel versoepeld, geen nieuwe planningvraag.

## 2026-10-08 08:45 UTC — kandidaat 7 teruggezet; afsluitende gates queued

Gerichte desktopgate receipt exit 0: 24 tests geslaagd, 2 bestaande touch-only tests overgeslagen omdat deze track uitsluitend desktop mag draaien. Beide skips staan expliciet in focus.spec.ts, geen assertion gewijzigd. Post-ttfp-LoAF kandidaat 7 mediaan max 269 ms, nog 2 >250 ms mediaan; ook de bewaker is niet opgelost. Callbackproef bewaard in tmp/u63/zero-frame-state/App-temp-idle.tsx en App exact hersteld naar behouden kandidaat 3.

Afsluitende behouden-standgate queued onder flock: bash tmp/u63/final-gates.sh (60 s rustig, typecheck/unit/build, originele po-android-fixture --compare ×3, archive vóór lockvrijgave). De acht overige baselines volgen queued met bash tmp/u63/migrate-baselines.sh: standaard 4G/Fast3G × koud/journey/storm ×3, apart OpenFreeMap 4G/koud ×3 en desktop/koud ×3; daarna compare-baselines.mjs tegen bb0792b en ongewijzigde 10%-grens. Geen nieuwe baseline bij ≥5% spreiding of bronfout. Opnames apart bewaren vóór elke volgende aanroep. Alle extra scenario's zijn apart gelabelde rig-migratie, geen vervanging van de vaste PO-eigen-kaart-hoofdlijn.

## 2026-10-08 08:48 UTC — grensselectie onafhankelijk herberekenbaar maken

Raw JSON bewaart nu naast geselecteerde requests ook alle geobserveerde requests en de geselecteerde native Resource Timing-records. Alleen zo kan de volgende reviewer controleren waarom een native fetch vóór 30 s bij een netwerk-start ná 30 s werd uitgesloten. Geen selectieregel of tolerantie gewijzigd. De nog wachtende finale gate krijgt daarom eerst een nieuwe oorspronkelijke-productopname ×3, zodat de rig-bronhash de definitieve raw-velden bevat; daarna dezelfde behouden productstand --compare. Geen kandidaat-baseline of metadata-only hashomzetting. Placeholder- en diagnosebranch hebben dezelfde raw-uitbreiding, met hun afzonderlijk gelabelde meet-URL/instrumentatie intact.

## 2026-10-08 08:59 UTC — wachten ook tussen herhalingen strikt maken

Code-inspectie vindt een bestaand meetgat: per-run QUIET_HOST_WAIT_MS stond vast op 15 min en de false-return van waitForQuietHost werd genegeerd. Daardoor kon een lange externe build alsnog een opname boven de drempel starten. De rig neemt nu dezelfde loadWaitMinutes als de CLI over (queued jobs: 120 min) en stopt vóór een opname bij verlopen wachttijd. Grens is overal strikt <8; een baseline mag niet worden geschreven als een startload ≥8 heeft. Twee gerichte guardtests bevestigen wachten en weigering van precies 8; samen met de meetgrens-tests 14 tests receipt exit 0. Drempel/toleranties niet versoepeld.

Alle vier eigen batches staan nog vóór hun eerste nieuwe opname in de lock-/loadwachtrij. De oorspronkelijke checkout en losse placeholderbranch hebben dezelfde wachtcorrectie, met de proef-URL intact. Finale oorspronkelijke baseline en behouden-standcompare gebruiken daardoor één definitieve rigbron; geen metadata-only hashomzetting. Screenshotrecept staat klaar in de proefbranch, nog niet gedraaid. Load op 08:58 UTC 26,43; blijven wachten volgens expliciete orkestratorinstructie.

## 2026-10-08 09:06 UTC — main U62/U66 geïntegreerd; nieuw main-nulpunt vóór U63

Nieuwe expliciete orkestratorinstructie uitgevoerd: origin/main 43b92d6 omvat U62 8d75754 en U66 32b82ba. Eén App-importconflict opgelost: basemap-blend behouden, decodebudget blijft via gedeelde startup-entry. Kaderhemel staat aan conform main, radiation behoort nu tot de getoonde velden. Niet teruggezet om oude cijfers te bewaren. Integratiecommand `set -euo pipefail; pnpm --dir web typecheck; pnpm --dir web test; pnpm --dir web build` SYNCHRONE receipt exit 0, 498 tests. Uitvoer tmp/u63/u62-merge-unit.txt en u62-merge-build.txt. Deze merge is een gevraagde WIP-stand; rustige perf/desktopgate staan nog queued, dus geen volledige groene gate claimen.

Baseline-reden: U62 wijzigt de startsituatie (hemelkader en stralingsvenster), naast de definitieve netwerkgrenscorrectie. De controlecheckout is daarom nu zuiver main 43b92d6, zonder U63-productcode, met alleen dezelfde rig-overlay. Finale batch meet eerst deze main-fixture ×3 --baseline en bewaart u62-main-fixture; vervolgens main eigen kaart ×3 in u62-main-own. Pas daarna behouden U63-stand fixture ×3 --compare en eigen kaart ×3, met afzonderlijke archives final-fixture/final-own. De eerdere vóór-U62 eigen-controle 3596/1652 blijft de historische vaste hoofdlijn en wordt niet door nieuwe main-cijfers overschreven. De nieuwe matched-main-reeks komt apart in de tabel; verschillen door U62 zijn geen U63-winst.

Gerichte desktopgate uitgebreid met de daadwerkelijk geraakte U62-integratiebestanden sky-window/table/dev-panel naast startup/map-startup/presets/decode-budget/basemap/focus; exacte command staat in tmp/u63/final-gates.sh. Placeholderpaar en quota-paar blijven beide coherent op de afzonderlijke vóór-U62-proefcode, expliciet labelen; een eventuele winnaar moet op de geïntegreerde startsituatie opnieuw worden bevestigd vóór hoofdlijn/PO-voorstel. Alle vier eigen batches wachten volgens beleid, load 20,03 op 09:05 UTC.

## 2026-10-08 09:09 UTC — complete historische eigen-kaarttabel vóór U62

De eerder pending kandidaat 6 en afgeronde kandidaat 7 staan hieronder volledig naast dezelfde vaste controle. Mediane cijfers ×3 opnieuw uit de gearchiveerde report/raw via `node .dev/tracks/u63-mobiel-ttfp-lus/summarize.mjs web/tmp/u63/own-control web/tmp/u63/own-assets web/tmp/u63/own-zero-frame web/tmp/u63/own-temp-idle`, receipt exit 0. Dit zijn geen nieuwe opnames. Elke regel gebruikt U60 nl-91e2043db5c73799, raster6, page-CPU1× plus renderer/workerquota40%, netwerk30Mbps/20ms, /weer/de-bilt, vóór U62.

| referentie / kandidaat | profiel | scenario | cache | basiskaart | ttfr ms | ttfp ms | eerste regencommit ms | decodes | bodybytes | LoAF na ttfp max ms | LoAF >250 ms | keuze |
| --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| vaste controle kandidaat 3 | po-android | koud-spelend | koud | eigen PMTiles U60 | 3596 | 1652 | 1316 | 223 | 4961590 | 360 | 1 | historische referentie |
| kandidaat 5 stijl/fonts vroeg | po-android | koud-spelend | koud | eigen PMTiles U60 | 3737 | 1861 | 1466 | 223 | 4961721 | 276 | 1 | verworpen |
| kandidaat 6 nulgewichtsframe | po-android | koud-spelend | koud | eigen PMTiles U60 | 4420 | 1607 | 1137 | 221 | 4963645 | 326 | 1 | verworpen, ttfr zwaarder dan ttfp |
| kandidaat 7 temp na kaart-idle | po-android | koud-spelend | koud | eigen PMTiles U60 | 3834 | 1789 | 1423 | 223 | 4961613 | 269 | 2 | verworpen, geen gemeten winst |

De lange frames blijven een open bewaker; kleinere max-frames rechtvaardigen geen ttfr-regressie. Textuurupload gebruikt al R8 en hergebruikte framebuffers; GPU/SwiftShader blijft buiten de telefoonrem. Placeholder en quotadiagnose zijn de volgende afzonderlijke metingen, nog geen resultaat terwijl hostload te hoog is.

## 2026-10-08 09:20 UTC — wachtrecept gecorrigeerd vóór eerste opname

Eigen voorbereidingsfout gevonden: placeholder-pair.sh was al door Bash tot zijn eerste wachtlus gelezen toen de extra rustige minuut werd toegevoegd. Een andere bestandslengte zou de vervolgcommando's op de verkeerde leespositie laten hervatten. Vóór enige opname/check de oorspronkelijke prefix exact uit de eigen launchcommand hersteld; /proc/186089/fdinfo/255 bevestigt positie 283 (direct na de wachtlus). Daar begint nu de aanvullende wait-quiet-helper, gevolgd door alle oorspronkelijke checks en beide ×3-opnames. Proces/lock niet beëindigd en geen nieuwe planningvraag; de wachtende jobs blijven staan. Andere batches zijn nog niet door Bash gestart en hebben dit probleem niet. Alle outputfiles nog leeg, geen vermeende receipt of perfresultaat. Load 43,99 op 09:19 UTC.

## 2026-10-08 09:29 UTC — placeholderkosten vooraf expliciet

Offline assetcontrole (geen tijdmeting): tiles.json 32169 B, los gecomprimeerd 24368 B gzip. Twee z4-tegels: 4/7/5 3578→5769 B en 4/8/5 20493→38620 B gzip→uitgepakt. Helper maakt dus twee extra DecompressionStream-bewerkingen; de bestaande frame-decode-kolom telt uitsluitend weerframes en mag deze niet verbergen of als kaartdecodes presenteren. De rig telt de daadwerkelijke gecomprimeerde HTML-body in beide varianten; die wire-delta is leidend boven de losse assetgrootte. Bron: U64 67c9f28, twee tegels uit eigen U60-archief, geïsoleerde proefbranch.

Alle vier eigen outputfiles nog leeg, geen nieuwe opname sinds de eerdere rustige series. Hostload 26,94 op 09:27 UTC. De strikte <8-grens en het beleid na de externe builds blijven staan; volgende WIP-cadence vanaf 09:21 UTC.

## 2026-10-08 09:36 UTC — WIP-checkpoint tijdens externe builds

Commit/push-cadence voortgezet; geen nieuwe perfwaarde claimen. Laatste hostload 17,23 om 09:35 UTC, outputfiles van placeholder/quota/finale gate/migratie nog leeg. Eerste batch houdt de hostlock en wacht; de andere drie eigen batches wachten op dezelfde lock. Alleen rustige opnames zijn toegestaan. Geen processen van andere tracks/projecten gepauzeerd. Typecheck/unit498/build van U62-integratie blijven de laatst afgeronde code-receipts; laatste gerichte desktopreceipt vóór U62 was 24 geslaagd/2 bestaande touch-skips. De queued finale gate moet de nieuwe geïntegreerde stand nog verifiëren.

## 2026-10-08 09:49 UTC — nieuwe lockdiscipline: loadwacht buiten, één opname binnen

Orkestrator wijzigt de discipline expliciet: niet de hostlock vasthouden tijdens loadwacht of over hele batches. Meteen de vier eigen oude lockjobs beëindigd, SYNCHRONE receipts alle vier exit 143 (geen opname begonnen); alleen eigen descendants geraakt. Daarna geen eigen perf-lockhouder meer. Dit vervangt alle eerdere LOG-recepten met een flock rond een hele batch/--checks.

Nieuwe runner: run-perf.sh doet checks buiten de lock en roept perf:mobile rechtstreeks aan. CLI bouwt één keer, wacht vóór elke profiel/scenario/run buiten de lock, selecteert precies één Playwright-test via diens volledige run-N-titel en gebruikt `flock -w 7200 -o /home/mathijs/motregen-perf.lock`. Onder die lock controleert perf-run.ts de load opnieuw: ≥8 = exit 75 vóór Playwright, lock direct vrij, opnieuw buiten wachten. Beide rigs wachten onder een gehouden lock nooit; hun startload moet <8 zijn. -o voorkomt fd-erfenis door achtergebleven servers. E2E-slot wordt nu per opname gebruikt, niet om de hele CLI-wacht. CLI/wacht/lock-helperbronnen tellen voortaan mee in het contracthash. Eén eigen lokale batchwachtrij voorkomt races op gedeelde 4393/8393-fixturepaden zonder de hostlock te claimen.

Verificatie: typecheck/unit498/build receipt exit 0 (tmp/u63/per-run-lock-unit.txt/-build.txt); droge Playwright --list met grep selecteert exact 1 test, exit 0. Werkelijke testlock-smoke op hoge load 17,21: meetcommando zou exit 23 geven maar wordt niet gestart, loadguard exit 75; onmiddellijk daarna flock -n op dezelfde testlock exit 0. Titelselectie inclusief regextekens gecontroleerd, exit 0. docs/perf.md §perf-lock bevat het buiten-wachten/per-opname-patroon. Nieuwe master `bash tmp/u63/measurement-queue.sh` gestart ZONDER buitenste flock; eerst placeholderpaar, quota, finale main/U63-gate, migratie. Eén open sessie, 85883; nog geen nieuwe opname, load 22,06 op 09:48 UTC. Nieuw Chromium per opname vereist opnieuw gemeten originele main-baselines; bestaande historische resultaten blijven afzonderlijk.

## 2026-10-08 10:05 UTC — main U65 geïntegreerd; plaatsenwaterfall na ttfp

Expliciete merge-instructie uitgevoerd: main ec3ca02 omvat U65 0fb247ec (lazy volledige plaatsenlijst, lokale pinzone) naast U62/U66. Vier conflicten opgelost met behoud van vroege U63-header/kaartparallelisatie, U65 schedulePlaces na de eerste spelende regencommit, en per-opname-lockdiscipline. Geen blokkerende plaatsselectie vóór de eerste regenheader heringevoerd. Integratiecommand `set -euo pipefail; pnpm --dir web typecheck; pnpm --dir web test; pnpm --dir web build` SYNCHRONE receipt exit 0, 510 tests; uitvoer tmp/u63/u65-merge-unit.txt en u65-merge-build.txt. Perf en gerichte desktopgate blijven pending, dus dit is een gevraagde WIP-merge en geen volledige groene gate.

Definitief origineel nulpunt wordt nu gemeten op zuiver main ec3ca02 zonder U63-productcode, met dezelfde definitieve rig-overlay. Baseline-reden in docs/perf.md aangevuld: zowel U62-hemelkader/straling als U65 lazy plaatsenlijst veranderen de startsituatie/kosten. Finale batch archiveert u62-u65-main-fixture en u62-u65-main-own apart van final-fixture/final-own. Historische hoofdlijn vóór U62/U65 blijft 3596/1652 ms op eigen U60 PMTiles. De geïsoleerde placeholder- en quotaparen blijven een coherent vóór-U62/U65-productpaar; een eventuele winnaar vraagt opnieuw bevestiging op de geïntegreerde stand.

Watervalhelper toont nu alle plaatsen-*.json-verzoeken, bodybytes en afstand tot de volledige raw milestone:ttfp; een koude spelende start met een catalogusrequest vóór ttfp wordt geweigerd. Gepauzeerde scenario's hebben een andere startcontract en krijgen alleen een gelabelde volgorde. Herberekening van drie historische own-control-raws receipt exit 0 (tmp/u63/u65-waterfall-recheck.txt), geen nieuwe opname. U65 --request-order blijft behouden en expliciet uitgesloten van baselines/compare; drukke-hostcaptures bewijzen alleen aanvraagvolgorde. Echte perf blijft wachten buiten de lock en strikt <8; de lock omvat één opname. Gerichte desktopgate uitgebreid met geraakte location/flanders/seo/basemap-cache-specs, uitsluitend --project desktop.

Meetmaster sessie 85883 wacht nog vóór de eerste placeholderopname, buiten de hostlock. Load 22,70 op 10:03 UTC. Geen nieuwe timings of afgeronde perf-receipt; beleid blijft wachten na externe builds zonder planningvraag. Oude lokale PO-baseline is niet gestaged: alleen een echte nieuwe main-opname mag het nieuwe broncontract vastleggen.

## 2026-10-08 10:15 UTC — U65 volgordebewijs; proefcode klaar; dependency-isolatie hersteld

Nieuwe niet-perf-capture op geïntegreerde U63/U65-stand f21cba8: `MOTREGEN_E2E_PORT=4693 MOTREGEN_E2E_DATA_PORT=8693 pnpm --dir web perf:mobile --profile po-android --scenario koud-spelend --basemap own --request-order`; daarna `pnpm --dir web exec tsx scripts/place-waterfall.ts tmp/u63/u65-request-order/po-android-koud-spelend-run1.raw.json`. Beide SYNCHRONE receipt exit 0. Meta requestOrderOnly=true, load 18,97, eigen U60-kaart, koud, 0 netwerkbevindingen. De volledige plaatsenlijst start ná de raw ttfp-mijlpaal, body 60946 B. Dit is uitsluitend aanvraagvolgordebewijs; geen ttfr/ttfp-perfregel of baseline. Compacte native waterval/metadata in metingen/plaatsen-volgorde-po-android.json en .svg; volledige raw lokaal web/tmp/u63/u65-request-order. Meetlock direct na deze ene capture vrijgegeven, reguliere meetmaster blijft erbuiten wachten.

Geïsoleerde U64-placeholderproef codechecks buiten de lock: eerste typecheck exit 2 door mijn onjuist getypte first-map-image-markering. Hersteld naar een expliciete milestone in de proefcode, geregistreerd op het bestaande monitortracepad. Herhaalde typecheck/unit486/build met VITE_MAP_START=tegel SYNCHRONE receipt exit 0; uitvoer proef/tmp/u63/placeholder-code-unit.txt/-build.txt. Geen opname vóór deze correctie. Prototype blijft buiten de hoofdlijn; de vóór/ná-opnames zijn nog niet gestart.

Gerichte desktopgate van 13 geraakte specs exit 1: 20 geslaagd, 8 gefaald, 2 bestaande skips, 22 niet gedraaid na maxFailures. Zeven failures zijn een eigen dependency-fout: de web/node_modules-symlink in de proefwerkboom liet devenv/pnpm de imports van de hoofdwerkboom omschakelen naar een tweede Playwright-installatie tijdens de run. Alle gedeelde symlinks in beide eigen tijdelijke werkbomen verwijderd, elke werkboom heeft nu eigen dependencies. Hoofdwerkboom gegenereerde web/node_modules tijdelijk verplaatst naar ignored tmp/u63/node_modules-before-isolation en opnieuw gekoppeld met pnpm install --frozen-lockfile; realpath-assert bevestigt eigen root/node_modules/.pnpm. Geen lockfile of dependenciesversie veranderd, geen externe werkboom geraakt. Eén locatie-timeout (Werk-optie ontbreekt) wordt apart opnieuw onderzocht met geïsoleerde imports; geen groenclaim of toeschrijving aan load. Eerste foute gateuitvoer blijft tmp/u63/u65-desktop.txt, gerichte repro tmp/u63/u65-location-repro.txt.

## 2026-10-08 10:16 UTC — proefcommit gereproduceerd; locatie-repro groen

Losse proefbranch track/u63-placeholder-proef commit 298f6d3 gepusht; ls-remote bevestigt exact 298f6d39d3d3e953411739fe7e26b0a3579bbc3b. Omvat de geselecteerde U64 z4-assets/helper plus dezelfde definitieve U63-rig, zonder U62/U65-productwijzigingen. Alleen VITE_MAP_START verschilt tussen vóór/ná; beide koude PO-devstarts gebruiken ?dev&kaartstart=tegel en dezelfde first-map-image-instrumentatie. Codechecks 486 tests/typecheck/build groen, rustige metingen pending. Deze commit is een proef, geen winnaar of toevoeging aan de hoofd-PR.

Gerichte locatie-repro na dependency-isolatie SYNCHRONE receipt exit 0: de onthouden Werk-locatie, de genormaliseerde /weer/maastricht-URL en herlaad zonder geocoder slagen zonder assertionwijziging. De eerste locatie-timeout blijft geregistreerd; één geslaagde repro bewijst geen oorzaak. De volledige set van 13 geraakte desktop-specs wordt nu herhaald met stabiele eigen Playwright-imports, uitvoer tmp/u63/u65-desktop-isolated.txt. Perf-master nog buiten lock aan het wachten, load 39,86 op 10:15 UTC.

## 2026-10-08 10:20 UTC — WIP: volgordebewijs gepubliceerd, perf blijft pending

Commit/push-cadence voortgezet met de compacte U65-volgordewaterval en bovenstaande tussenresultaten. Beide perf-samenvattingshelpers weigeren voortaan requestOrderOnly=true expliciet, ook als zo'n capture toevallig op een rustige host start; de afzonderlijke place-waterfall.ts blijft de juiste niet-perf-analyse. Historische drie-run own-control-herberekening met beide helpers receipt exit 0; de echte request-order-capture wordt expliciet geweigerd door summarize.mjs, verwacht exit 1 met juiste reden. Geen nieuwe tests of productwijziging voor deze kleine helpercorrectie.

Geïsoleerde gerichte desktopgate loopt nog, nu zonder Playwright-importconflicten. Laatste codegate hoofdwerkboom: typecheck/unit510/build exit 0. Load 47,14 op 10:18 UTC. De perfwachtrij is nog vóór haar eerste rustige opname en houdt geen hostlock. Nieuwe eigen-kaart-tijden, placeholdervoor/ná en quota-diagnose zijn nog onbekend; de bestaande vaste historische ttfr/ttfp-referentie blijft onveranderd.

## 2026-10-08 10:30 UTC — tabelrace gevonden en hersteld; functionele placeholderbeelden

Volledige gerichte desktopset met geïsoleerde dependencies receipt exit 1: 47 geslaagd, 1 tabel-failure, 4 expliciete bestaande profiel/touch-skips. Geen importconflicten of nieuwe locatie-timeout. Exacte tabelassertie: nu-rij 360 px onder de kop, verwacht 0. Zuiver main ec3ca02 gerichte tabelcontrole receipt exit 0; U63 met dezelfde test opnieuw exit 1 en dezelfde 360 px, beide zonder assertionwijziging. Uitvoer tmp/u63/u65-desktop-isolated.txt, u65-main-table-repro.txt, u65-u63-table-repro.txt.

Oorzaak in bestaande ForecastTable.pinNow: de callback van requestAnimationFrame sloot over de eerste rij, maar een snelle rijherberekening verwijdert die vóór de callback. closest() levert dan niets, terwijl pinning=true elke nieuwe poging blokkeert. Callback gebruikt nu de actuele nowElement en geeft de pending-vlag vrij als de DOM nog niet bestaat. Geen productkeuze of assertie veranderd; bestaand bedoelde vastpinnen op nu hersteld. `set -euo pipefail; pnpm --dir web typecheck; pnpm --dir web test; pnpm --dir web build; MOTREGEN_E2E_PORT=4593 MOTREGEN_E2E_DATA_PORT=8593 pnpm --dir web e2e e2e/table.spec.ts --project desktop` SYNCHRONE receipt exit 0, unit510 en tabel 5 geslaagd/2 bestaande profiel-skips; uitvoer tmp/u63/table-pin-{unit,build,desktop}.txt. Andere 12 geraakte specs waren al geslaagd in de geïsoleerde set; geen volledige suite gedraaid. Finale batch herhaalt deze onveranderde codechecks niet en bewaart nog wel de open perf-baseline/compare-paren.

Functionele placeholderbeeldcontrole in proefcommit 298f6d3 receipt exit 0: PMTiles-ranges bewust vastgehouden, eerste-kaartmarkering én eerste regencommit bereikt, basemapReady blijft null; pas daarna ranges vrijgegeven en volledige kaart gereed. Vier beelden in proef/web/tmp/u63/placeholder-review, licht/donker vóór/na echte kaart. Klok en cursor staan voor beide beelden op hetzelfde synthetische 2026-08-28T15:00Z-moment; niet afspelen en geen timingvergelijking. Eerste poging met vaste klok had een __name-serializefout in het tijdelijke tsx-initScript (exit 1); hersteld naar letterlijke JS-injectie, herhaalde capture exit 0. Geen appbron gewijzigd voor deze fotoverificatie, eigen previewproces na elke poging via trap gesloten. Geen PO-voorstel of winnaarsclaim vóór de rustige ≥100 ms/eerste-kaart-en-geen-ttfp-verlies-gate.

Oude tijdelijke PO-baselinekopie met oud broncontract bewaard in ignored tmp/u63/nulpunt-netwerkstart-baseline.json en werkbestand teruggezet naar de committed historische baseline; uitsluitend de echte nieuwe main-opname mag hem opnieuw wijzigen. Perf-master nog vóór de eerste rustige opname, buiten hostlock; load 16,44 op 10:29 UTC.

## 2026-10-08 10:36 UTC — checkpoint tabelcorrectie; concrete proefbeelden

Tabelcorrectie wordt met de hierboven genoemde code/gerichte-e2e-receipts gecommit en gepusht; rustige perf blijft pending. Eerste vaste-klokbeelden hadden het automatisch bij #t geopende versheidspaneel boven de kaart. Tijdelijk captureharnas sluit dat nu via de bestaande freshness-dialog .about-close; een eerste algemene Sluiten-locator was ambigu (exit 1), de gerichte locator en herhaalde vier beelden receipt exit 0. Alleen het harnas aangepast, geen productgedrag of perf-mijlpaal. Klok/cursor blijven gelijk; volledige kaart komt pas na vrijgave van de ranges. Voorbereide beelden worden pas een PO-kandidaat als het rustige meetpaar wint.

Kandidaatcheck zonder meting: de geïnstalleerde MapLibre 5.24.0 worker_pool.ts gebruikt op Chromium al precies één kaartworker (Safari is afzonderlijk). Een tweede worker uitsparen is dus geen wijziging of meetkandidaat; geen extra run daarvoor. Dit staat los van het eigen weerdecode-workerpaar en de queued renderer-quota-diagnose. Laatste load 13,23 op 10:35 UTC; geen eigen hostlockhouder en nog geen reguliere nieuwe perfopname.
