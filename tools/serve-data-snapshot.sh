#!/usr/bin/env bash
# Serveert een datamap (manifest.json, chunks/, regions/) lokaal met de cacheheaders van prod (nix/modules/motregen.nix),
# als data-origin voor `pnpm perf:modes --data http://127.0.0.1:<poort>` (vite proxyt /data/x naar <origin>/x).
# Gebruik: tools/serve-data-snapshot.sh <map> <poort>
set -euo pipefail
dir=$(realpath "${1:?map ontbreekt}")
port="${2:?poort ontbreekt}"
config=$(mktemp --suffix .caddyfile)
cat > "$config" <<CADDY
{
  admin off
  auto_https off
}
http://127.0.0.1:$port {
  root * $dir
  @immutable path /chunks/* /regions/*
  header @immutable Cache-Control "public, max-age=31536000, immutable"
  header /manifest.json Cache-Control "no-store"
  file_server
}
CADDY
exec caddy run --adapter caddyfile --config "$config"
