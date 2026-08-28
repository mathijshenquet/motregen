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

Chunknamen eindigen vóór `.mrf` op een generatiesuffix `-g<16 hex-cijfers>`.
Die suffix is deterministisch afgeleid van een expliciete
containerformatgeneratie, het veld, de volledige griddefinitie en de volledige
kwantisatietabel. Een grid- of quantisatiewijziging levert daardoor automatisch
een nieuwe URL op; bij een andere containerlayout moet de formatgeneratie in de
ingestcode worden verhoogd. Oude immutable browser-/CDN-cacheobjecten blijven zo
bij hun oude manifest horen. De publisher blijft een byteverschil onder exact
dezelfde naam hard weigeren: dat bewaakt fouten binnen één generatie.

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
  http://localhost:8080/chunks/rtcor-YYYYMMDDTHHMM-h3-gXXXXXXXXXXXXXXXX.mrf
```
