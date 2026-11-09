#!/usr/bin/env bash
# U109: volledige meetwachtrij, gepoort op loadavg ≤ 16 per opname (perf-lock wacht buiten de lock).
# Gebruik (vanuit web/): scripts/u109-queue.sh <dist-A> <dist-B> <uitvoermap>
set -uo pipefail
dist_a=$1; dist_b=$2; out=$(realpath -m "$3")
export MOTREGEN_PERF_PAIRED_RUN=1 MOTREGEN_PERF_LOAD_WAIT_MINUTES=${MOTREGEN_PERF_LOAD_WAIT_MINUTES:-240}
mkdir -p "$out"
serve() { setsid env MOTREGEN_DATA_ORIGIN=https://motregen.nl/data pnpm exec vite preview --outDir "$1" --host 127.0.0.1 --port "$2" --strictPort > /dev/null 2>&1 & echo $!; }
wait_up() { for _ in $(seq 60); do curl -sf -o /dev/null "http://127.0.0.1:$1/" && return; sleep 0.5; done; }
modes_run() { # <label> <port> <args...>
  local label=$1 port=$2; shift 2
  pnpm -s perf:modes --origin "http://127.0.0.1:$port" "$@" > "$out/$label.log" 2>&1; echo "U109-QUEUE $label exit $?"
  local produced; produced=$(grep -oP '; uitvoer \K\S+' "$out/$label.log" | head -1)
  [[ -n $produced && -d $produced ]] && mv "$produced" "$out/$label"
}
pid_a=$(serve "$dist_a" 4493); pid_b=$(serve "$dist_b" 4494); wait_up 4493; wait_up 4494
# 1. Laagmatrix: alle modi, telefoon en desktop, koud/warm, met wissels en rust.
modes_run matrix 4494 --modes all --profiles telefoon,desktop
# 2. Fasekosten per bronbestand: A en B om en om, Weer en Wind, met CPU-profiel en trace door de interacties.
for side in A B; do
  port=4493; [[ $side == B ]] && port=4494
  MOTREGEN_PERF_MODES_CPU_PROFILE=1 MOTREGEN_PERF_MODES_TRACE_ALL=1 modes_run "kosten-$side" "$port" --modes weer,wind --profiles telefoon,desktop --trace
done
kill -- "-$pid_a" "-$pid_b" 2>/dev/null
# 3. Bytes en ttfp, gepaard ×3.
scripts/u109-ab.sh "$dist_a" "$dist_b" "$out/ab" 3 telefoon,desktop weer > "$out/ab.log" 2>&1; echo "U109-QUEUE ab exit $?"
