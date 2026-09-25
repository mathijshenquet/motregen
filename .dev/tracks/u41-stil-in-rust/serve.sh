#!/usr/bin/env bash
# serve.sh <naam> <poort> (cwd = web/): kopie van dist naar de scratch en een prod-preview erop (oude op die poort weg).
set -eu
S=${U41_SCRATCH:?}
old=$(ss -ltnpH "sport = :$2" | grep -oP 'pid=\K\d+' | head -1 || true)
[ -n "$old" ] && kill "$old" && sleep 1
rm -rf "$S/dist-$1"; cp -r dist "$S/dist-$1"
MOTREGEN_DATA_ORIGIN=http://localhost:8080 nohup pnpm exec vite preview --host 127.0.0.1 --port "$2" --strictPort --outDir "$S/dist-$1" > "$S/preview-$1.log" 2>&1 &
sleep 3; curl -s -o /dev/null -w "preview $1 :$2 → %{http_code}\n" "http://127.0.0.1:$2/"
