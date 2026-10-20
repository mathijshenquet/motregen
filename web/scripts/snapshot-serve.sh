#!/usr/bin/env bash
# Bevroren reproductie: serveer een datasnapshot (manifest + chunks van prod) en een build van deze checkout ertegen.
# Gebruik: scripts/snapshot-serve.sh <snapshotmap> <app-poort> <data-poort>
set -euo pipefail
snapshot="$(realpath "${1:?snapshotmap ontbreekt}")"
app_port="${2:?app-poort ontbreekt}"
data_port="${3:?data-poort ontbreekt}"
cd "$(dirname "$0")/.."
config="tmp/snapshot-${data_port}.Caddyfile"
mkdir -p tmp
cat > "$config" <<CADDY
{
	auto_https off
	admin off
}
:${data_port} {
	header {
		Access-Control-Allow-Origin "*"
		Access-Control-Expose-Headers "Accept-Ranges, Content-Length, Content-Range, ETag"
		Accept-Ranges "bytes"
		Cache-Control "no-store"
	}
	header /chunks/* -Content-Encoding
	handle /basemap/* {
		uri strip_prefix /basemap
		root * $(realpath ../tools/basemap/tiles)
		file_server
	}
	handle {
		root * ${snapshot}
		file_server
	}
}
CADDY
pkill -f "caddy run --config ${config}" || true
pkill -f "vite.js preview --outDir dist .*--port ${app_port} " || true
setsid nohup caddy run --config "$config" --adapter caddyfile > "tmp/snapshot-data-${data_port}.log" 2>&1 < /dev/null &
MOTREGEN_DATA_ORIGIN="http://localhost:${data_port}" setsid nohup pnpm exec vite preview --outDir dist --host 0.0.0.0 --port "${app_port}" --strictPort > "tmp/snapshot-app-${app_port}.log" 2>&1 < /dev/null &
echo "app op :${app_port}, data uit ${snapshot} op :${data_port}"
