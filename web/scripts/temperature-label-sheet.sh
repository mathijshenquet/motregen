#!/usr/bin/env bash
# Vergelijkingsblad U100 ronde 3: de vier templabels-varianten 2×2 per apparaat, met de naam erop.
# Gebruik: scripts/temperature-label-sheet.sh DIR [VOORVOEGSEL]   (na temperature-scale-shot.ts … templabels)
set -euo pipefail
dir=$1
prefix=${2:-}
font=$(fc-match -f '%{file}' 'DejaVu Sans')
for device in desktop telefoon; do
  inputs=()
  filters=''
  index=0
  for look in lijn plekken vlakken plekken-half; do
    inputs+=(-i "$dir/${prefix}templabels-$device-$look.png")
    filters+="[$index:v]drawtext=fontfile=$font:text='$look':x=12:y=h-th-34:fontsize=28:fontcolor=white:box=1:boxcolor=black@0.6:boxborderw=8[v$index];"
    index=$((index + 1))
  done
  ffmpeg -loglevel error -y "${inputs[@]}" -filter_complex \
    "${filters}[v0][v1][v2][v3]xstack=inputs=4:layout=0_0|w0_0|0_h0|w0_h0:fill=white" \
    -frames:v 1 "$dir/${prefix}blad-$device.png"
  echo "$dir/${prefix}blad-$device.png"
done
