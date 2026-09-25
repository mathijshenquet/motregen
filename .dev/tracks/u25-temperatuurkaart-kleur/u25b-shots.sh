#!/usr/bin/env bash
set -u
cd "$(dirname "$0")/.."
status=0
run() { node tmp/u25.mjs "$@" 2>&1 | grep -v Skipping; [ "${PIPESTATUS[0]}" -eq 0 ] || status=1; }
for scheme in light dark; do
  for device in desktop pixel5; do
    run http://127.0.0.1:4372 tmp/shots b-before-$device-$scheme $scheme $device -
    run http://127.0.0.1:4371 tmp/shots b-after-$device-$scheme $scheme $device -
  done
  run http://127.0.0.1:4371 tmp/shots b-fill-050-$scheme $scheme desktop 0.5
  run http://127.0.0.1:4371 tmp/shots b-fill-090-$scheme $scheme desktop 0.9
  run http://127.0.0.1:4373 tmp/shots b-cold-desktop-$scheme $scheme desktop -
done
run http://127.0.0.1:4373 tmp/shots b-cold-pixel5-light light pixel5 -
for fill in 0.7 0.9; do CLIP=280,280,300,220 DPR=2 run http://127.0.0.1:4371 tmp/shots b-names-${fill/./}-light light desktop $fill; done
exit $status
