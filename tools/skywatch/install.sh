#!/usr/bin/env bash
set -euo pipefail

script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
repo_root=$(cd -- "$script_dir/../.." && pwd)
env_file="$repo_root/.env"
unit_dir="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"

if [[ ! -f "$env_file" ]]; then
  echo "Ontbrekend $env_file" >&2
  exit 1
fi
if ! grep -q '^KNMI_OPEN_DATA_API_KEY=' "$env_file"; then
  echo "KNMI_OPEN_DATA_API_KEY ontbreekt in $env_file" >&2
  exit 1
fi

uv_path=$(command -v uv)
pnpm_path=$(command -v pnpm)
h5dump_path=$(command -v h5dump)
mkdir -p "$unit_dir"
sed \
  -e "s|@REPO_ROOT@|$repo_root|g" \
  -e "s|@ENV_FILE@|$env_file|g" \
  -e "s|@PROJECT@|$script_dir|g" \
  -e "s|@UV@|$uv_path|g" \
  -e "s|@PNPM@|$pnpm_path|g" \
  -e "s|@H5DUMP@|$h5dump_path|g" \
  "$script_dir/systemd/skywatch.service.in" > "$unit_dir/skywatch.service"
install -m 0644 "$script_dir/systemd/skywatch.timer" "$unit_dir/skywatch.timer"
systemctl --user daemon-reload
systemctl --user enable --now skywatch.timer
systemctl --user start skywatch.service
systemctl --user --no-pager status skywatch.timer skywatch.service
