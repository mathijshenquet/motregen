#!/usr/bin/env bash
set -euo pipefail

track_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$track_dir/../../../web"
export MOTREGEN_E2E_PORT=4393
export MOTREGEN_E2E_DATA_PORT=8393
if [[ "${1:-}" == '--checks' ]]; then
  shift
  pnpm typecheck
  pnpm test
  pnpm build
fi
exec pnpm perf:mobile "$@"
