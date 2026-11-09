#!/usr/bin/env bash
# Noto Sans voor kaartlabels (U107, docs/kaartstijl.md): dezelfde letter als de plaatsnamen van de basiskaart.
# - web: variabele subset (wght 400–800), alleen wat kaartgetallen gebruiken → web/src/assets/fonts/
# - bot: statische Regular en ExtraBold, Latijn → crates/render-core/assets/
# Bron: nixpkgs#noto-fonts (OFL 1.1). Gebruik: tools/fonts/build.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
store=$(nix build --no-link --print-out-paths nixpkgs#noto-fonts)
source="$store/share/fonts/noto/NotoSans.ttf"
scratch=$(mktemp -d)
trap 'rm -rf "$scratch"' EXIT
tools() { uv run --quiet --with fonttools --with brotli "$@"; }
# Kaartgetallen: cijfers, graden, min, plus, spatie, punt/komma en de Bft-afkorting.
digits='U+0020,U+002B-002E,U+0030-0039,U+00B0,U+2212,U+0042,U+0066,U+0074'
tools fonttools varLib.instancer "$source" wght=400:800 wdth=100 -o "$scratch/web.ttf"
mkdir -p web/src/assets/fonts
tools pyftsubset "$scratch/web.ttf" --unicodes="$digits" --layout-features='tnum,kern' --flavor=woff2 \
  --output-file=web/src/assets/fonts/noto-sans-kaart.woff2
latin='U+0020-007E,U+00A0-00FF,U+2212,U+2013,U+2014,U+2019'
for weight in 400:Regular 800:ExtraBold; do
  tools fonttools varLib.instancer "$source" "wght=${weight%%:*}" wdth=100 -o "$scratch/${weight##*:}.ttf"
  tools pyftsubset "$scratch/${weight##*:}.ttf" --unicodes="$latin" --layout-features='kern' \
    --output-file="crates/render-core/assets/NotoSans-${weight##*:}.ttf"
done
cp web/public/basemap/fonts/OFL.txt crates/render-core/assets/NotoSans-LICENSE.txt
cp web/public/basemap/fonts/OFL.txt web/src/assets/fonts/OFL.txt
ls -l web/src/assets/fonts crates/render-core/assets/NotoSans-*
