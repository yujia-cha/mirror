#!/usr/bin/env bash
# Stop: warn (never block) when the generated data is older than its inputs.
set -uo pipefail
cd "$(dirname "$0")/../.." || exit 0

# The output is split by season; only the season the raw data describes is rebuilt, so its
# meta.json is the newest one. Compare the inputs against that.
newest_built=$(ls -t public/data/md*/meta.json 2>/dev/null | head -1)
[ -n "$newest_built" ] || exit 0

newest_input=$(find data/raw data/curated scripts -type f \( -name '*.json' -o -name '*.ts' \) -newer "$newest_built" 2>/dev/null | head -1)

if [ -n "$newest_input" ]; then
  echo "[stop] public/data is older than ${newest_input} — run: npm run data:build"
fi

exit 0
