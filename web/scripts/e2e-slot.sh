#!/usr/bin/env bash
# Twee e2e-slots per host (PO 2026-09-25): één Chromium-suite per slot. flock kent geen
# telling, dus: beide slots zonder wachten proberen (-E 75 = slot bezet, onderscheiden van een
# echte testfout) en anders polsen.
set -u
playwright_command=false
explicit_project=false
firefox_project=false
previous_argument=''
for argument in "$@"; do
  if [[ $argument == playwright ]]; then playwright_command=true; fi
  if [[ $argument == --project || $argument == --project=* ]]; then explicit_project=true; fi
  if [[ $argument == --project=firefox || ($previous_argument == --project && $argument == firefox) ]]; then firefox_project=true; fi
  previous_argument=$argument
done
# Firefox heeft voor WebGL een echte X/EGL-context nodig; headless Gecko mist die op de Nix-devhost.
if $playwright_command && { $firefox_project || ! $explicit_project; } && [[ -z ${DISPLAY:-} ]]; then
  exec xvfb-run -a bash "$0" "$@"
fi
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
