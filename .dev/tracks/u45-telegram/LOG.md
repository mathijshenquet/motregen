# U45 — Telegram

## 2026-10-07T10:55:00Z — Start
- Spec, MIP-17, U44-presets, deployment en privacycontract gelezen. Branch begint op main inclusief U44; werkboom schoon.
- LOG is op expliciet verzoek committed en append-only. `.env` blijft een genegeerde symlink; inhoud/token nooit in output of Git.
- Ontwikkelomgeving gecontroleerd met `direnv exec . bash -c 'printenv PLAYWRIGHT_BROWSERS_PATH; command -v pnpm'`: synchrone exit 0; nixpkgs-Chromium beschikbaar.
- Keuze: kale Bot API met fetch, nationaal kaartbeeld met bijschrift, long polling op productiebox. Inline/groepsknop gebruikt Mini App-deeplink omdat Telegram daar `web_app` verbiedt. Publieke JPEG-cache via Caddy maakt inlinefoto's en edits zonder persoonlijke uploadchat mogelijk.
- Volgende stap: Mini App-bootstrap + still-weergave, coherent eerste commit en vroege draft-PR; preview op 4360.

## 2026-10-07T08:42:15Z — Mini App-bootstrap
- Correctie: de startkop bevatte een handmatig verkeerd gekozen tijd; deze en volgende entries gebruiken de hostklok (UTC).
- SDK wordt uitsluitend bij `?tg=1` geladen; expand/ready, Telegram-thema en compacte startapp-presets toegevoegd. URL-presets blijven leidend; Telegram-thema overschrijft geen opgeslagen browservoorkeur.
- `direnv exec . pnpm --dir web install --frozen-lockfile`: synchrone exit 0. `direnv exec . pnpm --dir web test src/core/telegram-presets.test.ts`: synchrone exit 0, 3 tests.
- Tokencheck via getMe/getWebhookInfo: synchrone exit 0; @motregen_bot bestaat, geen webhook; inline en Main Mini App staan nog uit. PO gevraagd om BotFather-instellingen en rooktestchat; geen chat-id opgeslagen of willekeurige chat gekozen.
- Volgende stap: vroege draft-PR; botpackage, renderer en still-readiness.

## 2026-10-07T08:52:34Z — Bot, renderer en productie-inrichting
- Vroege draft-PR: https://github.com/mathijshenquet/motregen/pull/72; eerste commit `929a41f` gepusht, synchrone exit 0. Afzonderlijke web-typecheck receipt: exit 0.
- pnpm-workspace naar root verplaatst; bot gebruikt fetch + Playwright. Install eerst exit 1 (buildscriptbeleid voor esbuild); bestaand webbeleid naar workspace-root verhuisd, frozen install daarna synchrone exit 0.
- Bot ondersteunt start/menu, chatfoto's, inlinefiltering, modus/tijdknoppen en multipart/in-place edits; inlinefoto's via openbare nationale cache. Renderer pint manifest, wacht op kaartlagen, rendert 900×1200 @2 en logt tijden. Stills hebben geen pin, bediening of analytics.
- Server-side initData-verificatie toegevoegd (HMAC, leeftijd en duplicaten); geen gebruikersopslag. Nix-botpackage/service/Caddy-routes en BotFather/privacydocumentatie toegevoegd; Nix-validatie staat nog open.
- Eerste root-typecheck exit 2 door ES2022/findLast; target gecorrigeerd naar ES2023 voor Node 24. `direnv exec . pnpm typecheck` en `direnv exec . pnpm build`: beide synchrone exit 0. `direnv exec . pnpm --dir bot test`: exit 0, 10 tests.
- PO heeft BotFather ingesteld en /start gestuurd. API-hercheck exit 0: inline=true, miniApp=true. Chat-id wordt uitsluitend voor de aangevraagde rooktest in geheugen gelezen.
- Preview gestart op 4360 vanuit dist-preview met productiedata-proxy; dit is een draaiende server, geen testreceipt. Gerichte desktop-e2e draait op 4361/8361; nog geen receipt.

## 2026-10-07T08:56:04Z — Echte rooktest en eerste gates
- PO vroeg expliciet zijn testchat op schijf te bewaren: `MOTREGEN_SMOKE_CHAT_ID` in genegeerde, gedeelde `.env` gezet (exit 0), waarde nooit gelogd. Dit is de persoonlijke rooktestconfig, geen bot-chatregister.
- `direnv exec . env MOTREGEN_ORIGIN=http://localhost:4360 MOTREGEN_RENDER_CACHE=tmp/telegram-smoke web/scripts/e2e-slot.sh node --env-file=.env bot/dist/bot/smoke.js`: SYNCHRONE EXIT 0. Manifest `2026-10-07T08:51:08Z`; regenbericht id 3, edit naar Wind +1u behoudt id 3; renders 2874 ms en 3843 ms. /start-uitleg + Mini App-knop en setChatMenuButton ook door Telegram geaccepteerd. Nationale JPEGs visueel gecontroleerd.
- Eerste desktop-e2e exit 1 door syntaxfout in nieuwe spec; hersteld. Tweede gerichte run exit 1: 6/8 groen, beide failures omdat isolijnlabels ook MapLibre-markers zijn. Test aangescherpt op locatiepin; tegelijkertijd te brede CSS-markerverberging verwijderd zodat de temperatuur-/druklabels zichtbaar blijven. Renderer-versie opgehoogd om oude still-cache te vermijden.
- Root `pnpm test` exit 1: About-test moet nieuwe privacyregel volgen; twee suites vonden tijdelijk geen synthmanifest door gelijktijdige e2e-synthgen. About aangepast; volgende unit-run pas na synthgen/e2e, zodat geen dataset-race ontstaat.
- Nix-dependencyhash geëxploreerd: verwachte mismatch exit 1, gemeten hash identiek aan bestaande web-hash (Playwright zat al in dependencyset). Bot-build daarna exit 1 in legacy pnpm-deploy door offline metadataresolutie; nu dedicated deploy-lockfile gebruiken. Nix-gate blijft open.
