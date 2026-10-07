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
