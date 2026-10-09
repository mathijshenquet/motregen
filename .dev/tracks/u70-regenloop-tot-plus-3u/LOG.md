# U70 — regenloop −2…+3 uur

## 2026-10-09 12:14 UTC — start en context

- Spec, AGENTS, projectlog, Telegram-docs, U66-log, U67-spec en sequence/still/render-code gelezen. Eigen schone branch track/u70-regenloop-tot-plus-3u vanaf main; devenv actief, bash als command runner.
- LOG exact op gevraagde plek; expliciet lokaal genegeerd via common git info/exclude, git check-ignore bevestigd. Nooit committen. .env-symlink ongemoeid.
- Alleen regenloop naar 61 frames / 10 fps / −120…+180 minuten. Temperatuur en Wind blijven 169 frames; 85 stills en deltaknoppen per niet-Wind-modus blijven behouden.
- Nulmeting en nameting met één vastgepind manifest van https://motregen.nl, koude eigen caches en hostbrede perf-lock. pnpm render --dry-run-prime gebruikt alleen mockuploads; geen poller, echte Telegram-call of prod-uitrol.
- Volgende stap: dependencies installeren, nulmeting starten, rendererstrategie voor de 54 latere regenstills uitwerken.

## 2026-10-09 12:14 UTC — nulmeting en implementatie

- Correctie: de eerste entry heeft een handmatig te laat gekozen timestamp; daadwerkelijke start was 12:10 UTC, nulmeting gestart 12:12 UTC.
- Dependencies: pnpm install --frozen-lockfile, waargenomen EXIT 0. Vastgepind prod-manifest generated 2026-10-09T12:08:02Z, now 12:05Z, 42 chunks.
- Nulmeting volledige matrix, waargenomen EXIT 0 (tmp/u70/before-render.log): 173 media, render 69573 ms, dry-run-prime 85 ms, totaal 69658 ms (mockuploads, pacing uit). Regen 169 frames / 169 PNGs / 2882649 B / render 54866 ms / encode 1095 ms. Temperatuur 169 / 2241562 B / 63402 ms / 2166 ms. Wind 169 / 2212998 B / 54996 ms / 2166 ms.
- Implementatie: bestaande onderscheid tussen loopFrames en alle epochs gebruikt. Regen krijgt 61 loopframes op vijf minuten, daarachter alleen 54 ontbrekende tienminutenstills. De encoder trimt reeds op loopFrames en voegt 1 s eindhold toe. Geen renderer-, rollen- of registerwijziging nodig; één pagina per modus, 115 regen-PNGs in totaal. Alle 85 stillFrames behouden, waarvan slechts 31 een loopframe hergebruiken.
- Renderer-cacheversie 13→14 voorkomt oude 169-frameloops na herstart. Tests toetsen de +3 u-grens, tienminutenstaart, nul Wind-stills en alle 173 selecties; bestaand PNG-cache/conversie-test kiest nu regen +12 u.
- Telegram-tabel en uitleg bijgewerkt. Bot-typecheck/tests lopen; volgende stap eerste commit/push/draft-PR en koude nameting op hetzelfde manifest.

## 2026-10-09 12:15 UTC — vroege draft-PR en groene bot-gates

- pnpm -C bot typecheck: waargenomen EXIT 0. pnpm -C bot test: waargenomen EXIT 0, 84/84 tests in 15 bestanden (tmp/u70/bot-test.log). pnpm -C bot build: waargenomen EXIT 0. git diff --check: EXIT 0.
- Eerste commit 8d62478 gepusht (EXIT 0). Draft PR vroeg geopend: https://github.com/mathijshenquet/motregen/pull/99 (gh pr create EXIT 0); URL gedeeld met operator. PR meldt nameting en media-inspectie eerlijk als pending.
- Koude nameting loopt op dezelfde origin/manifest, cache tmp/u70/after-cache, onder flock /home/mathijs/motregen-perf.lock. Volgende stap MP4/PNG/JPEG-asserties, visuele controle, cijfers/docs en PR bijwerken.
- Repro vanaf worktreeroot voor nulmeting: flock /home/mathijs/motregen-perf.lock bash -c 'TG_BOT_KEY=x MOTREGEN_BOT_ROLE=combined MOTREGEN_ORIGIN=https://motregen.nl MOTREGEN_CHROMIUM_PATH=/nix/store/j8hc3kdypr2gaa2w3dq0a370lwfzbasf-chromium-151.0.7922.137/bin/chromium MOTREGEN_RENDER_CACHE=../tmp/u70/before-cache pnpm -C bot render --manifest=../tmp/u70/manifest.json --dry-run-prime=../tmp/u70/before-register.json'
- Nameting: dezelfde opdracht, before-cache→after-cache en before-register.json→after-register.json. Manifest vooraf met curl -fsS https://motregen.nl/data/manifest.json -o tmp/u70/manifest.json vastgezet. Alleen mockuploads; geen Telegram-verzoeken.

