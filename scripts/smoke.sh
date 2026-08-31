#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "gebruik: $0 ORIGIN_URL" >&2
  exit 2
fi

origin=${1%/}
scratch=$(mktemp -d)
trap 'rm -rf -- "$scratch"' EXIT

request() {
  local name=$1 url=$2
  shift 2
  curl --fail --silent --show-error --location --max-time 20 \
    --dump-header "$scratch/$name.headers" --output "$scratch/$name.body" \
    --write-out '%{http_code}' "$@" "$url"
}

header() {
  local file=$1 name=$2
  awk -v wanted="${name,,}" '
    BEGIN { IGNORECASE = 1 }
    index($0, ":") > 0 && tolower(substr($0, 1, index($0, ":") - 1)) == wanted {
      value = substr($0, index($0, ":") + 1)
      sub(/^[[:space:]]+/, "", value); sub(/[[:space:]\r]+$/, "", value)
      found = value
    }
    END { print found }
  ' "$file"
}

require_contains() {
  local value=$1 expected=$2 label=$3
  if [[ $value != *"$expected"* ]]; then
    echo "$label: verwacht '$expected', kreeg '$value'" >&2
    exit 1
  fi
}

index_status=$(request index "$origin/")
[[ $index_status == 200 ]] || { echo "index: verwacht 200, kreeg $index_status" >&2; exit 1; }

manifest_status=$(request manifest "$origin/data/manifest.json")
[[ $manifest_status == 200 ]] || { echo "manifest: verwacht 200, kreeg $manifest_status" >&2; exit 1; }
jq -e '.version == 0 and (.chunks | length > 0)' "$scratch/manifest.body" >/dev/null
generated_epoch=$(jq -er '.generated | fromdateiso8601' "$scratch/manifest.body")
age_seconds=$(( $(date +%s) - generated_epoch ))
(( age_seconds >= -60 && age_seconds < 900 )) || { echo "manifest is ${age_seconds}s oud; grens is <900s" >&2; exit 1; }

require_contains "$(header "$scratch/manifest.headers" cache-control)" 'public' 'manifest Cache-Control'
require_contains "$(header "$scratch/manifest.headers" cache-control)" 'max-age=15' 'manifest Cache-Control'
require_contains "$(header "$scratch/manifest.headers" cache-control)" 'stale-while-revalidate=60' 'manifest Cache-Control'
[[ -n $(header "$scratch/manifest.headers" etag) ]] || { echo 'manifest: ETag ontbreekt' >&2; exit 1; }
[[ $(header "$scratch/manifest.headers" access-control-allow-origin) == '*' ]] || { echo 'manifest: CORS-header ontbreekt' >&2; exit 1; }
require_contains "$(header "$scratch/manifest.headers" accept-ranges)" 'bytes' 'manifest Accept-Ranges'
exposed=$(header "$scratch/manifest.headers" access-control-expose-headers)
for expected in Accept-Ranges Content-Length Content-Range ETag; do
  require_contains "${exposed,,}" "${expected,,}" 'Access-Control-Expose-Headers'
done

chunk=$(jq -er '.chunks[0].url' "$scratch/manifest.body")
range_status=$(request range "$origin/data/$chunk" --header 'Range: bytes=0-7')
[[ $range_status == 206 ]] || { echo "Range: verwacht 206, kreeg $range_status" >&2; exit 1; }
[[ $(wc -c < "$scratch/range.body") -eq 8 ]] || { echo 'Range: antwoord is niet 8 bytes' >&2; exit 1; }
require_contains "$(header "$scratch/range.headers" content-range)" 'bytes 0-7/' 'Content-Range'
require_contains "$(header "$scratch/range.headers" cache-control)" 'public' 'chunk Cache-Control'
require_contains "$(header "$scratch/range.headers" cache-control)" 'max-age=31536000' 'chunk Cache-Control'
require_contains "$(header "$scratch/range.headers" cache-control)" 'immutable' 'chunk Cache-Control'
[[ -z $(header "$scratch/range.headers" content-encoding) ]] || { echo 'chunk: Content-Encoding moet ontbreken' >&2; exit 1; }

printf 'smoke ok: index=200 manifest=200 age=%ss range=206 chunk=%s\n' "$age_seconds" "$chunk"
