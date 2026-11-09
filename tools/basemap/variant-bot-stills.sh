#!/usr/bin/env bash
# U108: botstills (weer + wind, dag + nacht) per kaartvariant met de Rust-renderer.
# Vooraf: data-snapshot in DATA (manifest.json + chunks/ van motregen.nl/data) en platen uit
# bot/basemap-variant-plates.ts in PLATES/<variant>. Gebruik: bash tools/basemap/variant-bot-stills.sh DATA PLATES OUT
set -euo pipefail
cd "$(dirname "$0")/../.."
data="$1"; plates="$2"; out="$3"
cargo build --release -p render --quiet
mkdir -p "$out"
for variant in ${MOTREGEN_KAART_VARIANTEN:-nu licht licht-rivieren atlas strak}; do
  for mode in weather wind; do
    rm -rf "$out/render/$variant-$mode"; mkdir -p "$out/render/$variant-$mode"
    target/release/motregen-render --data-dir "$data" --basemap-dir "$plates/$variant" --mode "$mode" \
      --out-dir "$out/render/$variant-$mode" --manifest "$data/manifest.json" > /dev/null
  done
  # Weer: eerste still (dag) en de laatste die 's nachts valt; wind: frame 8 (begin, dag) en 188 (eind, avond).
  stills=("$out/render/$variant-weather"/weather-*.jpg)
  ffmpeg -loglevel error -y -i "${stills[0]}" "$out/$variant-weather-light.png"
  ffmpeg -loglevel error -y -i "${stills[-1]}" "$out/$variant-weather-dark.png"
  ffmpeg -loglevel error -y -i "$out/render/$variant-wind/wind-loop.mp4" -vf 'select=eq(n\,8)' -frames:v 1 "$out/$variant-wind-light.png"
  ffmpeg -loglevel error -y -i "$out/render/$variant-wind/wind-loop.mp4" -vf 'select=eq(n\,188)' -frames:v 1 "$out/$variant-wind-dark.png"
done