## 2026-10-09 12:18 UTC — nameting door hostload verstoord; controle en herhaling

- Koude nameting waargenomen EXIT 0 (tmp/u70/after-render.log): 173 media / render 97618 ms / mockprime 74 ms / totaal 97692 ms. Regen 61 loopframes, 115 PNGs, 1206270 B, render 58854 ms, encode 1426 ms. Temperatuur ongewijzigd 169 frames, 2246829 B, render 91851 ms, encode 1960 ms. Wind ongewijzigd 169, 2169368 B, render 81320 ms, encode 2207 ms.
- Performance nog geen winstclaim: host-load steeg van 11,69 bij nulmeting naar 27,13; vele rustc-processen op ~100% CPU. Ook ongewijzigde modi werden 45–48% trager. Nodige herhaling om deze onzekere vergelijking te verduidelijken; twee koude volledige-matrix-runs direct achter elkaar onder één perf-lock.
- Baseline-copy alleen onder ignored tmp/u70/baseline, botbronnen van worktree met sequences.ts/stills.ts uit startcommit 95d172e. web en node_modules symlinks naar dezelfde worktree. Geen track-code teruggedraaid, geen andere renderer/poller gestopt.
- Eerste lokale media-assertie faalde ten onrechte op bytegelijke decoded holdframes: H.264 is lossy en herhaalde bronbeelden decoderen met kleine kwantisatieverschillen. Script gecorrigeerd naar duur/framecount + minimale luminantieverschillen gedurende de hold; code/encoder ongewijzigd. Nog geen media-groenclaim tot nieuwe scriptreceipt.

## 2026-10-09 12:19 UTC — media geverifieerd

- node tmp/u70/verify-media.mjs: waargenomen EXIT 0. MP4s geluidloos H.264, 960×1272, yuv420p, SAR 1:1, 10 fps, alle <3 MB. Regen 71 encoded frames (61 + 10 hold), 7,1 s; beide andere modi 179 frames, 17,9 s.
- PNG-counts 115/169/169; JPEG-counts 85/85/0; volledige matrix 173 media, register/poller-file_id-antwoorden succesvol in mockprime. Hold-decodering verandert alleen door verwaarloosbare H.264-kwantisatie (max gemiddelde luminantieverschil 0,00199407 op schaal 255).
- Visueel bekeken: laatste decoded Regen-videoframe (index 70) toont vr 17:05 = now 14:05 Amsterdam +3 u; Regen-JPEG +12 u toont za 02:05 met daadwerkelijk later regenveld. Geen late stills in MP4. Nationale kaart en regen zichtbaar.
- Herhaling gestart met flock /home/mathijs/motregen-perf.lock bash tmp/u70/compare.sh; baseline en aangepaste volledige generatie achter elkaar in twee nieuwe lege caches. Exacte commando's staan in dat ignored script; host-load aan begin/tussen/eind in tmp/u70/compare-host-load.log.

## 2026-10-09 12:21 UTC — herhaalde vergelijking en warme cache groen

