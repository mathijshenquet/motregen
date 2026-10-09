#!/usr/bin/env bash
set -uo pipefail
measure_label=$1
measure_backend=$2
measure_matrix=$3
measure_directory=$4
if [[ ${5:-all} == 2 ]]; then taskset -pc 0,1 $$; fi
export TG_BOT_KEY=x MOTREGEN_ORIGIN=https://motregen.nl MOTREGEN_RAIN_RENDERER=$measure_backend
export MOTREGEN_CHROMIUM_PATH=/nix/store/j8hc3kdypr2gaa2w3dq0a370lwfzbasf-chromium-151.0.7922.137/bin/chromium
export MOTREGEN_RENDER_CACHE=../tmp/$measure_directory
measure_cgroup=$(awk -F: '$1 == "0" { print $3 }' /proc/self/cgroup)
cat /proc/loadavg > .dev/tracks/u71a-native-regenloop/$measure_label-host.txt
measure_started=$(date +%s%N)
if [[ $measure_matrix == matrix ]]; then
  web/scripts/e2e-slot.sh pnpm -C bot render --matrix --manifest=../.dev/tracks/u71a-native-regenloop/manifest-initial.json > .dev/tracks/u71a-native-regenloop/$measure_label.log 2>&1
else
  web/scripts/e2e-slot.sh pnpm -C bot render --mode=weather --manifest=../.dev/tracks/u71a-native-regenloop/manifest-initial.json > .dev/tracks/u71a-native-regenloop/$measure_label.log 2>&1
fi
measure_status=$?
measure_finished=$(date +%s%N)
cat /proc/loadavg >> .dev/tracks/u71a-native-regenloop/$measure_label-host.txt
printf 'exit=%s\nwall_ms=%s\n' "$measure_status" "$(( (measure_finished - measure_started) / 1000000 ))" > .dev/tracks/u71a-native-regenloop/$measure_label-resource.txt
cat /sys/fs/cgroup$measure_cgroup/cpu.stat >> .dev/tracks/u71a-native-regenloop/$measure_label-resource.txt
printf 'memory_peak_bytes=' >> .dev/tracks/u71a-native-regenloop/$measure_label-resource.txt
cat /sys/fs/cgroup$measure_cgroup/memory.peak >> .dev/tracks/u71a-native-regenloop/$measure_label-resource.txt
exit "$measure_status"
