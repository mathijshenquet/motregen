# Data lokaal serveren

`Caddyfile.dev` serveert alleen `manifest.json` en `chunks/*` uit de datamap
op poort 8080. De interne `.ingest-cache` is daardoor niet via HTTP
bereikbaar. Caddy levert voor bestanden automatisch ETags en byte ranges;
de configuratie zet daarnaast het MIP-3-contract expliciet:

- chunks: `Cache-Control: public, max-age=31536000, immutable`;
- manifest: `Cache-Control: public, max-age=15, stale-while-revalidate=60`;
- `Access-Control-Allow-Origin: *` en de relevante range/ETag-headers exposed;
- `Accept-Ranges: bytes` en geen `Content-Encoding` op al zstd-gecomprimeerde
  mrf-chunks.

Start vanuit de repository nadat direnv de devenv heeft geladen:

```sh
cargo run --release -p motregen-ingest
caddy run --config Caddyfile.dev
```

Een afwijkende datamap kan voor beide processen gedeeld worden:

```sh
export MOTREGEN_DATA_DIR="$PWD/data/poke"
cargo run --release -p motregen-ingest
caddy run --config Caddyfile.dev
```

Snelle header- en Range-controle:

```sh
curl -i http://localhost:8080/manifest.json
curl -i -H 'Range: bytes=0-7' \
  http://localhost:8080/chunks/rtcor-YYYYMMDDTHHMM.mrf
```
