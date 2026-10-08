#!/usr/bin/env bash
set -euo pipefail

desktop_url=${1:?Usage: desktop-lighthouse.sh URL OUTPUT_PREFIX}
desktop_output=${2:?Missing OUTPUT_PREFIX}
export CHROME_PATH=${CHROME_PATH:-$(node --input-type=module -e 'import { chromium } from "@playwright/test"; process.stdout.write(chromium.executablePath())')}

bash scripts/perf-lock.sh scripts/e2e-slot.sh pnpm dlx lighthouse@13.0.1 "$desktop_url" \
  --preset=desktop --throttling-method=provided --only-categories=performance \
  --screenEmulation.width=1280 --screenEmulation.height=800 \
  --chrome-flags="--headless --no-sandbox --enable-webgl --ignore-gpu-blocklist --use-angle=swiftshader" \
  --output=json --output=html --output-path="$desktop_output" --save-assets --quiet
