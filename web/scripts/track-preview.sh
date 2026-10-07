#!/usr/bin/env bash
# Preview van deze branch voor de PO (telefoon): een normale build tegen de productiedata, in
# een eigen map zodat een latere build of rig-run de lopende preview niet overschrijft.
# Gebruik: scripts/track-preview.sh <poort>
set -euo pipefail
port="${1:?poort ontbreekt}"
cd "$(dirname "$0")/.."
pnpm build
rm -rf dist-preview
cp -r dist dist-preview
git rev-parse HEAD > dist-preview/.commit
git diff --quiet HEAD -- src || echo "werkboom wijkt af van HEAD" >> dist-preview/.commit
pkill -f "vite.js preview --outDir dist-preview .*--port ${port} " || true
MOTREGEN_DATA_ORIGIN=https://motregen.nl/data setsid nohup pnpm exec vite preview --outDir dist-preview --host 0.0.0.0 --port "${port}" --strictPort > "tmp/preview-${port}.log" 2>&1 < /dev/null &
echo "preview op :${port} serveert $(head -1 dist-preview/.commit)"
