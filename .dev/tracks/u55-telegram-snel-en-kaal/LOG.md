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
