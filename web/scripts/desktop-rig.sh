#!/usr/bin/env bash
set -euo pipefail

output_prefix=${1:?Usage: bash scripts/desktop-rig.sh OUTPUT_PREFIX [desktop-start.ts options]}
shift
mkdir -p "$(dirname "$output_prefix")"
export MOTREGEN_E2E_PORT=${MOTREGEN_E2E_PORT:-4394}
export MOTREGEN_E2E_DATA_PORT=${MOTREGEN_E2E_DATA_PORT:-8394}
export MOTREGEN_MOBILE_FIXTURE_DIR="tmp/desktop-start/fixture-$MOTREGEN_E2E_DATA_PORT"
export MOTREGEN_RIG_DIST="tmp/desktop-start/dist-$MOTREGEN_E2E_PORT"
export MOTREGEN_MOBILE_BASEMAP=own

MOTREGEN_SYNTH_DIR="$MOTREGEN_MOBILE_FIXTURE_DIR" pnpm synthgen
pnpm exec tsx scripts/mobile-fixture.ts
pnpm build --outDir "$MOTREGEN_RIG_DIST"
pnpm exec tsx scripts/mobile-assets.ts

caddy run --config perf/Caddyfile > "$output_prefix-data-server.txt" 2>&1 &
desktop_data_pid=$!
caddy run --config perf/Preview.Caddyfile > "$output_prefix-preview-server.txt" 2>&1 &
desktop_preview_pid=$!
trap 'kill "$desktop_data_pid" "$desktop_preview_pid" 2>/dev/null || true; wait "$desktop_data_pid" "$desktop_preview_pid" 2>/dev/null || true' EXIT

for attempt in $(seq 1 80); do
  if curl --silent --fail "http://127.0.0.1:$MOTREGEN_E2E_PORT/" > /dev/null; then break; fi
  sleep 0.25
done
bash scripts/perf-lock.sh scripts/e2e-slot.sh pnpm exec tsx scripts/desktop-start.ts "http://127.0.0.1:$MOTREGEN_E2E_PORT" "$output_prefix" "$@"
