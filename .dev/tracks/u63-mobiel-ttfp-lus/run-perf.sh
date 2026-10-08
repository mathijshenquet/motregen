#!/usr/bin/env bash
set -euo pipefail

track_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$track_dir/../../../web"
export MOTREGEN_E2E_PORT=4393
export MOTREGEN_E2E_DATA_PORT=8393
if [[ "${1:-}" == '--checks' ]]; then
  shift
  exec flock -w 7200 /home/mathijs/motregen-perf.lock bash -c '
    set -euo pipefail
    pnpm typecheck
    pnpm test
    pnpm build
    exec pnpm perf:mobile "$@"
  ' u63-perf "$@"
fi
exec flock -w 7200 /home/mathijs/motregen-perf.lock pnpm perf:mobile "$@"
