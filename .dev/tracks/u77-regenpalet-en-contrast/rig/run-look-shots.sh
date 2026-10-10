#!/usr/bin/env bash
# U77: de hele beeldmatrix. Gebruik vanuit web/: tmp/u77/run-look-shots.sh <paletten|mengingen|stad> [baseURL]
# Radar: een vaste kaarttijd met lichte én zware regen (U77_RADAR_TIME); de nachtversie daarvan is het vaste donkere
# thema, want een radartijd overdag heeft geen nacht. HARMONIE begint ruim 6 uur vooruit (daarvoor loopt de blend):
# +9 u valt vanmiddag in de nacht, +23 u morgen overdag.
set -u
group="${1:?paletten, mengingen of stad}"
base="${2:-http://127.0.0.1:4320}"
radar_time="${U77_RADAR_TIME:-2026-10-10T1415}"
palettes='huidig/huidig,blauw-grijs-rood/huidig,huidig/drempel,blauw-grijs-rood/drempel,blauw-violet-rood/drempel,oplopend-donker/drempel'
blends='blauw-grijs-rood/huidig,blauw-grijs-rood/zuiver,blauw-grijs-rood/steil,blauw-grijs-rood/drempel,blauw-grijs-rood/rand'
failures=0
shoot() { pnpm exec tsx tmp/u77/look-shots.ts "$base" "$@" 2>&1 | grep -E '\.png ·' || failures=$((failures + 1)); }
for device in 1280 390; do
  case "$group" in
    paletten|mengingen)
      if [ "$group" = paletten ]; then looks="$palettes"; else looks="$blends"; fi
      U77_TIME="$radar_time" shoot "$group-radar" "$device" dag 0 - "$looks"
      U77_TIME="$radar_time" shoot "$group-radar" "$device" nacht-vast 0 - "$looks"
      shoot "$group-harmonie" "$device" nacht "${U77_NIGHT_HOURS:-9}" - "$looks"
      shoot "$group-harmonie" "$device" dag "${U77_DAY_HOURS:-23}" - "$looks"
      ;;
    stad)
      U77_TIME="$radar_time" shoot mengingen-stad-radar "$device" dag 0 5.3,52.1,9 "$blends"
      U77_TIME="$radar_time" shoot mengingen-stad-radar "$device" nacht-vast 0 5.3,52.1,9 "$blends"
      ;;
    *) echo "onbekende groep $group"; exit 2 ;;
  esac
done
echo "U77-SHOTS-FAILURES: $failures"
