#!/usr/bin/env bash
# Stop: warn (never block) when the generated data is older than its inputs.
set -uo pipefail
cd "$(dirname "$0")/../.." || exit 0

newest_input=$(find data/raw data/curated scripts -type f \( -name '*.json' -o -name '*.ts' \) -newer public/data/meta.json 2>/dev/null | head -1)

if [ -n "$newest_input" ]; then
  echo "[stop] public/data is older than ${newest_input} — run: npm run data:build"
fi

exit 0
