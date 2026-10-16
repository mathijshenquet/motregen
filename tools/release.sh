#!/usr/bin/env bash
set -euo pipefail
repository_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
exec pnpm --dir "$repository_root/web" exec tsx "$repository_root/tools/release.ts" "$@"
