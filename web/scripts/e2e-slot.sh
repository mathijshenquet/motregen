#!/usr/bin/env bash
# Twee e2e-slots per host (PO 2026-09-25): één Chromium-suite per slot. flock kent geen
# telling, dus: beide slots zonder wachten proberen (-E 75 = slot bezet, onderscheiden van een
# echte testfout) en anders polsen.
set -u
while true; do
  for slot in 1 2; do
    # -o: de lock-fd niet doorgeven aan het kind, anders houdt een verweesde Playwright-webserver
    # (vite preview) het slot vast nadat de suite klaar is (gezien 2026-09-25, 1 uur blokkade).
    flock -n -o -E 75 "/tmp/motregen-e2e-slot$slot.lock" "$@"
    status=$?
    [ "$status" -ne 75 ] && exit "$status"
  done
  sleep 5
done
