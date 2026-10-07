# Track U50 — zstd content size

## 2026-10-07T10:06:28Z

- Track gestart vanaf `0ab7807` op `track/u50-zstd-content-size`; worktree was schoon.
- Specificatie, `AGENTS.md` en de actuele projectlog gelezen. De gevraagde U49-log ontbreekt in deze checkout, daarom zoek ik de meting in de bereikbare gitgeschiedenis en leg ik de concrete bron vast.
- `direnv status` toont dat deze nieuwe worktree nog niet is toegestaan; ik activeer de bestaande devenv expliciet voordat ik gates of metingen draai.

## 2026-10-07T10:09:32Z

- De encoder gebruikt nu één `compress_member`-helper met `zstd::bulk::compress` voor bitmap-, predictieve en motion-members; `COMPRESSION_LEVEL` blijft 19. `docs/mrf.md` legt de algemene pledged-content-size-regel vast in plaats van de oude pred-only/bitmap-uitzondering.
- Rusttest toegevoegd die elk bitmap- en motion-member in één MRF op bekende content size controleert en via de gerange-decode byte-identiek terugleest; de predictive test controleert nu ieder pred-member.
- Synchroon receipt: `direnv exec . cargo test -p mrf every_member_pledges_its_content_size_and_roundtrips` → exit 0 (1 test). Volgende stap: bestaande byte-exacte raw/motion-goldens vernieuwen en de volledige MRF-test draaien.

## 2026-10-07T10:12:01Z

- De twee bestaande byte-exacte MRF-goldens zijn herbouwd via hun oude header en gedecodeerde bytes; alleen de zelfstandige zstd-members veranderen, het chunk-contract en de gedecodeerde payload blijven gelijk.
- Synchrone receipts: `direnv exec . cargo fmt` → exit 0; `direnv exec . cargo test -p mrf` → exit 0 (5 unit + 16 integratie-tests); `git diff --check` → exit 0.
- De eerste coherente commit omvat encoder, tests, vernieuwde goldens, documentatie en deze log. Daarna open ik direct de draft-PR; browser- en twee-ingestmetingen blijven als vervolgstap open.
