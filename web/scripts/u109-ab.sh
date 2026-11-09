#!/usr/bin/env bash
# U109: gepaarde A/B-meting van twee vaste builds met de U102-suite (perf:modes), om en om A1 B1 A2 B2 ...
# Gebruik (vanuit web/): scripts/u109-ab.sh <dist-A> <dist-B> <uitvoermap> [herhalingen=3] [profielen=telefoon,desktop] [modi=weer]
# Data komt van productie (MOTREGEN_DATA_ORIGIN, standaard https://motregen.nl/data); elk bezoek koud+warm met trace.
set -euo pipefail
dist_a=$(realpath "$1"); dist_b=$(realpath "$2"); out=$(realpath -m "$3")
repeat=${4:-3}; profiles=${5:-telefoon,desktop}; modes=${6:-weer}
data=${MOTREGEN_DATA_ORIGIN:-https://motregen.nl/data}
# Buiten 4400–4899: die reeks hashen de rigs per worktree, een bezette poort zou andermans server meten.
port_a=${U109_PORT_A:-4911}; port_b=${U109_PORT_B:-4912}
mkdir -p "$out"
pids=()
cleanup() { for pid in "${pids[@]}"; do kill -- "-$pid" 2>/dev/null || true; done; }
trap cleanup EXIT
for side in a b; do
  dist_var=dist_$side; port_var=port_$side
  setsid env MOTREGEN_DATA_ORIGIN="$data" pnpm exec vite preview --outDir "${!dist_var}" --host 127.0.0.1 --port "${!port_var}" --strictPort >"$out/preview-$side.log" 2>&1 &
  pids+=($!)
done
for side in a b; do
  port_var=port_$side
  for _ in $(seq 60); do curl -sf -o /dev/null "http://127.0.0.1:${!port_var}/" && break; sleep 0.5; done
  if grep -q "already in use" "$out/preview-$side.log" || ! kill -0 "${pids[$([[ $side == a ]] && echo 0 || echo 1)]}" 2>/dev/null; then
    echo "U109-AB preview $side op poort ${!port_var} niet zelf gestart (bezet?)" >&2; exit 2
  fi
done
for run in $(seq "$repeat"); do
  for side in A B; do
    port=$port_a; [[ $side == B ]] && port=$port_b
    status=0
    MOTREGEN_PERF_PAIRED_RUN=1 MOTREGEN_PERF_MODES_TRACE_COLD=1 pnpm -s perf:modes --origin "http://127.0.0.1:$port" --modes "$modes" --profiles "$profiles" --no-interactions --trace 2>&1 | tee "$out/$side$run.log" || status=${PIPESTATUS[0]}
    produced=$(grep -oP '; uitvoer \K\S+' "$out/$side$run.log" | head -1)
    if [[ -n $produced && -d $produced ]]; then mv "$produced" "$out/$side$run"; fi
    echo "U109-AB $side$run exit $status"
  done
done
