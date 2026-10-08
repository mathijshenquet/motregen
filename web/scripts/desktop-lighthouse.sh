#!/usr/bin/env bash
set -euo pipefail

desktop_url=${1:?Usage: desktop-lighthouse.sh URL OUTPUT_PREFIX}
desktop_output=${2:?Missing OUTPUT_PREFIX}
shift 2
export CHROME_PATH=${CHROME_PATH:-$(node --input-type=module -e 'import { chromium } from "@playwright/test"; process.stdout.write(chromium.executablePath())')}

bash scripts/perf-lock.sh scripts/e2e-slot.sh pnpm exec tsx scripts/lighthouse-capture.ts "$desktop_url" "$desktop_output" "$@"