- flock /home/mathijs/motregen-perf.lock bash tmp/u70/compare.sh: waargenomen EXIT 0, twee complete koude generaties op één manifest. Baseline render 71301 ms + mockprime 84 ms = 71385 ms; U70 render 63590 ms + mockprime 78 ms = 63668 ms. Beide 173 media, register-publicatie/lezing en file_id-antwoord gecontroleerd. Geen echte Telegram-call. Eerste verstoorde vergelijking blijft gedocumenteerd; geen geïsoleerde benchmarkclaim.
- Definitieve tabel vóór→ná: Regen frames 169→61, PNGs 169→115, bytes 2882649→1206270, render-ms 56334→31701, encode-ms 1236→552. Temperatuur frames/PNGs 169→169, bytes 2189211→2229636, render 65581→57549, encode 1884→2116. Wind frames/PNGs 169→169, bytes 2157700→2205536, render 56363→44020, encode 2522→2272. Alle 10 fps.
- Nieuwe generatie +15 s manifestcheck laat 131410 ms over voor echte Telegram-prime binnen 210000 ms. Uploads zijn verboden in deze track, dus de echte totale render+uploadduur is niet geverifieerd; alleen render+mockprime gemeten.
- Warme volledige herhaling met MOTREGEN_CHROMIUM_PATH=/missing/u70/chromium: waargenomen EXIT 0, 173 cachehits / 232 ms render + 73 ms mockprime. Geen sequence-open/render-events, dus late stills werken na herstart zonder browser.
- Exacte warme repro: TG_BOT_KEY=x MOTREGEN_BOT_ROLE=combined MOTREGEN_ORIGIN=https://motregen.nl MOTREGEN_CHROMIUM_PATH=/missing/u70/chromium MOTREGEN_RENDER_CACHE=../tmp/u70/compare-after-cache pnpm -C bot render --manifest=../tmp/u70/manifest.json --dry-run-prime=../tmp/u70/warm-register.json
- Docs bevatten tabel, budget/repro en beide vergelijkingen. Productcode onveranderd sinds groene typecheck, 84 unit-tests en build. Laatste stap: doc-commit/push, PR klaar-voor-merge-status met cijfers, remote-head/werkboomcontrole. Geen shell meer actief.

## 2026-10-09 12:23 UTC — klaar voor merge; publicatie afgerond

- Laatste doc-commit 0e64544 gepusht: waargenomen EXIT 0. PR #99 met finale beschrijving/cijfers bijgewerkt: gh pr edit EXIT 0. Lokaal, remote (git ls-remote) en PR-head gelijk: 0e64544a822a6298f2ff2a90940670c0a8eaa144.
- Werkboom schoon (git status --porcelain leeg); diff bevat uitsluitend bot/sequences.ts, bot/sequences.test.ts, bot/stills.ts, bot/render.test.ts, docs/telegram.md. LOG niet tracked (git ls-files --error-unmatch gaf verwachte EXIT 1), git check-ignore bevestigde lokale ignore. Geen task-LOG of meetartefacten op GitHub.
- PR blijft draft voor orkestratorreview, https://github.com/mathijshenquet/motregen/pull/99. Geen gekoppelde CI-checks; groene claims betreffen de waargenomen lokale gates. Niet gemerged.
- U70 klaar voor merge: Regen 61 loopframes / 115 PNGs / 1206270 bytes / 31701 ms render; Temperatuur 169 / 2229636 bytes / 57549 ms; Wind 169 / 2205536 bytes / 44020 ms. Generatie 63590 ms render + 78 ms mockprime. Alle media/knoppen behouden; geen echte uploadtijdclaim, geen poller of prod-uitrol. Alle gestarte shells afgerond met waargenomen exits.

## 2026-10-09 12:25 UTC — slotentry na merge

- Orkestrator meldt U70 op main gemerged als 1a78949. Mergecommit lokaal aanwezig; bericht bevestigt regenloop −2…+3 u, 61 frames, 10 fps, 7,1 s en behoud van stills/tijdknoppen tot +12 u.
- Onafhankelijke gate door de orkestrator: bot typecheck, 84 tests, bot build en web typecheck groen. Deze gate is door de orkestrator uitgevoerd, niet opnieuw door deze worker.
- Op expliciete afsluitinstructie van de orkestrator wordt dit aangevulde LOG nu gecommit en gepusht; die instructie vervangt voor deze afsluiting de eerdere regel om task-LOGs lokaal te houden.
- Track afgerond. Geen verdere productwijzigingen, Telegram-poller, echte uploads of prod-uitrol.
