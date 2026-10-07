# U55 — Telegram snel en kaal

## 2026-10-07T11:07:46Z — Start en PO-aanvulling
- Trackspec, AGENTS.md, MIP-17, Telegram-documentatie, botcode, still-route en U45-LOG gelezen. Werkboom schoon op `track/u55-telegram-snel-en-kaal`, main inclusief U55-spec.
- LOG wordt op expliciet PO-verzoek committed, append-only en met UTC-hosttimestamps bijgehouden. Scratchbestanden staan onder `tmp/` (`git check-ignore tmp/u55`: exit 0).
- Ontwikkelomgeving actief via `direnv exec .`; DEVENV_ROOT wijst naar deze worktree, pnpm en nixpkgs-Playwright beschikbaar. Synchrone exit 0.
- PO-aanvulling: Wind uit stills/commando's/knoppen; drie modi en vier tijden (nu/+3u/+6u/+12u), matrix 12. Eerste coherente commit bevat dit kleinere contract, gevolgd door vroege draft-PR.
- Volgende stappen: oude JPEG-maten/bytes meten zonder Telegram-verzoeken; file_id-cache en no-op implementeren; kale overlay en lichter beeld visueel beoordelen; gates. Preview op 4365. Vóór Telegram-rooktest exact “rooktest klaar om te starten” melden; wachten tot de orkestrator zijn poller heeft gestopt.

## 2026-10-07T11:10:40Z — Kleiner selectiecontract en eerste gates
- STILL_MODES beperkt tot Regen/Lucht/Gevoel, STILL_HOURS tot 0/3/6/12. Keyboard bestaat uit modusrij (3), tijdrij (4) en app-link; oude callbackwaarden worden afgewezen. Commando-uitleg, rooktestselectie en docs aangepast.
- `direnv exec . pnpm --dir bot test`: SYNCHRONE EXIT 0, 10/10. `direnv exec . pnpm build`: SYNCHRONE EXIT 0. Dit controleert het eerste selectiecontract; verdere implementatie/gates staan open.
- Productie-Chromium-pad bepaald met `nix eval --raw .#nixosConfigurations.motregen.config.systemd.services.motregen-bot.environment.MOTREGEN_CHROMIUM_PATH`: SYNCHRONE EXIT 0. Preview draait op 4365 vanuit dist-preview; baseline-render-only gestart, geen Telegram-verzoeken/poller.
- Officiële Bot API gecontroleerd: inline-edits mogen uitsluitend file_id of URL gebruiken (geen nieuwe upload); InlineQueryResultCachedPhoto gebruikt photo_file_id. Daarom cached inline waar al een chat-upload bestaat, anders publieke URL op HTTPS; lokale inline eerst opwarmen met chatfoto's.

## 2026-10-07T11:16:25Z — Cache, no-op, beeld en scope-uitbreiding
- Draft-PR #80 vroeg geopend: https://github.com/mathijshenquet/motregen/pull/80. Eerste commit ba0e9ea; commit/push/PR-create synchrone exit 0. Correctie vorige timestamp: die handmatig gekozen kop lag vooruit; huidige/vervolgkoppen gebruiken de actuele UTC-hostklok.
- FileIdCache bewaart grootste Telegram-foto-id in geheugen en atomair naast de JPEG; botnaam en renderkey worden gecontroleerd, JPEG-leeftijd begrenst tot 2 uur. Keys omvatten modus/tijd/manifest-generated/renderer-versie. Chatfoto's en edits hergebruiken ids; inline gebruikt photo_file_id op hits. Geen identifiers naar schijf.
- MessageSelections onthoudt berichten maximaal 2 uur. Dezelfde renderkey geeft “Al in beeld” zonder render/edit. Telegram's specifieke not-modified-respons wordt ook stil afgehandeld; andere 400-fouten blijven fouten.
- Kale overlay en verklarend bijschrift per STILL_MODES toegevoegd. Eerste kandidaat: 960×1280 @1, kwaliteit 85. Baseline 1800×2400 @2, kwaliteit 88: Regen 431504 B, Lucht 403011 B, Gevoel 446219 B, manifest 2026-10-07T11:08:58Z. Vergelijkingsrenders pinnen hetzelfde manifest.
- Eerste baseline-scratchrun exit 1 door ontbrekende Playwright-module na dist-kopie; node_modules-symlink/package.json hersteld, tweede render-only SYNCHRONE EXIT 0. Drie nieuwe vergelijkingsrenders SYNCHRONE EXIT 0.
- `direnv exec . pnpm --dir bot test`: SYNCHRONE EXIT 0, 20/20. `direnv exec . pnpm build`: SYNCHRONE EXIT 0. `direnv exec . pnpm typecheck`: SYNCHRONE EXIT 0.
- `nix build .#checks.x86_64-linux.nixos-vm --no-link`: SYNCHRONE EXIT 1 doordat nieuwe modules nog untracked waren en dus buiten de Nix-flakebron vielen; stage gevolgd door herhaling nodig.
- Orkestrator heeft zijn lokale poller gestopt en geeft toestemming voor rooktest. Eerst punten 1–5 afronden/proberen, daarna PO-uitbreiding 6–9. Aanvulling vanaf origin/main gelezen: framereeksen + H.264-loops via ffmpeg; latere PO-precisering: Regen/Lucht/Gevoel elk loop+4 stills, Wind uitsluitend loop. Regenpass bevat extra +3/+6/+12-frames voor stills buiten het -2…+2-loopbereik. Geen aparte still-renders in eindimplementatie.
- PO vroeg profielfoto: bestaande droplet.svg omgezet naar 512×512 JPEG en setMyProfilePhoto uitgevoerd; SYNCHRONE EXIT 0, API ok=true. Geen token in output/Git.

## 2026-10-07T11:18:49.036Z — Definitieve beeldkeuze
- DPR 1 en 1,5 visueel vergeleken bij hetzelfde manifest. Keuze 640×848 @1,5 → 960×1272 JPEG, kwaliteit 85: duidelijk grotere/scherpe plaats- en contourlabels op telefoonformaat, minder kaartdetails. Bytes Regen 431504→176523 (−59,1 %), Lucht 403011→154635 (−61,6 %), Gevoel 446219→182975 (−59,0 %). DPR-1-kandidaat was 197289–229033 B. Alle drie renders van beide kandidaten SYNCHRONE EXIT 0. Rendererkey nu versie 4 om de gewijzigde viewport te isoleren.
- Nix-VM na staging nieuwe modules: SYNCHRONE EXIT 0. Definitieve viewport/rooktest zijn daarna nog gewijzigd; gate opnieuw op de fase-1-commit nodig.
- Volgende stap: definitieve build/typecheck, gerichte desktop-e2e, matrix en rooktest, fase-1-bot beschikbaar maken.
