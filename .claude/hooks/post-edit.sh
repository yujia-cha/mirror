#!/usr/bin/env bash
# PostToolUse(Edit|Write|MultiEdit): run the cheapest check that covers the edited file.
# Exit 2 blocks and feeds stderr back to Claude; exit 0 is silent success.
set -uo pipefail
cd "$(dirname "$0")/../.." || exit 0

payload=$(cat)
file=$(printf '%s' "$payload" | node -e "
let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{
  try { const j=JSON.parse(s); process.stdout.write(j.tool_input?.file_path ?? j.tool_input?.filePath ?? ''); }
  catch { process.stdout.write(''); }
});" 2>/dev/null)

[ -z "$file" ] && exit 0
rel=${file#"$PWD/"}

run() {
  local label=$1; shift
  local out
  if ! out=$("$@" 2>&1); then
    printf '%s failed for %s:\n%s\n' "$label" "$rel" "$out" >&2
    exit 2
  fi
}

case "$rel" in
  public/data/*)
    echo "public/data is generated — edit scripts/build-data.ts or data/curated/ and run: npm run data:build" >&2
    exit 2
    ;;
  data/raw/*)
    echo "data/raw is vendored source data — it is overwritten by npm run data:fetch. Put corrections in data/curated/." >&2
    exit 2
    ;;
  data/curated/*.json|scripts/*.ts)
    [ -f public/data/meta.json ] || exit 0
    run "data validation" npm run -s data:validate
    ;;
  src/core/*)
    run "core tests" npx vitest run src/core --reporter=dot --passWithNoTests
    ;;
  src/*.ts|src/*.tsx|src/**/*.ts|src/**/*.tsx|tests/*.ts|tests/*.tsx)
    run "typecheck" npx tsc --noEmit
    ;;
esac

exit 0
